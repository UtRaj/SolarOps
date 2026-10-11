from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.app import main as api
from apps.api.app.schemas.domain import (
    CreateOrderRequest,
    DispatchTruckRequest,
    OrderDeliveryInput,
    QuoteRequest,
    SolarFarmScaleRequest,
)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(api.redis_client, "check_rate_limit", AsyncMock(return_value=True))
    return TestClient(api.app)


def test_liveness_returns_service_metadata(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"]
    assert response.json()["timestamp"]


def test_readiness_is_healthy_when_database_and_redis_are_healthy(client, monkeypatch):
    monkeypatch.setattr(api, "database_is_ready", AsyncMock(return_value=True))
    monkeypatch.setattr(api.redis_client, "ping", AsyncMock(return_value=True))

    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    assert response.json()["dependencies"] == {"database": True, "redis": True}


@pytest.mark.parametrize(
    "database_ok,redis_ok,expected",
    [(False, True, {"database": False, "redis": True}),
     (True, False, {"database": True, "redis": False}),
     (False, False, {"database": False, "redis": False})],
)
def test_readiness_fails_if_a_dependency_is_down(client, monkeypatch, database_ok, redis_ok, expected):
    monkeypatch.setattr(api, "database_is_ready", AsyncMock(return_value=database_ok))
    monkeypatch.setattr(api.redis_client, "ping", AsyncMock(return_value=redis_ok))

    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json()["detail"]["dependencies"] == expected


def test_quote_calculates_service_rate_extra_services_and_tax(client):
    response = client.post(
        "/api/v1/orders/quote",
        json={
            "distance_km": 10,
            "weight_kg": 100,
            "service_type": "refrigerated-cryo",
            "extra_services": ["hydraulic_liftgate", "white_glove"],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "distance_km": 10,
        "per_km_rate": 30,
        "per_kg_rate": 4.5,
        "base_distance_fare": 300,
        "weight_fare": 450,
        "extra_services_fare": 1800,
        "subtotal": 2550,
        "gst_rate_pct": 18,
        "gst_amount": 459,
        "total_amount": 3009,
    }


def test_quote_uses_delivery_weights_when_delivery_items_are_provided(client):
    response = client.post(
        "/api/v1/orders/quote",
        json={
            "distance_km": 2,
            "weight_kg": 999,
            "deliveries": [
                {"delivery_point_id": 3, "cargo_weight_kg": 20},
                {"delivery_point_id": 4, "cargo_weight_kg": 30, "box_count": 2},
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["weight_fare"] == 225
    assert response.json()["per_km_rate"] == 24


@pytest.mark.parametrize("payload", [{"distance_km": -1}, {"weight_kg": -1}])
def test_quote_rejects_negative_distance_or_weight(client, payload):
    response = client.post("/api/v1/orders/quote", json=payload)
    assert response.status_code == 422


def test_rate_limited_requests_return_retry_after_header(client, monkeypatch):
    monkeypatch.setattr(api.redis_client, "check_rate_limit", AsyncMock(return_value=False))
    response = client.get("/api/v1/fleet/trucks")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_health_and_readiness_remain_available_when_rate_limited(client, monkeypatch):
    monkeypatch.setattr(api.redis_client, "check_rate_limit", AsyncMock(return_value=False))
    monkeypatch.setattr(api, "database_is_ready", AsyncMock(return_value=True))
    monkeypatch.setattr(api.redis_client, "ping", AsyncMock(return_value=True))
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/ready").status_code == 200


def test_farm_scale_schema_enforces_supported_range():
    assert SolarFarmScaleRequest(scale_multiplier=0.5).scale_multiplier == 0.5
    assert SolarFarmScaleRequest(scale_multiplier=3).scale_multiplier == 3
    with pytest.raises(ValidationError):
        SolarFarmScaleRequest(scale_multiplier=3.01)


def test_dispatch_schema_requires_a_positive_weight_and_at_least_one_stop():
    with pytest.raises(ValidationError):
        DispatchTruckRequest(truck_id=1, delivery_stop_ids=[], total_weight_kg=1)
    with pytest.raises(ValidationError):
        DispatchTruckRequest(truck_id=1, delivery_stop_ids=[2], total_weight_kg=0)
    assert DispatchTruckRequest(truck_id=1, delivery_stop_ids=[2], total_weight_kg=1).box_count == 1


def test_order_schema_requires_customer_name_and_delivery_stops():
    with pytest.raises(ValidationError):
        CreateOrderRequest(customer_name="   ", scheduled_pickup_time="09:30", deliveries=[])
    with pytest.raises(ValidationError):
        CreateOrderRequest(customer_name="Acme", scheduled_pickup_time="09:30", deliveries=[])


def test_delivery_stop_rejects_nonpositive_weight_and_point_ids():
    with pytest.raises(ValidationError):
        OrderDeliveryInput(delivery_point_id=0, cargo_weight_kg=5)
    with pytest.raises(ValidationError):
        OrderDeliveryInput(delivery_point_id=2, cargo_weight_kg=0)


def test_quote_schema_defaults_to_existing_standard_tariff():
    quote = QuoteRequest()
    assert quote.distance_km == 15
    assert quote.weight_kg == 500
    assert quote.service_type == "standard-dry-van"
