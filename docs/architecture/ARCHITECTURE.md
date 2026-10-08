# Architecture Decision Records & System Design

## 1. Modular Monolith Architecture
SolarOps is implemented as a **modular monolith** with clear domain boundaries:
- **Logistics & Orders Domain**: Manages delivery points, multi-stop routing, quotes, pricing, and lifecycle of freight orders.
- **Fleet & Charging Domain**: Manages 10 heavy-duty EV trucks, 5 fast DC charging bays (48 kW), overnight slow AC charging (15 kW), charger queueing, and dispatch operations.
- **Energy & Solar Domain**: Manages 2 Grid Stations (GS-01 & GS-02), 5 Solar Farms with live irradiance & physics, and the 6,000 kWh BESS Super Battery.
- **Battery Station Domain**: Manages hot-swappable battery modules (300 kWh packs) with live state of health (SoH), charging slots, and instant swap mechanics.
- **Alert Domain**: Centralized operational telemetry alert lifecycle (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`).

## 2. Storage Strategy
- **PostgreSQL**: Authoritative relational data store for domain models, state transactions, and transactional outbox.
- **TimescaleDB**: Hypertables for high-frequency time-series telemetry (solar irradiance, inverter status, EV power draw, BESS thermal dynamics).
- **Redis**: Ephemeral cache, distributed locking for charger bay reservation, and idempotency keys.

## 3. Event-Driven Architecture & Transactional Outbox
To guarantee consistency without distributed 2-phase commits:
1. Every domain mutation (e.g. `OrderDispatched`, `TruckPluggedIn`) atomically writes the state change AND an `outbox_events` record within a single database transaction.
2. A background worker reads unpublished outbox rows and publishes them to **NATS JetStream** stream `SOLAROPS_EVENTS`.
3. Consumers subscribe to domain events to generate alerts, update metrics, or trigger downstream actions.
