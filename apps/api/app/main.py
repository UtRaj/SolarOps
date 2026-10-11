from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
import math
from collections import Counter
from datetime import datetime, timezone
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from apps.api.app.config import settings
from apps.api.app.infrastructure.database.session import get_db, database_is_ready, close_database
from apps.api.app.infrastructure.database.models import (
    AlertModel, BatteryPackModel, BessUnitModel, DeadLetterEventModel,
    ChargerBayModel, DeliveryPointModel, GridStationModel, OrderModel, OrderStopModel,
    OutboxEventModel, SolarFarmModel, TruckModel,
)
from apps.api.app.infrastructure.redis.service import redis_client
from apps.api.app.schemas.domain import (
    SolarFarmScaleRequest,
    BatteryPackResponse,
    BatterySwapRequest,
    BatterySwapResponse,
    TruckResponse,
    DispatchTruckRequest,
    DispatchTruckResponse,
    QuoteRequest,
    QuoteResponse,
    CreateOrderRequest,
    OrderResponse,
    OrderStopResponse,
    AlertResponse,
    OutboxEventResponse,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await redis_client.close()
    await close_database()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan,
)

# Explicit CORS policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

request_counts: Counter[tuple[str, int]] = Counter()


@app.middleware("http")
async def observe_requests(request, call_next):
    if request.url.path.startswith("/api/v1/") and request.url.path not in {"/api/v1/health", "/api/v1/ready"}:
        client_id = request.client.host if request.client else "unknown"
        if not await redis_client.check_rate_limit(client_id):
            return Response(status_code=429, content='{"detail":"Rate limit exceeded"}', media_type="application/json",
                            headers={"Retry-After": "60"})
    response = await call_next(request)
    if request.url.path != "/metrics":
        method = request.method if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE"} else "OTHER"
        request_counts[(method, response.status_code)] += 1
    return response

# ------------------------------------------------------------------------------
# Legacy local demo fixtures; production endpoints read from PostgreSQL below.
# ------------------------------------------------------------------------------
OUTBOX_RECORDS: List[dict] = []
ALERTS_DATA: List[dict] = [
    {
        "id": "ALT-101",
        "type": "THERMAL",
        "severity": "WARNING",
        "status": "OPEN",
        "title": "BESS Thermal Infeed Normalizing",
        "message": "Super Battery Core temperature at 28.4°C within active liquid cooling safety envelope.",
        "entity_type": "BESS",
        "entity_id": "BESS-01",
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": "ALT-102",
        "type": "BAY_LIMIT",
        "severity": "INFO",
        "status": "OPEN",
        "title": "Fast DC Charging Bays Operational",
        "message": "Simultaneous 5-bay limit active. Overnight slow AC & battery swapping available.",
        "entity_type": "CHARGER_BAY",
        "entity_id": "BAYS-1-5",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
]

# ------------------------------------------------------------------------------
# Health Checks
# ------------------------------------------------------------------------------
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/v1/ready", tags=["Health"])
async def readiness_check():
    dependencies = {"database": await database_is_ready(), "redis": await redis_client.ping()}
    if not all(dependencies.values()):
        raise HTTPException(status_code=503, detail={"status": "not_ready", "dependencies": dependencies})
    return {"status": "ready", "dependencies": dependencies}

# ------------------------------------------------------------------------------
# Energy & Microgrid Routes
# ------------------------------------------------------------------------------
@app.get("/api/v1/energy/grid-stations", tags=["Energy"])
async def get_grid_stations(db: AsyncSession = Depends(get_db)):
    stations = (await db.execute(select(GridStationModel).options(selectinload(GridStationModel.solar_farms)))).scalars().all()
    return [{
        "id": station.id, "name": station.name, "solar_capacity_kw": station.solar_capacity_kw,
        "base_load_kw": station.base_load_kw, "live_generation_kw": station.live_generation_kw,
        "grid_export_kw": station.grid_export_kw,
        "solar_farms": [{"id": farm.id, "name": farm.name, "capacity_kw": farm.capacity_kw,
                         "efficiency": farm.efficiency, "status": farm.status}
                        for farm in station.solar_farms],
    } for station in stations]

@app.get("/api/v1/energy/bess", tags=["Energy"])
async def get_bess_status(db: AsyncSession = Depends(get_db)):
    bess = await db.get(BessUnitModel, "BESS-01")
    if not bess:
        raise HTTPException(status_code=404, detail="BESS unit not found")
    return {"id": bess.id, "name": bess.name, "total_capacity_kwh": bess.total_capacity_kwh,
            "current_stored_kwh": bess.current_stored_kwh, "soc": bess.soc,
            "charge_rate_kw": bess.charge_rate_kw, "discharge_rate_kw": bess.discharge_rate_kw,
            "state": bess.state, "temp_c": bess.temp_c}


@app.put("/api/v1/energy/solar-farms/{farm_id}/scale", tags=["Energy"])
async def scale_solar_farm(farm_id: int, payload: SolarFarmScaleRequest, db: AsyncSession = Depends(get_db)):
    farm = await db.get(SolarFarmModel, farm_id, with_for_update=True)
    if not farm:
        raise HTTPException(status_code=404, detail={"code": "SOLAR_FARM_NOT_FOUND", "message": "Solar farm not found"})
    station = await db.get(GridStationModel, farm.grid_station_id, with_for_update=True)
    previous_generation = farm.current_generation_kw
    farm.scale_multiplier = payload.scale_multiplier
    farm.capacity_kw = round(farm.base_capacity_kw * payload.scale_multiplier, 2)
    farm.current_generation_kw = round(farm.capacity_kw * 0.78, 2)
    await db.flush()
    station.solar_capacity_kw = await db.scalar(select(func.sum(SolarFarmModel.capacity_kw)).where(
        SolarFarmModel.grid_station_id == station.id)) or 0.0
    station.live_generation_kw = max(0.0, station.live_generation_kw + farm.current_generation_kw - previous_generation)
    station.grid_export_kw = max(0.0, station.grid_export_kw + farm.current_generation_kw - previous_generation)
    db.add(OutboxEventModel(event_type="SolarFarmCapacityChanged", aggregate_type="solar_farm",
                            aggregate_id=str(farm.id), schema_version=1,
                            payload={"farm_id": farm.id, "capacity_kw": farm.capacity_kw,
                                     "scale_multiplier": farm.scale_multiplier}, published=False))
    await db.commit()
    return {"success": True, "farm_id": farm.id, "capacity_kw": farm.capacity_kw,
            "scale_multiplier": farm.scale_multiplier}

# ------------------------------------------------------------------------------
# Fleet & Charging Routes
# ------------------------------------------------------------------------------
@app.post("/api/v1/fleet/trucks/{truck_id}/dispatch", response_model=DispatchTruckResponse, tags=["Fleet"])
async def dispatch_truck(truck_id: int, payload: DispatchTruckRequest, db: AsyncSession = Depends(get_db)):
    if payload.truck_id != truck_id:
        raise HTTPException(status_code=422, detail={"code": "TRUCK_ID_MISMATCH", "message": "Path and payload truck IDs must match"})
    truck = await db.get(TruckModel, truck_id, with_for_update=True)
    if not truck:
        raise HTTPException(status_code=404, detail={"code": "TRUCK_NOT_FOUND", "message": f"Truck #{truck_id} does not exist"})
    if payload.total_weight_kg > truck.payload_capacity_kg:
        raise HTTPException(status_code=409, detail={"code": "PAYLOAD_CAPACITY_EXCEEDED", "message": "Cargo weight exceeds this truck's rated payload capacity"})
    if truck.op_status.lower().startswith("dispatched"):
        raise HTTPException(status_code=409, detail={"code": "TRUCK_UNAVAILABLE", "message": "Truck is already on a route"})
    required_points = {payload.origin_point_id, *payload.delivery_stop_ids}
    available_points = set((await db.execute(select(DeliveryPointModel.id).where(
        DeliveryPointModel.id.in_(required_points)))).scalars().all())
    if required_points - available_points:
        raise HTTPException(status_code=422, detail={"code": "DELIVERY_POINT_NOT_FOUND", "message": "Route contains an unknown delivery point"})

    # Record outbox event
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": "TruckDispatched",
        "schema_version": 1,
        "aggregate_type": "truck",
        "aggregate_id": str(truck_id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "truck_id": truck_id,
            "origin_point_id": payload.origin_point_id,
            "delivery_stop_ids": payload.delivery_stop_ids,
            "total_weight_kg": payload.total_weight_kg
        },
        "published": False
    }
    truck.op_status = "Dispatched - En Route"
    db.add(OutboxEventModel(
        id=event["event_id"], event_type=event["event_type"],
        aggregate_type=event["aggregate_type"], aggregate_id=event["aggregate_id"],
        schema_version=event["schema_version"], payload=event["payload"], published=False
    ))
    await db.commit()

    return DispatchTruckResponse(
        success=True,
        truck_id=truck_id,
        dispatched_status="Dispatched - En Route",
        route_legs_count=len(payload.delivery_stop_ids) + 2,
        estimated_duration_mins=45
    )


@app.get("/api/v1/fleet/trucks", response_model=List[TruckResponse], tags=["Fleet"])
async def list_trucks(db: AsyncSession = Depends(get_db)):
    trucks = (await db.execute(select(TruckModel).order_by(TruckModel.id))).scalars().all()
    return [{"id": truck.id, "name": truck.name, "plate": truck.plate, "soc": truck.soc,
             "battery_capacity_kwh": truck.battery_capacity_kwh, "payload_capacity_kg": truck.payload_capacity_kg,
             "op_status": truck.op_status, "lat": truck.lat, "lng": truck.lng,
             "connected_to_charger": truck.connected_to_charger, "charger_bay": truck.charger_bay,
             "charge_rate_kw": truck.charge_rate_kw, "arrival_soc": truck.arrival_soc,
             "total_deliveries_completed": truck.total_deliveries_completed, "motor_temp_c": truck.motor_temp_c}
            for truck in trucks]


@app.get("/api/v1/fleet/chargers", tags=["Fleet"])
async def list_chargers(db: AsyncSession = Depends(get_db)):
    bays = (await db.execute(select(ChargerBayModel).order_by(ChargerBayModel.bay_number))).scalars().all()
    return [{"bay_number": bay.bay_number, "type": bay.type, "max_power_kw": bay.max_power_kw,
             "current_power_kw": bay.current_power_kw, "occupied": bay.occupied, "truck_id": bay.truck_id}
            for bay in bays]


@app.get("/api/v1/battery/packs", response_model=List[BatteryPackResponse], tags=["Battery"])
async def list_battery_packs(db: AsyncSession = Depends(get_db)):
    packs = (await db.execute(select(BatteryPackModel).order_by(BatteryPackModel.slot_number))).scalars().all()
    return [{"id": pack.id, "serial_number": pack.serial_number, "soc": pack.soc,
             "capacity_kwh": pack.capacity_kwh, "soh": pack.soh, "charging": pack.charging,
             "slot_number": pack.slot_number, "charge_rate_kw": pack.charge_rate_kw,
             "temp_c": pack.temp_c} for pack in packs]


@app.post("/api/v1/battery/swap", response_model=BatterySwapResponse, tags=["Battery"])
async def swap_battery(payload: BatterySwapRequest, db: AsyncSession = Depends(get_db)):
    truck = (await db.execute(select(TruckModel).where(TruckModel.id == payload.truck_id).with_for_update())).scalar_one_or_none()
    if not truck:
        raise HTTPException(status_code=404, detail={"code": "TRUCK_NOT_FOUND", "message": "Truck not found"})
    if truck.op_status.lower().startswith("dispatched"):
        raise HTTPException(status_code=409, detail={"code": "TRUCK_UNAVAILABLE", "message": "A truck on a route cannot swap batteries"})
    pack = (await db.execute(select(BatteryPackModel).where(
        BatteryPackModel.soc >= 80, BatteryPackModel.charging.is_(False)
    ).order_by(BatteryPackModel.soc.desc()).limit(1).with_for_update(skip_locked=True))).scalar_one_or_none()
    if not pack:
        raise HTTPException(status_code=409, detail={"code": "NO_READY_PACK", "message": "No charged battery pack is ready"})
    previous_soc = truck.soc
    truck.soc = pack.soc
    truck.op_status = "Available at Depot"
    pack.soc = previous_soc
    pack.charging = True
    pack.charge_rate_kw = 48.0
    db.add(OutboxEventModel(event_type="BatterySwapped", aggregate_type="truck",
                            aggregate_id=str(truck.id), schema_version=1,
                            payload={"truck_id": truck.id, "pack_serial": pack.serial_number,
                                     "truck_soc": truck.soc, "returned_pack_soc": previous_soc}, published=False))
    await db.commit()
    return BatterySwapResponse(success=True, truck_id=truck.id, truck_name=truck.name,
                               new_soc=truck.soc, swapped_pack_serial=pack.serial_number)

# ------------------------------------------------------------------------------
# Orders & Logistics Routes
# ------------------------------------------------------------------------------
@app.post("/api/v1/orders/quote", response_model=QuoteResponse, tags=["Orders"])
async def calculate_quote(payload: QuoteRequest):
    service_multiplier = 1.0
    if payload.service_type in ["refrigerated-cryo", "cold-chain"]:
        service_multiplier = 1.25
    elif payload.service_type in ["heavy-duty-flatbed", "heavy-haul"]:
        service_multiplier = 1.20
    elif payload.service_type in ["air-ride-vault", "fragile-secure"]:
        service_multiplier = 1.22
    elif payload.service_type in ["express-sprinter", "express-rapid"]:
        service_multiplier = 1.18

    per_km_rate = round(24.0 * service_multiplier, 2)
    per_kg_rate = 4.50

    total_dist = payload.distance_km
    total_weight = payload.weight_kg

    if payload.deliveries:
        total_weight = sum(d.cargo_weight_kg for d in payload.deliveries)

    base_distance_fare = round(total_dist * per_km_rate, 2)
    weight_fare = round(total_weight * per_kg_rate, 2)

    extra_fare = 0.0
    for extra in payload.extra_services:
        if extra in ["hydraulic_liftgate", "tailgate_hydraulic"]:
            extra_fare += 850
        elif extra in ["iot_telemetry", "cold_logistics"]:
            extra_fare += 450
        elif extra == "white_glove":
            extra_fare += 950
        elif extra == "hazmat_containment":
            extra_fare += 1600
        elif extra in ["transit_insurance", "fragile_care"]:
            extra_fare += 1200
        elif extra == "express_sprint":
            extra_fare += 500

    subtotal = round(base_distance_fare + weight_fare + extra_fare, 2)
    gst_amount = round((subtotal * 18.0) / 100.0, 2)
    total_amount = round(subtotal + gst_amount, 2)

    return QuoteResponse(
        distance_km=total_dist,
        per_km_rate=per_km_rate,
        per_kg_rate=per_kg_rate,
        base_distance_fare=base_distance_fare,
        weight_fare=weight_fare,
        extra_services_fare=extra_fare,
        subtotal=subtotal,
        gst_rate_pct=18.0,
        gst_amount=gst_amount,
        total_amount=total_amount
    )


def distance_between_points(start: DeliveryPointModel, end: DeliveryPointModel) -> float:
    lat1, lat2 = math.radians(start.lat), math.radians(end.lat)
    dlat, dlng = lat2 - lat1, math.radians(end.lng - start.lng)
    haversine = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(haversine))


@app.get("/api/v1/delivery-points", tags=["Orders"])
async def list_delivery_points(db: AsyncSession = Depends(get_db)):
    points = (await db.execute(select(DeliveryPointModel).order_by(DeliveryPointModel.id))).scalars().all()
    return [{"id": point.id, "code": point.code, "name": point.name, "type": point.type,
             "lat": point.lat, "lng": point.lng,
             "distance_from_depot_km": point.distance_from_depot_km} for point in points]


@app.post("/api/v1/orders", response_model=OrderResponse, status_code=201, tags=["Orders"])
async def create_order(payload: CreateOrderRequest, db: AsyncSession = Depends(get_db)):
    point_ids = {payload.origin_point_id, *(delivery.delivery_point_id for delivery in payload.deliveries)}
    points = (await db.execute(select(DeliveryPointModel).where(DeliveryPointModel.id.in_(point_ids)))).scalars().all()
    point_by_id = {point.id: point for point in points}
    missing = point_ids - point_by_id.keys()
    if missing:
        raise HTTPException(status_code=404, detail={"code": "DELIVERY_POINT_NOT_FOUND", "message": f"Unknown delivery points: {sorted(missing)}"})

    current = point_by_id[payload.origin_point_id]
    legs = []
    total_distance = 0.0
    total_weight = 0.0
    for stop_order, delivery in enumerate(payload.deliveries, start=1):
        destination = point_by_id[delivery.delivery_point_id]
        leg_distance = distance_between_points(current, destination)
        total_distance += leg_distance
        total_weight += delivery.cargo_weight_kg
        legs.append((stop_order, delivery, leg_distance))
        current = destination

    quote = await calculate_quote(QuoteRequest(distance_km=round(total_distance, 2), weight_kg=total_weight,
        service_type=payload.service_type, extra_services=payload.extra_services))
    order_id = f"ORD-{uuid.uuid4().hex[:12].upper()}"
    stops = [OrderStopModel(stop_order=stop_order, delivery_point_id=delivery.delivery_point_id,
        cargo_weight_kg=delivery.cargo_weight_kg, box_count=delivery.box_count,
        leg_distance_km=round(leg_distance, 2),
        leg_fare=round(leg_distance * quote.per_km_rate + delivery.cargo_weight_kg * quote.per_kg_rate, 2))
        for stop_order, delivery, leg_distance in legs]
    order = OrderModel(id=order_id, customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone, status="Pending", origin_point_id=payload.origin_point_id,
        scheduled_pickup_time=payload.scheduled_pickup_time, service_type=payload.service_type,
        total_weight_kg=round(total_weight, 2), total_distance_km=round(total_distance, 2),
        total_fare=quote.total_amount, gst_amount=quote.gst_amount, stops=stops)
    db.add(order)
    db.add(OutboxEventModel(event_type="OrderCreated", aggregate_type="order", aggregate_id=order_id,
        schema_version=1, payload={"order_id": order_id, "customer_name": order.customer_name,
                                   "total_fare": quote.total_amount, "delivery_count": len(stops)},
        published=False))
    await db.commit()
    return OrderResponse(id=order.id, customer_name=order.customer_name, status=order.status,
        origin_point_id=order.origin_point_id, scheduled_pickup_time=order.scheduled_pickup_time,
        service_type=order.service_type, total_weight_kg=order.total_weight_kg,
        total_distance_km=order.total_distance_km, total_fare=order.total_fare,
        gst_amount=order.gst_amount, assigned_truck_id=order.assigned_truck_id,
        stops=[OrderStopResponse(delivery_point_id=s.delivery_point_id, cargo_weight_kg=s.cargo_weight_kg,
            box_count=s.box_count, leg_distance_km=s.leg_distance_km, leg_fare=s.leg_fare) for s in stops])


@app.get("/api/v1/orders", response_model=List[OrderResponse], tags=["Orders"])
async def list_orders(db: AsyncSession = Depends(get_db)):
    orders = (await db.execute(select(OrderModel).options(selectinload(OrderModel.stops))
        .order_by(OrderModel.created_at.desc()).limit(200))).scalars().all()
    return [OrderResponse(id=order.id, customer_name=order.customer_name, status=order.status,
        origin_point_id=order.origin_point_id, scheduled_pickup_time=order.scheduled_pickup_time,
        service_type=order.service_type, total_weight_kg=order.total_weight_kg,
        total_distance_km=order.total_distance_km, total_fare=order.total_fare,
        gst_amount=order.gst_amount, assigned_truck_id=order.assigned_truck_id,
        stops=[OrderStopResponse(delivery_point_id=stop.delivery_point_id,
            cargo_weight_kg=stop.cargo_weight_kg, box_count=stop.box_count,
            leg_distance_km=stop.leg_distance_km, leg_fare=stop.leg_fare) for stop in order.stops])
        for order in orders]

# ------------------------------------------------------------------------------
# Alerts Routes
# ------------------------------------------------------------------------------
@app.get("/api/v1/alerts", response_model=List[AlertResponse], tags=["Alerts"])
async def list_alerts(status_filter: Optional[str] = Query(default=None, alias="status"), db: AsyncSession = Depends(get_db)):
    query = select(AlertModel).order_by(AlertModel.created_at.desc())
    if status_filter:
        query = query.where(AlertModel.status.ilike(status_filter))
    alerts = (await db.execute(query)).scalars().all()
    return [{"id": a.id, "type": a.type, "severity": a.severity, "status": a.status,
             "title": a.title, "message": a.message, "entity_type": a.entity_type,
             "entity_id": a.entity_id, "created_at": a.created_at.isoformat() if a.created_at else ""} for a in alerts]

@app.post("/api/v1/alerts/{alert_id}/acknowledge", tags=["Alerts"])
async def acknowledge_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await db.get(AlertModel, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == "ACKNOWLEDGED":
        return {"success": True, "alert": {"id": alert.id, "status": alert.status}}
    alert.status = "ACKNOWLEDGED"
    db.add(OutboxEventModel(event_type="AlertAcknowledged", aggregate_type="alert",
                            aggregate_id=alert.id, schema_version=1,
                            payload={"alert_id": alert.id}, published=False))
    await db.commit()
    return {"success": True, "alert": {"id": alert.id, "status": alert.status}}

@app.post("/api/v1/alerts/{alert_id}/resolve", tags=["Alerts"])
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await db.get(AlertModel, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == "RESOLVED":
        return {"success": True, "alert": {"id": alert.id, "status": alert.status}}
    alert.status = "RESOLVED"
    alert.resolved_at = datetime.now(timezone.utc)
    db.add(OutboxEventModel(event_type="AlertResolved", aggregate_type="alert",
                            aggregate_id=alert.id, schema_version=1,
                            payload={"alert_id": alert.id}, published=False))
    await db.commit()
    return {"success": True, "alert": {"id": alert.id, "status": alert.status}}

# ------------------------------------------------------------------------------
# Transactional Outbox Feed
# ------------------------------------------------------------------------------
@app.get("/api/v1/outbox/events", response_model=List[OutboxEventResponse], tags=["Outbox"])
async def list_outbox_events(db: AsyncSession = Depends(get_db)):
    events = (await db.execute(select(OutboxEventModel).order_by(OutboxEventModel.created_at.desc()).limit(200))).scalars().all()
    return [OutboxEventResponse(id=e.id, event_type=e.event_type, aggregate_type=e.aggregate_type,
        aggregate_id=e.aggregate_id, schema_version=e.schema_version, payload=e.payload,
        published=e.published, created_at=e.created_at.isoformat() if e.created_at else "") for e in events]


@app.get("/api/v1/outbox/stats", tags=["Outbox"])
async def outbox_stats(db: AsyncSession = Depends(get_db)):
    totals = (await db.execute(select(
        func.count(OutboxEventModel.id),
        func.count(case((OutboxEventModel.published.is_(False), 1))),
        func.count(case((OutboxEventModel.published.is_(True), 1))),
    ))).one()
    latest = (await db.execute(select(OutboxEventModel.event_type).order_by(OutboxEventModel.created_at.desc()).limit(1))).scalar_one_or_none()
    return {"total_events": totals[0], "unpublished": totals[1], "published": totals[2], "latest_event_type": latest}


@app.get("/api/v1/outbox/dlq", tags=["Outbox"])
async def list_dead_letters(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(DeadLetterEventModel).order_by(DeadLetterEventModel.quarantined_at.desc()).limit(200))).scalars().all()
    return [{"dlq_id": row.id, "original_event_id": row.original_event_id, "event_type": row.event_type,
             "failure_reason": row.failure_reason, "retry_count": row.retry_count,
             "quarantined_at": row.quarantined_at.isoformat(), "payload": row.payload,
             "retried_at": row.retried_at.isoformat() if row.retried_at else None} for row in rows]


@app.post("/api/v1/outbox/dlq/{dlq_id}/retry", tags=["Outbox"])
async def retry_dead_letter(dlq_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(DeadLetterEventModel).where(DeadLetterEventModel.id == dlq_id).with_for_update())).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "DLQ_NOT_FOUND", "message": "Message not found in DLQ"})
    if row.retried_at:
        raise HTTPException(status_code=409, detail={"code": "DLQ_ALREADY_RETRIED", "message": "Message has already been retried"})
    row.retried_at = datetime.now(timezone.utc)
    event = OutboxEventModel(event_type=row.event_type, aggregate_type="dlq_retry",
                             aggregate_id=row.original_event_id, schema_version=1,
                             payload=row.payload, published=False)
    db.add(event)
    await db.commit()
    return {"success": True, "message": "Message re-queued for processing",
            "retried_item": {"dlq_id": row.id, "original_event_id": row.original_event_id,
                             "event_type": row.event_type, "failure_reason": row.failure_reason,
                             "retry_count": row.retry_count, "quarantined_at": row.quarantined_at.isoformat(),
                             "payload": row.payload}}


@app.get("/api/v1/redis/stats", tags=["Infrastructure"])
async def redis_stats():
    info = await redis_client.client.info("server")
    locks = await redis_client.active_locks()
    return {"status": "connected", "version": info.get("redis_version", "unknown"),
            "active_locks_count": len(locks), "active_locks": locks,
            "cached_keys_count": await redis_client.count_keys("cache:*"),
            "rate_limiter": {"active_clients": await redis_client.count_keys("rate-limit:*"),
                             "blocked_requests": int(await redis_client.client.get("rate-limit-blocked") or 0)}}


class LockAcquireRequest(BaseModel):
    resource: str = Field(min_length=1, max_length=128)
    requester: str = Field(min_length=1, max_length=128)
    ttl_sec: int = Field(default=300, ge=1, le=3600)


class LockReleaseRequest(BaseModel):
    resource: str = Field(min_length=1, max_length=128)
    lock_token: str = Field(min_length=1, max_length=128)


@app.post("/api/v1/redis/lock/acquire", tags=["Infrastructure"])
async def acquire_redis_lock(payload: LockAcquireRequest, db: AsyncSession = Depends(get_db)):
    token = await redis_client.acquire_lock(payload.resource, payload.ttl_sec, payload.requester)
    if not token:
        raise HTTPException(status_code=409, detail={"code": "LOCK_HELD", "message": "Resource is already leased"})
    db.add(OutboxEventModel(event_type="DistributedLockAcquired", aggregate_type="redis_lock",
                            aggregate_id=payload.resource, schema_version=1,
                            payload={"resource": payload.resource, "requester": payload.requester,
                                     "ttl_sec": payload.ttl_sec}, published=False))
    await db.commit()
    return {"success": True, "resource": payload.resource, "acquired": True, "lock_token": token,
            "requester": payload.requester, "ttl_sec": payload.ttl_sec}


@app.post("/api/v1/redis/lock/release", tags=["Infrastructure"])
async def release_redis_lock(payload: LockReleaseRequest, db: AsyncSession = Depends(get_db)):
    released = await redis_client.release_lock(payload.resource, payload.lock_token)
    if not released:
        raise HTTPException(status_code=409, detail={"code": "LOCK_NOT_OWNED", "message": "Lock expired or token does not own it"})
    db.add(OutboxEventModel(event_type="DistributedLockReleased", aggregate_type="redis_lock",
                            aggregate_id=payload.resource, schema_version=1,
                            payload={"resource": payload.resource}, published=False))
    await db.commit()
    return {"success": True, "resource": payload.resource, "released": True}


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics(db: AsyncSession = Depends(get_db)):
    outbox_total = await db.scalar(select(func.count(OutboxEventModel.id))) or 0
    outbox_pending = await db.scalar(select(func.count(OutboxEventModel.id)).where(OutboxEventModel.published.is_(False))) or 0
    dlq_total = await db.scalar(select(func.count(DeadLetterEventModel.id)).where(DeadLetterEventModel.retried_at.is_(None))) or 0
    lines = [
        "# HELP solarops_http_requests_total Total HTTP requests handled by the API",
        "# TYPE solarops_http_requests_total counter",
    ]
    lines.extend(f'solarops_http_requests_total{{method="{method}",status="{status_code}"}} {count}'
                 for (method, status_code), count in sorted(request_counts.items()))
    lines.extend([
        "# HELP solarops_outbox_events_total Total domain events in the transactional outbox",
        "# TYPE solarops_outbox_events_total gauge",
        f"solarops_outbox_events_total {outbox_total}",
        "# HELP solarops_outbox_unpublished_events Current unpublished outbox events",
        "# TYPE solarops_outbox_unpublished_events gauge",
        f"solarops_outbox_unpublished_events {outbox_pending}",
        "# HELP solarops_dlq_messages Current quarantined events awaiting retry",
        "# TYPE solarops_dlq_messages gauge",
        f"solarops_dlq_messages {dlq_total}",
    ])
    return Response("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4; charset=utf-8")
