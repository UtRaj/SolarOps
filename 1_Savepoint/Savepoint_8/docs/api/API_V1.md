# SolarOps REST API v1 Specification

Base Path: `/api/v1`

## Health Endpoints
- `GET /api/v1/health`: System health status and dependency checks.
- `GET /api/v1/ready`: Readiness probe for container lifecycle.

## Energy & Microgrid Endpoints
- `GET /api/v1/energy/grid-stations`: List all grid stations (GS-01 & GS-02) with live power flows.
- `GET /api/v1/energy/solar-farms`: List all solar farms with capacity and irradiance.
- `PATCH /api/v1/energy/solar-farms/{id}/scale`: Scale solar panels up or down.
- `GET /api/v1/energy/bess`: Status of the 6,000 kWh Super Battery energy storage system.
- `POST /api/v1/energy/bess/toggle-state`: Set BESS to charge, discharge, or standby.

## Battery Station Endpoints
- `GET /api/v1/battery/packs`: List all 12 hot-swappable battery packs (300 kWh).
- `POST /api/v1/battery/swap`: Perform an instant 100% battery pack swap for a truck.
- `POST /api/v1/battery/packs/{id}/plug-in`: Connect depleted pack to charging slot.
- `POST /api/v1/battery/packs/{id}/finish-charge`: Force pack to 100% ready state.

## Fleet & Charging Endpoints
- `GET /api/v1/fleet/trucks`: List all 10 EV trucks with SoC, location, and operational status.
- `GET /api/v1/fleet/chargers`: Status of 5 Fast DC bays (48 kW) and Slow AC bays (15 kW).
- `POST /api/v1/fleet/trucks/{id}/dispatch`: Dispatch truck on multi-stop delivery route.
- `POST /api/v1/fleet/trucks/{id}/plug-in`: Plug truck into charging bay (respecting max 5 limit & night protocol).
- `POST /api/v1/fleet/trucks/{id}/complete-charge`: Mark truck as 100% charged and advance queued trucks.
- `POST /api/v1/fleet/trucks/{id}/return-to-depot`: Immediately return truck to depot.

## Orders & Logistics Endpoints
- `GET /api/v1/logistics/delivery-points`: List all 15 delivery points (DP-01 to DP-15) with coordinates.
- `GET /api/v1/orders`: List all active and historical freight orders.
- `POST /api/v1/orders/quote`: Calculate itemized freight tariff quotation with GST.
- `POST /api/v1/orders`: Create and confirm a new customer order.
- `POST /api/v1/orders/{id}/dispatch`: Allocate truck and dispatch order immediately.
- `DELETE /api/v1/orders/{id}`: Cancel a pending order.

## Alerts Endpoints
- `GET /api/v1/alerts`: List operational alerts with filter (`status=OPEN|ACKNOWLEDGED|RESOLVED`).
- `POST /api/v1/alerts/{id}/acknowledge`: Acknowledge an alert.
- `POST /api/v1/alerts/{id}/resolve`: Mark alert as resolved.

## Transactional Outbox Endpoints
- `GET /api/v1/outbox/pending`: View pending outbox events awaiting NATS dispatch.
- `GET /api/v1/outbox/events`: Historical audit stream of all published domain events.
