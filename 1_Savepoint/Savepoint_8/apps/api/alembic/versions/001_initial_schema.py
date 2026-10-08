"""Initial schema migration

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Grid stations
    op.create_table(
        'grid_stations',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('solar_capacity_kw', sa.Float(), nullable=False),
        sa.Column('base_load_kw', sa.Float(), nullable=False),
        sa.Column('live_generation_kw', sa.Float(), nullable=False),
        sa.Column('grid_export_kw', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Solar farms
    op.create_table(
        'solar_farms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('grid_station_id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('capacity_kw', sa.Float(), nullable=False),
        sa.Column('base_capacity_kw', sa.Float(), nullable=False),
        sa.Column('efficiency', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('orientation', sa.String(length=32), nullable=False),
        sa.Column('panel_count', sa.Integer(), nullable=False),
        sa.Column('scale_multiplier', sa.Float(), nullable=False),
        sa.Column('current_generation_kw', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['grid_station_id'], ['grid_stations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # BESS units
    op.create_table(
        'bess_units',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('total_capacity_kwh', sa.Float(), nullable=False),
        sa.Column('current_stored_kwh', sa.Float(), nullable=False),
        sa.Column('soc', sa.Float(), nullable=False),
        sa.Column('charge_rate_kw', sa.Float(), nullable=False),
        sa.Column('discharge_rate_kw', sa.Float(), nullable=False),
        sa.Column('state', sa.String(length=32), nullable=False),
        sa.Column('temp_c', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Battery packs
    op.create_table(
        'battery_packs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('serial_number', sa.String(length=64), nullable=False),
        sa.Column('soc', sa.Float(), nullable=False),
        sa.Column('capacity_kwh', sa.Float(), nullable=False),
        sa.Column('soh', sa.Float(), nullable=False),
        sa.Column('charging', sa.Boolean(), nullable=False),
        sa.Column('slot_number', sa.Integer(), nullable=True),
        sa.Column('charge_rate_kw', sa.Float(), nullable=False),
        sa.Column('temp_c', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('serial_number')
    )

    # Trucks
    op.create_table(
        'trucks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('plate', sa.String(length=32), nullable=False),
        sa.Column('soc', sa.Float(), nullable=False),
        sa.Column('battery_capacity_kwh', sa.Float(), nullable=False),
        sa.Column('payload_capacity_kg', sa.Float(), nullable=False),
        sa.Column('op_status', sa.String(length=64), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('connected_to_charger', sa.Boolean(), nullable=False),
        sa.Column('charger_bay', sa.Integer(), nullable=True),
        sa.Column('charge_rate_kw', sa.Float(), nullable=False),
        sa.Column('arrival_soc', sa.Float(), nullable=True),
        sa.Column('total_deliveries_completed', sa.Integer(), nullable=False),
        sa.Column('motor_temp_c', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('plate')
    )

    # Chargers
    op.create_table(
        'chargers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bay_number', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('max_power_kw', sa.Float(), nullable=False),
        sa.Column('current_power_kw', sa.Float(), nullable=False),
        sa.Column('occupied', sa.Boolean(), nullable=False),
        sa.Column('truck_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['truck_id'], ['trucks.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('bay_number')
    )

    # Delivery points
    op.create_table(
        'delivery_points',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
        sa.Column('distance_from_depot_km', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )

    # Orders
    op.create_table(
        'orders',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('customer_name', sa.String(length=128), nullable=False),
        sa.Column('customer_phone', sa.String(length=32), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('origin_point_id', sa.Integer(), nullable=False),
        sa.Column('scheduled_pickup_time', sa.String(length=16), nullable=False),
        sa.Column('service_type', sa.String(length=64), nullable=False),
        sa.Column('total_weight_kg', sa.Float(), nullable=False),
        sa.Column('total_distance_km', sa.Float(), nullable=False),
        sa.Column('total_fare', sa.Float(), nullable=False),
        sa.Column('gst_amount', sa.Float(), nullable=False),
        sa.Column('assigned_truck_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['assigned_truck_id'], ['trucks.id'], ),
        sa.ForeignKeyConstraint(['origin_point_id'], ['delivery_points.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Order stops
    op.create_table(
        'order_stops',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.String(length=64), nullable=False),
        sa.Column('stop_order', sa.Integer(), nullable=False),
        sa.Column('delivery_point_id', sa.Integer(), nullable=False),
        sa.Column('cargo_weight_kg', sa.Float(), nullable=False),
        sa.Column('box_count', sa.Integer(), nullable=False),
        sa.Column('leg_distance_km', sa.Float(), nullable=False),
        sa.Column('leg_fare', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['delivery_point_id'], ['delivery_points.id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Alerts
    op.create_table(
        'alerts',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('type', sa.String(length=64), nullable=False),
        sa.Column('severity', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('entity_type', sa.String(length=64), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Outbox events
    op.create_table(
        'outbox_events',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('event_type', sa.String(length=128), nullable=False),
        sa.Column('aggregate_type', sa.String(length=64), nullable=False),
        sa.Column('aggregate_id', sa.String(length=64), nullable=False),
        sa.Column('schema_version', sa.Integer(), nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('published', sa.Boolean(), nullable=False),
        sa.Column('correlation_id', sa.String(length=64), nullable=True),
        sa.Column('causation_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('outbox_events')
    op.drop_table('alerts')
    op.drop_table('order_stops')
    op.drop_table('orders')
    op.drop_table('delivery_points')
    op.drop_table('chargers')
    op.drop_table('trucks')
    op.drop_table('battery_packs')
    op.drop_table('bess_units')
    op.drop_table('solar_farms')
    op.drop_table('grid_stations')
