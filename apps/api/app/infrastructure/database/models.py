import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Text,
    Enum as SAEnum
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def utcnow():
    return datetime.now(timezone.utc)

class GridStationModel(Base):
    __tablename__ = "grid_stations"

    id = Column(String(32), primary_key=True)  # "GS-01", "GS-02"
    name = Column(String(128), nullable=False)
    solar_capacity_kw = Column(Float, nullable=False, default=1500.0)
    base_load_kw = Column(Float, nullable=False, default=320.0)
    live_generation_kw = Column(Float, nullable=False, default=0.0)
    grid_export_kw = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    solar_farms = relationship("SolarFarmModel", back_populates="grid_station")

class SolarFarmModel(Base):
    __tablename__ = "solar_farms"

    id = Column(Integer, primary_key=True)
    grid_station_id = Column(String(32), ForeignKey("grid_stations.id"), nullable=False)
    name = Column(String(128), nullable=False)
    capacity_kw = Column(Float, nullable=False)
    base_capacity_kw = Column(Float, nullable=False)
    efficiency = Column(Float, nullable=False, default=0.21)
    status = Column(String(32), nullable=False, default="Active")
    orientation = Column(String(32), nullable=False, default="South-Facing 30°")
    panel_count = Column(Integer, nullable=False, default=1500)
    scale_multiplier = Column(Float, nullable=False, default=1.0)
    current_generation_kw = Column(Float, nullable=False, default=0.0)

    grid_station = relationship("GridStationModel", back_populates="solar_farms")

class BessUnitModel(Base):
    __tablename__ = "bess_units"

    id = Column(String(32), primary_key=True)  # "BESS-01"
    name = Column(String(128), nullable=False)
    total_capacity_kwh = Column(Float, nullable=False, default=6000.0)
    current_stored_kwh = Column(Float, nullable=False, default=4500.0)
    soc = Column(Float, nullable=False, default=75.0)
    charge_rate_kw = Column(Float, nullable=False, default=120.0)
    discharge_rate_kw = Column(Float, nullable=False, default=0.0)
    state = Column(String(32), nullable=False, default="charging")  # charging, discharging, standby
    temp_c = Column(Float, nullable=False, default=28.4)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class BatteryPackModel(Base):
    __tablename__ = "battery_packs"

    id = Column(Integer, primary_key=True)
    serial_number = Column(String(64), unique=True, nullable=False)
    soc = Column(Float, nullable=False)
    capacity_kwh = Column(Float, nullable=False, default=300.0)
    soh = Column(Float, nullable=False, default=98.5)
    charging = Column(Boolean, nullable=False, default=False)
    slot_number = Column(Integer, nullable=True)
    charge_rate_kw = Column(Float, nullable=False, default=0.0)
    temp_c = Column(Float, nullable=False, default=24.0)

class TruckModel(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    plate = Column(String(32), unique=True, nullable=False)
    soc = Column(Float, nullable=False)
    battery_capacity_kwh = Column(Float, nullable=False, default=300.0)
    payload_capacity_kg = Column(Float, nullable=False, default=5000.0)
    op_status = Column(String(64), nullable=False, default="Available at Depot")
    lat = Column(Float, nullable=False, default=12.9716)
    lng = Column(Float, nullable=False, default=77.5946)
    connected_to_charger = Column(Boolean, nullable=False, default=False)
    charger_bay = Column(Integer, nullable=True)
    charge_rate_kw = Column(Float, nullable=False, default=0.0)
    arrival_soc = Column(Float, nullable=True)
    total_deliveries_completed = Column(Integer, nullable=False, default=0)
    motor_temp_c = Column(Float, nullable=False, default=42.0)

class ChargerBayModel(Base):
    __tablename__ = "chargers"

    id = Column(Integer, primary_key=True)
    bay_number = Column(Integer, nullable=False, unique=True)
    type = Column(String(32), nullable=False, default="fast_dc")  # fast_dc (48kW), slow_ac (15kW)
    max_power_kw = Column(Float, nullable=False, default=48.0)
    current_power_kw = Column(Float, nullable=False, default=0.0)
    occupied = Column(Boolean, nullable=False, default=False)
    truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=True)

class DeliveryPointModel(Base):
    __tablename__ = "delivery_points"

    id = Column(Integer, primary_key=True)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(128), nullable=False)
    type = Column(String(64), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    distance_from_depot_km = Column(Float, nullable=False)

class OrderModel(Base):
    __tablename__ = "orders"

    id = Column(String(64), primary_key=True)
    customer_name = Column(String(128), nullable=False)
    customer_phone = Column(String(32), nullable=True)
    status = Column(String(32), nullable=False, default="Pending")
    origin_point_id = Column(Integer, ForeignKey("delivery_points.id"), nullable=False)
    scheduled_pickup_time = Column(String(16), nullable=False)
    service_type = Column(String(64), nullable=False, default="standard-dry-van")
    total_weight_kg = Column(Float, nullable=False)
    total_distance_km = Column(Float, nullable=False)
    total_fare = Column(Float, nullable=False)
    gst_amount = Column(Float, nullable=False)
    assigned_truck_id = Column(Integer, ForeignKey("trucks.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    stops = relationship("OrderStopModel", back_populates="order", cascade="all, delete-orphan")

class OrderStopModel(Base):
    __tablename__ = "order_stops"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String(64), ForeignKey("orders.id"), nullable=False)
    stop_order = Column(Integer, nullable=False)
    delivery_point_id = Column(Integer, ForeignKey("delivery_points.id"), nullable=False)
    cargo_weight_kg = Column(Float, nullable=False)
    box_count = Column(Integer, nullable=False, default=1)
    leg_distance_km = Column(Float, nullable=False)
    leg_fare = Column(Float, nullable=False)

    order = relationship("OrderModel", back_populates="stops")

class AlertModel(Base):
    __tablename__ = "alerts"

    id = Column(String(64), primary_key=True)
    type = Column(String(64), nullable=False)
    severity = Column(String(32), nullable=False)  # CRITICAL, WARNING, INFO
    status = Column(String(32), nullable=False, default="OPEN")  # OPEN, ACKNOWLEDGED, RESOLVED
    title = Column(String(256), nullable=False)
    message = Column(Text, nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

class OutboxEventModel(Base):
    __tablename__ = "outbox_events"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String(128), nullable=False)
    aggregate_type = Column(String(64), nullable=False)
    aggregate_id = Column(String(64), nullable=False)
    schema_version = Column(Integer, nullable=False, default=1)
    payload = Column(JSON, nullable=False)
    published = Column(Boolean, nullable=False, default=False)
    correlation_id = Column(String(64), nullable=True)
    causation_id = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    published_at = Column(DateTime(timezone=True), nullable=True)

class DeadLetterEventModel(Base):
    __tablename__ = "dead_letter_events"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    original_event_id = Column(String(64), nullable=False, unique=True)
    event_type = Column(String(128), nullable=False)
    failure_reason = Column(Text, nullable=False)
    retry_count = Column(Integer, nullable=False, default=3)
    payload = Column(JSON, nullable=False)
    quarantined_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    retried_at = Column(DateTime(timezone=True), nullable=True)
