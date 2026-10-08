# SolarOps Production Runbook & Operations Guide (Phase 14)

## 1. System Startup & Verification
To boot the full multi-tier infrastructure:
```bash
# 1. Start all infrastructure services (Postgres, TimescaleDB, Redis, NATS)
docker compose up -d

# 2. Run database migrations
alembic upgrade head

# 3. Start background worker pool
python apps/worker/main.py

# 4. Start web and API server
npm run dev
```

## 2. Health & Readiness Verification
- **Liveness probe**: `GET /api/v1/health` (HTTP 200 required)
- **Readiness probe**: `GET /api/v1/ready` (checks DB, Redis, NATS)
- **Prometheus scraper**: `GET /metrics` (returns standard OpenMetrics exposition)

## 3. Incident Management & Recovery
### Scenario: Poison Message in Outbox
1. Inspect Dead Letter Queue:
   ```bash
   curl -s http://localhost:3000/api/v1/outbox/dlq
   ```
2. Correct schema error or downstream dependency.
3. Re-queue quarantined message:
   ```bash
   curl -X POST http://localhost:3000/api/v1/outbox/dlq/retry -H "Content-Type: application/json" -d '{"event_id": "evt-123"}'
   ```

### Scenario: Charger Bay Contention
If more than 5 trucks request Fast DC charging simultaneously, the Redis distributed lock enforces queueing. Overnight slow AC charging bays (6–10) automatically absorb lower priority overnight charging.
