from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator

# Base response envelope
class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: Optional[str] = None

class ErrorResponse(BaseModel):
    error: ErrorDetail

# Energy & Solar Schemas
class SolarFarmScaleRequest(BaseModel):
    scale_multiplier: float = Field(..., ge=0.5, le=3.0, description="Multiplier between 0.5 and 3.0")

class SolarFarmResponse(BaseModel):
    id: int
    grid_station_id: str
    name: str
    capacity_kw: float
    base_capacity_kw: float
    efficiency: float
    status: str
    orientation: str
    panel_count: int
    scale_multiplier: float
    current_generation_kw: float

class GridStationResponse(BaseModel):
    id: str
    name: str
    solar_capacity_kw: float
    base_load_kw: float
    live_generation_kw: float
    grid_export_kw: float
    solar_farms: List[SolarFarmResponse] = []

class BessResponse(BaseModel):
    id: str
    name: str
    total_capacity_kwh: float
    current_stored_kwh: float
    soc: float
    charge_rate_kw: float
    discharge_rate_kw: float
    state: str
    temp_c: float

# Battery Station Schemas
class BatteryPackResponse(BaseModel):
    id: int
    serial_number: str
    soc: float
    capacity_kwh: float
    soh: float
    charging: bool
    slot_number: Optional[int] = None
    charge_rate_kw: float
    temp_c: float

class BatterySwapRequest(BaseModel):
    truck_id: int

class BatterySwapResponse(BaseModel):
    success: bool
    truck_id: int
    truck_name: str
    new_soc: float
    swapped_pack_serial: str

# Fleet & Charging Schemas
class TruckResponse(BaseModel):
    id: int
    name: str
    plate: str
    soc: float
    battery_capacity_kwh: float
    payload_capacity_kg: float
    op_status: str
    lat: float
    lng: float
    connected_to_charger: bool
    charger_bay: Optional[int] = None
    charge_rate_kw: float
    arrival_soc: Optional[float] = None
    total_deliveries_completed: int
    motor_temp_c: float

class DispatchTruckRequest(BaseModel):
    truck_id: int
    origin_point_id: int = 2
    delivery_stop_ids: List[int] = Field(..., min_length=1)
    total_weight_kg: float = Field(..., gt=0)
    box_count: int = Field(default=1, ge=1)

class DispatchTruckResponse(BaseModel):
    success: bool
    truck_id: int
    dispatched_status: str
    route_legs_count: int
    estimated_duration_mins: int

# Order & Pricing Schemas
class OrderDeliveryInput(BaseModel):
    delivery_point_id: int = Field(..., gt=0)
    cargo_weight_kg: float = Field(..., gt=0)
    box_count: int = Field(default=1, ge=1)

class QuoteRequest(BaseModel):
    distance_km: float = Field(default=15.0, ge=0)
    weight_kg: float = Field(default=500.0, ge=0)
    service_type: str = "standard-dry-van"
    extra_services: List[str] = []
    deliveries: Optional[List[OrderDeliveryInput]] = None

class QuoteResponse(BaseModel):
    distance_km: float
    per_km_rate: float
    per_kg_rate: float
    base_distance_fare: float
    weight_fare: float
    extra_services_fare: float
    subtotal: float
    gst_rate_pct: float
    gst_amount: float
    total_amount: float

class CreateOrderRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=128)
    customer_phone: Optional[str] = None
    origin_point_id: int = 2
    scheduled_pickup_time: str = Field(..., min_length=1, max_length=64)
    service_type: str = "standard-dry-van"
    extra_services: List[str] = []
    deliveries: List[OrderDeliveryInput] = Field(..., min_length=1)

    @field_validator("customer_name")
    @classmethod
    def customer_name_must_contain_non_whitespace(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("customer_name cannot be blank")
        return value

class OrderStopResponse(BaseModel):
    delivery_point_id: int
    cargo_weight_kg: float
    box_count: int
    leg_distance_km: float
    leg_fare: float

class OrderResponse(BaseModel):
    id: str
    customer_name: str
    status: str
    origin_point_id: int
    scheduled_pickup_time: str
    service_type: str
    total_weight_kg: float
    total_distance_km: float
    total_fare: float
    gst_amount: float
    assigned_truck_id: Optional[int] = None
    stops: List[OrderStopResponse] = []

# Alert Schemas
class AlertResponse(BaseModel):
    id: str
    type: str
    severity: str
    status: str
    title: str
    message: str
    entity_type: str
    entity_id: str
    created_at: str

# Outbox & Event Schemas
class OutboxEventResponse(BaseModel):
    id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    schema_version: int
    payload: Dict[str, Any]
    published: bool
    created_at: str
