# SolarOps — Production-Grade Grid Operations & EV Fleet Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture: Modular Monolith](https://img.shields.io/badge/Architecture-Modular%20Monolith-emerald.svg)](docs/architecture/ARCHITECTURE.md)
[![FastAPI](https://img.shields.io/badge/API-FastAPI%20%2F%20v1-009688.svg)](docs/api/API_V1.md)
[![PostgreSQL + TimescaleDB](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20TimescaleDB-336791.svg)](docs/database/SCHEMA.md)
[![Event Bus: NATS JetStream](https://img.shields.io/badge/Events-NATS%20JetStream-27AAE1.svg)](docs/events/EVENT_CATALOG.md)

**SolarOps** is an open-source, production-grade digital twin and operational intelligence platform for clean energy microgrids and commercial electric vehicle (EV) heavy-duty fleet logistics.

---

## 🏛️ System Architecture

```text
                                  ┌───────────────────────────┐
                                  │      React 19 Web App     │
                                  │   (TanStack Query + UI)   │
                                  └─────────────┬─────────────┘
                                                │ REST / WebSocket
                                                ▼
                                  ┌───────────────────────────┐
                                  │      FastAPI Backend      │
                                  │      /api/v1 Endpoints    │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
        ┌──────────────────┐          ┌───────────────────┐          ┌──────────────────┐
        │  Logistics &     │          │  Fleet & Charging │          │  Energy & Solar  │
        │  Orders Domain   │          │  Domain           │          │  Grid Domain     │
        └────────┬─────────┘          └─────────┬─────────┘          └────────┬─────────┘
                 │                              │                             │
                 └──────────────────────────────┼─────────────────────────────┘
                                                ▼
                                  ┌───────────────────────────┐
                                  │   Transactional Outbox    │
                                  │  (Atomic DB Consistency)  │
                                  └─────────────┬─────────────┘
                                                ▼
                                  ┌───────────────────────────┐
                                  │      NATS JetStream       │
                                  │  Durable Event Streaming  │
                                  └─────────────┬─────────────┘
                                                │
                      ┌─────────────────────────┼─────────────────────────┐
                      ▼                         ▼                         ▼
             ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
             │ Telemetry Store │       │  Alert Engine   │       │ Background      │
             │  (TimescaleDB)  │       │  Domain Worker  │       │ Outbox Workers  │
             └─────────────────┘       └─────────────────┘       └─────────────────┘
```

---

## 📁 Repository Structure

```text
├── apps/
│   ├── api/                    # Python FastAPI application (REST /api/v1)
│   │   ├── app/
│   │   │   ├── api/v1/         # Versioned REST endpoints
│   │   │   ├── domains/        # Domain services (fleet, energy, orders, alerts, etc.)
│   │   │   ├── schemas/        # Pydantic v2 domain & request/response schemas
│   │   │   ├── infrastructure/ # PostgreSQL models, Alembic, Redis, NATS
│   │   │   └── main.py         # Application entrypoint
│   │   ├── requirements.txt
│   │   └── pyproject.toml
│   ├── worker/                 # Asynchronous background event consumers & outbox publisher
│   └── web/                    # React 19 + TypeScript + TanStack Query frontend
├── packages/
│   ├── shared-types/           # Shared TypeScript/JSON contracts
│   └── event-schemas/          # Versioned NATS JetStream event schemas
├── infrastructure/
│   ├── docker/                 # Dockerfiles for API, Web, Workers
│   ├── nats/                   # NATS JetStream server configuration
│   └── docker-compose.yml      # Local dev environment orchestration
└── docs/
    ├── architecture/           # System design & ADRs
    ├── api/                    # OpenAPI / REST v1 specification
    ├── events/                 # NATS event catalog & schema versions
    └── database/               # Relational & time-series database design
```

---

## ⚡ Quickstart (Local Docker Compose)

```bash
# Clone the repository
git clone https://github.com/example/solarops.git
cd solarops

# Copy environment template
cp .env.example .env

# Launch PostgreSQL, TimescaleDB, Redis, NATS JetStream, API, and Web UI
docker compose up -d

# Verify services
curl -s http://localhost:3000/api/health | jq .
curl -s http://localhost:8000/api/v1/health | jq .
```

---

## 📜 License
Released under the [MIT License](LICENSE).
