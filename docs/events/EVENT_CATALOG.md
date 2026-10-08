# Domain Event Catalog (NATS JetStream)

Stream Name: `SOLAROPS_EVENTS`  
Subject Format: `solarops.events.<domain>.<event_type>`

## Event Envelope Specification
```json
{
  "event_id": "c1f7b0a8-765d-4f24-bf1b-c7419db62c93",
  "event_type": "TruckDispatched",
  "schema_version": 1,
  "aggregate_type": "truck",
  "aggregate_id": "4",
  "timestamp": "2026-09-20T07:15:00.000Z",
  "correlation_id": "6a9925e0-f203-4f93-b6d3-2fbe5c52c93a",
  "causation_id": "8f8bca28-b0a7-4cf2-8356-cc556e4c7980",
  "payload": {
    "truck_id": 4,
    "truck_name": "Titan Hauler 04",
    "origin_point_id": 2,
    "delivery_stop_ids": [5, 11],
    "total_weight_kg": 700,
    "departure_soc": 98.5
  }
}
```

## Catalog of Supported Events

### 1. Logistics & Orders
- `OrderCreated`: Triggered when merchant submits a new freight booking request.
- `OrderConfirmed`: Triggered when an order is validated and scheduled.
- `OrderDispatched`: Triggered when a dedicated EV truck departs the depot.
- `OrderDelivered`: Triggered when delivery stops are successfully completed.
- `OrderCancelled`: Triggered if an order is cancelled prior to dispatch.

### 2. Fleet & Charging
- `TruckDispatched`: Truck leaves depot and begins navigation leg.
- `TruckArrivedAtDeliveryPoint`: Truck completes navigation to a dropoff waypoint.
- `TruckDeliveryCompleted`: Offloading completed at a delivery stop.
- `TruckReturnedToDepot`: Truck completes route and returns to depot.
- `ChargingSessionStarted`: Truck plugs into Fast DC bay (48 kW) or Slow AC (15 kW).
- `ChargingSessionCompleted`: Truck battery reaches 100% full state of charge.
- `ChargingFaultDetected`: Charger hardware fault or thermal threshold violation.

### 3. Battery Swap
- `BatterySwapRequested`: Vehicle pulls into swap station for fast turnaround.
- `BatterySwapCompleted`: Fresh 300 kWh pack installed (truck instantly at 100% SoC).
- `BatteryPackChargingStarted`: Depleted pack connected to depot charging slot.
- `BatteryPackChargingCompleted`: Battery pack reaches 100% SoC and ready state.

### 4. Energy & Solar Microgrid
- `SolarGenerationUpdated`: Periodic aggregate generation from GS-01 & GS-02.
- `SolarFarmStatusChanged`: Farm online/offline or scaling change.
- `BessChargingStarted`: Surplus solar energy channeled into 6,000 kWh BESS.
- `BessDischargeStarted`: BESS supplying energy to depot or grid.
- `BessSOCThresholdReached`: High or low SoC alert condition.

### 5. Alerts
- `AlertCreated`: System condition requiring operator awareness.
- `AlertAcknowledged`: Operator marked alert as under review.
- `AlertResolved`: Condition cleared or resolved.
