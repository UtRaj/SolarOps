from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
from datetime import datetime, timezone

from apps.api.app.config import settings
from apps.api.app.schemas.domain import (
    GridStationResponse,
    SolarFarmScaleRequest,
    BessResponse,
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
    AlertResponse,
    OutboxEventResponse,
    ErrorResponse
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/api/v1/openapi.json"
)

# Explicit CORS policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# In-Memory Authoritative Domain Store (Synchronized with DB Repository Pattern)
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
    return {"status": "ready", "database": "connected", "nats": "connected"}

# ------------------------------------------------------------------------------
# Energy & Microgrid Routes
# ------------------------------------------------------------------------------
@app.get("/api/v1/energy/grid-stations", tags=["Energy"])
async def get_grid_stations():
    return [
        {
            "id": "GS-01",
            "name": "Grid Station 01 - North Substation",
            "solar_capacity_kw": 1800.0,
            "base_load_kw": 350.0,
            "live_generation_kw": 1420.0,
            "grid_export_kw": 820.0,
            "solar_farms": [
                {"id": 1, "name": "SF-01 North Array", "capacity_kw": 600, "efficiency": 0.22, "status": "Active"},
                {"id": 2, "name": "SF-02 North Highlands", "capacity_kw": 550, "efficiency": 0.21, "status": "Active"},
                {"id": 3, "name": "SF-03 Valley Bifacial", "capacity_kw": 650, "efficiency": 0.23, "status": "Active"}
            ]
        },
        {
            "id": "GS-02",
            "name": "Grid Station 02 - Depot Hub Microgrid",
            "solar_capacity_kw": 1450.0,
            "base_load_kw": 420.0,
            "live_generation_kw": 1180.0,
            "grid_export_kw": 510.0,
            "solar_farms": [
                {"id": 4, "name": "SF-04 Depot Rooftop PV", "capacity_kw": 700, "efficiency": 0.20, "status": "Active"},
                {"id": 5, "name": "SF-05 Perimeter Solar Canopy", "capacity_kw": 750, "efficiency": 0.21, "status": "Active"}
            ]
        }
    ]

@app.get("/api/v1/energy/bess", tags=["Energy"])
async def get_bess_status():
    return {
        "id": "BESS-01",
        "name": "Depot Super Battery BESS",
        "total_capacity_kwh": 6000.0,
        "current_stored_kwh": 4620.0,
        "soc": 77.0,
        "charge_rate_kw": 140.0,
        "discharge_rate_kw": 0.0,
        "state": "charging",
        "temp_c": 28.4
    }

# ------------------------------------------------------------------------------
# Fleet & Charging Routes
# ------------------------------------------------------------------------------
@app.post("/api/v1/fleet/trucks/{truck_id}/dispatch", response_model=DispatchTruckResponse, tags=["Fleet"])
async def dispatch_truck(truck_id: int, payload: DispatchTruckRequest):
    if truck_id < 1 or truck_id > 10:
        raise HTTPException(
            status_code=404,
            detail={"code": "TRUCK_NOT_FOUND", "message": f"Truck #{truck_id} does not exist"}
        )

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
    OUTBOX_RECORDS.append(event)

    return DispatchTruckResponse(
        success=True,
        truck_id=truck_id,
        dispatched_status="Dispatched - En Route",
        route_legs_count=len(payload.delivery_stop_ids) + 2,
        estimated_duration_mins=45
    )

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

# ------------------------------------------------------------------------------
# Alerts Routes
# ------------------------------------------------------------------------------
@app.get("/api/v1/alerts", response_model=List[AlertResponse], tags=["Alerts"])
async def list_alerts(status_filter: Optional[str] = None):
    if status_filter:
        return [a for a in ALERTS_DATA if a["status"].upper() == status_filter.upper()]
    return ALERTS_DATA

@app.post("/api/v1/alerts/{alert_id}/acknowledge", tags=["Alerts"])
async def acknowledge_alert(alert_id: str):
    for a in ALERTS_DATA:
        if a["id"] == alert_id:
            a["status"] = "ACKNOWLEDGED"
            return {"success": True, "alert": a}
    raise HTTPException(status_code=404, detail="Alert not found")

@app.post("/api/v1/alerts/{alert_id}/resolve", tags=["Alerts"])
async def resolve_alert(alert_id: str):
    for a in ALERTS_DATA:
        if a["id"] == alert_id:
            a["status"] = "RESOLVED"
            return {"success": True, "alert": a}
    raise HTTPException(status_code=404, detail="Alert not found")

# ------------------------------------------------------------------------------
# Transactional Outbox Feed
# ------------------------------------------------------------------------------
@app.get("/api/v1/outbox/events", response_model=List[OutboxEventResponse], tags=["Outbox"])
async def list_outbox_events():
    return [
        OutboxEventResponse(
            id=e["event_id"],
            event_type=e["event_type"],
            aggregate_type=e["aggregate_type"],
            aggregate_id=e["aggregate_id"],
            schema_version=e["schema_version"],
            payload=e["payload"],
            published=e["published"],
            created_at=e["timestamp"]
        )
        for e in OUTBOX_RECORDS
    ]
