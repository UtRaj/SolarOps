import pytest
from fastapi import HTTPException

from apps.api.app import main as api
from apps.api.app.infrastructure.database.models import DeliveryPointModel, OrderModel, OutboxEventModel, TruckModel
from apps.api.app.schemas.domain import CreateOrderRequest, DispatchTruckRequest, OrderDeliveryInput


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class FakeOrderSession:
    def __init__(self, points):
        self.points = points
        self.added = []
        self.committed = False

    async def execute(self, _statement):
        return FakeResult(self.points)

    def add(self, record):
        self.added.append(record)

    async def commit(self):
        self.committed = True


class FakeDispatchSession(FakeOrderSession):
    def __init__(self, truck, points):
        super().__init__(points)
        self.truck = truck

    async def get(self, model, identity, **_kwargs):
        return self.truck if model is TruckModel and identity == self.truck.id else None


def point(point_id, lat, lng):
    return DeliveryPointModel(
        id=point_id,
        code=f"DP-{point_id:02d}",
        name=f"Delivery {point_id}",
        type="Warehouse / Depot",
        lat=lat,
        lng=lng,
        distance_from_depot_km=0,
    )


@pytest.mark.asyncio
async def test_order_creation_persists_order_stops_and_outbox_event_atomically():
    session = FakeOrderSession([point(2, 18.5721, 73.8710), point(3, 18.5350, 73.8210)])
    payload = CreateOrderRequest(
        customer_name="  Acme Medical  ",
        customer_phone="555-0100",
        origin_point_id=2,
        scheduled_pickup_time="2026-10-12T09:30:00+05:30",
        deliveries=[OrderDeliveryInput(delivery_point_id=3, cargo_weight_kg=125, box_count=5)],
    )

    response = await api.create_order(payload, session)

    order = next(record for record in session.added if isinstance(record, OrderModel))
    event = next(record for record in session.added if isinstance(record, OutboxEventModel))
    assert session.committed is True
    assert response.customer_name == "Acme Medical"
    assert response.total_weight_kg == 125
    assert len(response.stops) == 1
    assert order.total_fare > 0
    assert event.event_type == "OrderCreated"
    assert event.payload["order_id"] == response.id


@pytest.mark.asyncio
async def test_order_creation_rejects_unknown_delivery_points_before_persisting():
    session = FakeOrderSession([point(2, 18.5721, 73.8710)])
    payload = CreateOrderRequest(
        customer_name="Acme",
        scheduled_pickup_time="09:30",
        origin_point_id=2,
        deliveries=[OrderDeliveryInput(delivery_point_id=404, cargo_weight_kg=10)],
    )

    with pytest.raises(HTTPException) as error:
        await api.create_order(payload, session)
    assert error.value.status_code == 404
    assert session.added == []
    assert session.committed is False


@pytest.mark.asyncio
async def test_dispatch_updates_truck_and_writes_event_in_one_commit():
    truck = TruckModel(id=7, name="Truck-07", plate="EV-TEST-007", soc=80,
                       payload_capacity_kg=2000, op_status="Available at Depot")
    session = FakeDispatchSession(truck, [2, 3])
    payload = DispatchTruckRequest(truck_id=7, origin_point_id=2,
                                   delivery_stop_ids=[3], total_weight_kg=150)

    response = await api.dispatch_truck(7, payload, session)

    event = next(record for record in session.added if isinstance(record, OutboxEventModel))
    assert response.success is True
    assert response.route_legs_count == 3
    assert truck.op_status == "Dispatched - En Route"
    assert event.event_type == "TruckDispatched"
    assert session.committed is True


@pytest.mark.asyncio
async def test_dispatch_rejects_over_capacity_and_keeps_truck_available():
    truck = TruckModel(id=7, name="Truck-07", plate="EV-TEST-007", soc=80,
                       payload_capacity_kg=100, op_status="Available at Depot")
    session = FakeDispatchSession(truck, [2, 3])
    payload = DispatchTruckRequest(truck_id=7, origin_point_id=2,
                                   delivery_stop_ids=[3], total_weight_kg=150)

    with pytest.raises(HTTPException) as error:
        await api.dispatch_truck(7, payload, session)
    assert error.value.status_code == 409
    assert truck.op_status == "Available at Depot"
    assert session.added == []
    assert session.committed is False


def test_geographic_distance_is_zero_at_same_point_and_positive_for_different_points():
    same = point(1, 18.5204, 73.8567)
    other = point(2, 18.5721, 73.8710)
    assert api.distance_between_points(same, same) == 0
    assert 5 < api.distance_between_points(same, other) < 10
