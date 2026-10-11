"""Add operational indexes and bootstrap the demo alert and fleet records.

Revision ID: 002_runtime_indexes_and_seed
Revises: 001_initial_schema
"""
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa

revision = "002_runtime_indexes_and_seed"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_outbox_unpublished_created", "outbox_events", ["published", "created_at"])
    op.create_index("ix_outbox_aggregate", "outbox_events", ["aggregate_type", "aggregate_id", "created_at"])
    op.create_index("ix_alerts_status_created", "alerts", ["status", "created_at"])

    stations = sa.table(
        "grid_stations", sa.column("id", sa.String), sa.column("name", sa.String),
        sa.column("solar_capacity_kw", sa.Float), sa.column("base_load_kw", sa.Float),
        sa.column("live_generation_kw", sa.Float), sa.column("grid_export_kw", sa.Float),
        sa.column("created_at", sa.DateTime(timezone=True)), sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(stations, [
        {"id": "GS-01", "name": "Grid Station 01 - North Substation", "solar_capacity_kw": 1800.0,
         "base_load_kw": 350.0, "live_generation_kw": 1420.0, "grid_export_kw": 820.0, "created_at": now, "updated_at": now},
        {"id": "GS-02", "name": "Grid Station 02 - Depot Hub Microgrid", "solar_capacity_kw": 1450.0,
         "base_load_kw": 420.0, "live_generation_kw": 1180.0, "grid_export_kw": 510.0, "created_at": now, "updated_at": now},
    ])
    farms = sa.table(
        "solar_farms", sa.column("id", sa.Integer), sa.column("grid_station_id", sa.String),
        sa.column("name", sa.String), sa.column("capacity_kw", sa.Float), sa.column("base_capacity_kw", sa.Float),
        sa.column("efficiency", sa.Float), sa.column("status", sa.String), sa.column("orientation", sa.String),
        sa.column("panel_count", sa.Integer), sa.column("scale_multiplier", sa.Float),
        sa.column("current_generation_kw", sa.Float),
    )
    farm_rows = [
        (1, "GS-01", "SF-01 North Array", 600, .22),
        (2, "GS-01", "SF-02 North Highlands", 550, .21),
        (3, "GS-01", "SF-03 Valley Bifacial", 650, .23),
        (4, "GS-02", "SF-04 Depot Rooftop PV", 700, .20),
        (5, "GS-02", "SF-05 Perimeter Solar Canopy", 750, .21),
    ]
    op.bulk_insert(farms, [
        {"id": farm_id, "grid_station_id": station_id, "name": name,
         "capacity_kw": float(capacity), "base_capacity_kw": float(capacity), "efficiency": efficiency,
         "status": "Active", "orientation": "South-Facing 30°", "panel_count": 1500,
         "scale_multiplier": 1.0, "current_generation_kw": float(capacity) * 0.78}
        for farm_id, station_id, name, capacity, efficiency in farm_rows
    ])
    bess = sa.table(
        "bess_units", sa.column("id", sa.String), sa.column("name", sa.String),
        sa.column("total_capacity_kwh", sa.Float), sa.column("current_stored_kwh", sa.Float),
        sa.column("soc", sa.Float), sa.column("charge_rate_kw", sa.Float),
        sa.column("discharge_rate_kw", sa.Float), sa.column("state", sa.String),
        sa.column("temp_c", sa.Float), sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(bess, [{"id": "BESS-01", "name": "Depot Super Battery BESS", "total_capacity_kwh": 6000,
        "current_stored_kwh": 4620, "soc": 77, "charge_rate_kw": 140, "discharge_rate_kw": 0,
        "state": "charging", "temp_c": 28.4, "updated_at": now}])

    delivery_points = sa.table(
        "delivery_points", sa.column("id", sa.Integer), sa.column("code", sa.String),
        sa.column("name", sa.String), sa.column("type", sa.String), sa.column("lat", sa.Float),
        sa.column("lng", sa.Float), sa.column("distance_from_depot_km", sa.Float),
    )
    points = [
        (1, "Central Warehouse & Hub", "Warehouse / Depot", 18.5204, 73.8567),
        (2, "North Logistics Cargo Terminal", "Logistics Cross-Dock", 18.5721, 73.8710),
        (3, "Riverfront Medical & Pharma Center", "Medical Center", 18.5350, 73.8210),
        (4, "West Industrial Manufacturing Zone", "Industrial Park", 18.4980, 73.8050),
        (5, "South Metro Commercial Plaza", "Retail Hub", 18.4650, 73.8420),
        (6, "Airport Cargo Gate 4", "Airport Freight", 18.5580, 73.9180),
        (7, "East Tech Park Fulfillment", "Technology Zone", 18.5150, 73.9310),
        (8, "Silicon Valley Research Campus", "Technology Zone", 18.4890, 73.9050),
        (9, "Southwest Fresh Produce Market", "Warehouse / Depot", 18.4810, 73.8240),
        (10, "Harbor Marine Intermodal Yard", "Logistics Cross-Dock", 18.4720, 73.9450),
        (11, "East Cold Storage Logistics Hub", "Cold Storage", 18.5790, 73.9020),
        (12, "Northwest Suburban Retail Park", "Retail Hub", 18.5830, 73.8320),
        (13, "University Science Quadrangle", "Technology Zone", 18.5440, 73.8450),
        (14, "South Industrial Engineering Park", "Industrial Park", 18.4520, 73.8790),
        (15, "Cross-Dock Rapid Transit Station", "Logistics Cross-Dock", 18.5290, 73.8920),
    ]
    from math import asin, cos, radians, sin, sqrt
    depot_lat, depot_lng = points[0][3], points[0][4]
    def route_km(lat, lng):
        dlat, dlng = radians(lat - depot_lat), radians(lng - depot_lng)
        value = sin(dlat / 2) ** 2 + cos(radians(depot_lat)) * cos(radians(lat)) * sin(dlng / 2) ** 2
        return 6371.0 * 2 * asin(sqrt(value))
    op.bulk_insert(delivery_points, [
        {"id": i, "code": f"DP-{i:02d}", "name": name, "type": kind,
         "lat": lat, "lng": lng, "distance_from_depot_km": route_km(lat, lng)}
        for i, name, kind, lat, lng in points
    ])
    op.execute("SELECT setval(pg_get_serial_sequence('delivery_points', 'id'), (SELECT MAX(id) FROM delivery_points), true)")

    alerts = sa.table(
        "alerts",
        sa.column("id", sa.String), sa.column("type", sa.String),
        sa.column("severity", sa.String), sa.column("status", sa.String),
        sa.column("title", sa.String), sa.column("message", sa.Text),
        sa.column("entity_type", sa.String), sa.column("entity_id", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("resolved_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(timezone.utc)
    op.bulk_insert(alerts, [
        {"id": "ALT-101", "type": "THERMAL", "severity": "WARNING", "status": "OPEN",
         "title": "BESS Thermal Infeed Normalizing", "message": "Super Battery Core temperature at 28.4°C within active liquid cooling safety envelope.",
         "entity_type": "BESS", "entity_id": "BESS-01", "created_at": now, "resolved_at": None},
        {"id": "ALT-102", "type": "BAY_LIMIT", "severity": "INFO", "status": "OPEN",
         "title": "Fast DC Charging Bays Operational", "message": "Simultaneous 5-bay limit active. Overnight slow AC & battery swapping available.",
         "entity_type": "CHARGER_BAY", "entity_id": "BAYS-1-5", "created_at": now, "resolved_at": None},
    ])

    trucks = sa.table(
        "trucks", sa.column("id", sa.Integer), sa.column("name", sa.String),
        sa.column("plate", sa.String), sa.column("soc", sa.Float),
        sa.column("battery_capacity_kwh", sa.Float), sa.column("payload_capacity_kg", sa.Float),
        sa.column("op_status", sa.String), sa.column("lat", sa.Float), sa.column("lng", sa.Float),
        sa.column("connected_to_charger", sa.Boolean), sa.column("charger_bay", sa.Integer),
        sa.column("charge_rate_kw", sa.Float), sa.column("arrival_soc", sa.Float),
        sa.column("total_deliveries_completed", sa.Integer), sa.column("motor_temp_c", sa.Float),
    )
    op.bulk_insert(trucks, [
        {"id": i, "name": f"Truck-{i:02d}", "plate": f"EV-TRK-{100 + i}",
         "soc": [21, 63, 74, 55, 88, 42, 68, 91, 36, 79][i - 1],
         "battery_capacity_kwh": 150.0, "payload_capacity_kg": 5000.0,
         "op_status": "Available at Depot", "lat": 18.5204, "lng": 73.8567,
         "connected_to_charger": False, "charger_bay": None, "charge_rate_kw": 0.0,
         "arrival_soc": None, "total_deliveries_completed": 0, "motor_temp_c": 42.0}
        for i in range(1, 11)
    ])
    op.execute("SELECT setval(pg_get_serial_sequence('trucks', 'id'), (SELECT MAX(id) FROM trucks), true)")

    chargers = sa.table(
        "chargers", sa.column("id", sa.Integer), sa.column("bay_number", sa.Integer),
        sa.column("type", sa.String), sa.column("max_power_kw", sa.Float),
        sa.column("current_power_kw", sa.Float), sa.column("occupied", sa.Boolean),
        sa.column("truck_id", sa.Integer),
    )
    op.bulk_insert(chargers, [
        {"id": i, "bay_number": i, "type": "fast_dc", "max_power_kw": 48.0,
         "current_power_kw": 0.0, "occupied": False, "truck_id": None}
        for i in range(1, 6)
    ])
    op.execute("SELECT setval(pg_get_serial_sequence('chargers', 'id'), (SELECT MAX(id) FROM chargers), true)")

    packs = sa.table(
        "battery_packs", sa.column("id", sa.Integer), sa.column("serial_number", sa.String),
        sa.column("soc", sa.Float), sa.column("capacity_kwh", sa.Float), sa.column("soh", sa.Float),
        sa.column("charging", sa.Boolean), sa.column("slot_number", sa.Integer),
        sa.column("charge_rate_kw", sa.Float), sa.column("temp_c", sa.Float),
    )
    op.bulk_insert(packs, [
        {"id": i, "serial_number": f"PACK-{i:03d}", "soc": soc, "capacity_kwh": 300.0,
         "soh": 98.5 - (i - 1) * 0.4, "charging": False, "slot_number": i,
         "charge_rate_kw": 0.0, "temp_c": 24.0}
        for i, soc in enumerate([100, 96, 92, 87, 79, 74, 70, 65, 58, 52], start=1)
    ])
    op.execute("SELECT setval(pg_get_serial_sequence('battery_packs', 'id'), (SELECT MAX(id) FROM battery_packs), true)")


def downgrade() -> None:
    op.execute("DELETE FROM solar_farms WHERE id BETWEEN 1 AND 5")
    op.execute("DELETE FROM bess_units WHERE id = 'BESS-01'")
    op.execute("DELETE FROM grid_stations WHERE id IN ('GS-01', 'GS-02')")
    op.execute("DELETE FROM alerts WHERE id IN ('ALT-101', 'ALT-102')")
    op.execute("DELETE FROM trucks WHERE plate LIKE 'EV-TRK-10%'")
    op.execute("DELETE FROM battery_packs WHERE serial_number LIKE 'PACK-%'")
    op.execute("DELETE FROM chargers WHERE bay_number BETWEEN 1 AND 5")
    op.drop_index("ix_alerts_status_created", table_name="alerts")
    op.drop_index("ix_outbox_aggregate", table_name="outbox_events")
    op.drop_index("ix_outbox_unpublished_created", table_name="outbox_events")
