# SolarOps Platform: Complete System Architecture (Phases 1–14)

## Executive Architecture Summary
SolarOps is an industrial clean energy and electric commercial fleet management platform engineered as a **Modular Monolith** with an asynchronous **Transactional Outbox Pattern** and event-driven worker subsystem.

```
+---------------------------------------------------------------------------------------+
|                                    CLIENT LAYER                                       |
|  React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query + WebSocket Gateway    |
+---------------------------------------------------------------------------------------+
                                          |
                                HTTP / REST v1 & WS
                                          |
+---------------------------------------------------------------------------------------+
|                                APPLICATION GATEWAY                                    |
|  FastAPI / Express Gateway: Routing, Idempotency Middleware, Rate Limiting (Redis)   |
+---------------------------------------------------------------------------------------+
                                          |
       +----------------------------------+-----------------------------------+
       |                                                                      |
+------------------------------+                               +-------------------------------+
|     PRIMARY DATA STORE       |                               |      EVENT BUS & CACHE        |
|  PostgreSQL 16               |                               |  Redis 7: Locks & Rate Limits |
|  - Relational entities       |                               |  NATS JetStream: Stream Bus   |
|  - Outbox Table (Atomic)     |                               |  - SOLAROPS_EVENTS            |
|  TimescaleDB: Hypertables    |                               |  - SOLAROPS_TELEMETRY         |
+------------------------------+                               +-------------------------------+
                                          |
                                          |
+---------------------------------------------------------------------------------------+
|                                ASYNC WORKER POOL                                      |
|  - Outbox Publisher Worker (at-least-once guarantee)                                 |
|  - Telemetry Ingestion Worker (TimescaleDB rollups)                                  |
|  - Alert Evaluator (Thermal, SoC, and Charger limits)                                |
|  - Dead Letter Queue (DLQ) Poison Message Quarantining                               |
+---------------------------------------------------------------------------------------+
                                          |
+---------------------------------------------------------------------------------------+
|                                OBSERVABILITY STACK                                    |
|  - Prometheus Scraper (/metrics)                                                      |
|  - OpenTelemetry Collector (Traces & Metrics)                                         |
|  - Grafana Unified Dashboard                                                          |
+---------------------------------------------------------------------------------------+
```

---

## The 14 Implementation Phases

| Phase | Subsystem | Key Technical Components |
|---|---|---|
| **Phase 1** | Architecture Foundation | Monorepo scaffolding, strict domain boundaries, Docker Compose, non-root Dockerfiles. |
| **Phase 2** | Database & Persistence | PostgreSQL 16 schema, SQLAlchemy 2.0 async ORM, Alembic migrations, TimescaleDB strategy. |
| **Phase 3** | REST API v1 | FastAPI `/api/v1` routes, Pydantic v2 schemas, strict error envelope `{ error: { code, message, request_id } }`. |
| **Phase 4** | Modern Frontend | React 18, TanStack Query cache invalidation, typed API client, light theme UI. |
| **Phase 5** | Event-Driven Outbox | Atomic database outbox table, NATS JetStream stream `SOLAROPS_EVENTS`, versioned JSON schemas. |
| **Phase 6** | Simulation Engine | Decoupled physics, diurnal solar curves, EV kinematics, battery degradation, dwell times. |
| **Phase 7** | Realtime Stream | WebSocket & SSE gateway, push-based client synchronization, heartbeat keepalive. |
| **Phase 8** | Redis Cache & Locks | Redlock algorithm for charger bays, sliding window rate limiter, idempotency keys. |
| **Phase 9** | Background Workers | Dedicated worker pool, telemetry batching, continuous threshold evaluation. |
| **Phase 10** | Observability | Prometheus `/metrics` exposition, OpenTelemetry pipeline, structured JSON logging. |
| **Phase 11** | Reliability & DLQ | Poison message quarantine, exponential backoff retries, graceful shutdown handlers. |
| **Phase 12** | Testing Suite | Physics unit tests, freight tariff assertions, GST verification, integration suites. |
| **Phase 13** | CI/CD Automation | GitHub Actions pipeline: linting, typechecking, schema validation, Docker build check. |
| **Phase 14** | Production Runbook | Operational documentation, disaster recovery, scaling guide, developer runbook. |
