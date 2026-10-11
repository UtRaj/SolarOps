"""Outbox publisher and durable event consumer for SolarOps."""
import asyncio
import json
import logging
import random
from datetime import datetime, timezone

import nats
from nats.js.api import ConsumerConfig, RetentionPolicy, StorageType, StreamConfig
from sqlalchemy.dialects.postgresql import insert

from apps.api.app.config import settings
from apps.api.app.infrastructure.database.models import DeadLetterEventModel, OutboxEventModel
from apps.api.app.infrastructure.database.session import AsyncSessionLocal, close_database

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("solarops-worker")
BATCH_SIZE = 50
POLL_INTERVAL_SECONDS = 1


async def ensure_event_stream(js) -> None:
    try:
        await js.stream_info(settings.NATS_STREAM_NAME)
    except Exception:
        await js.add_stream(StreamConfig(
            name=settings.NATS_STREAM_NAME,
            subjects=[f"{settings.NATS_SUBJECT_PREFIX}.domain.*", f"{settings.NATS_SUBJECT_PREFIX}.dlq"],
            retention=RetentionPolicy.LIMITS,
            storage=StorageType.FILE,
            max_age=30 * 24 * 60 * 60,
        ))


async def publish_outbox_batch(js) -> int:
    """Publish committed domain events with row-level claims and at-least-once delivery."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OutboxEventModel)
            .where(OutboxEventModel.published.is_(False))
            .order_by(OutboxEventModel.created_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        events = list(result.scalars())
        if not events:
            await session.rollback()
            return 0

        for event in events:
            subject = f"{settings.NATS_SUBJECT_PREFIX}.domain.{event.event_type}"
            envelope = {
                "event_id": event.id,
                "event_type": event.event_type,
                "schema_version": event.schema_version,
                "aggregate_type": event.aggregate_type,
                "aggregate_id": event.aggregate_id,
                "occurred_at": event.created_at.isoformat() if event.created_at else None,
                "payload": event.payload,
            }
            await js.publish(subject, json.dumps(envelope, separators=(",", ":")).encode(),
                             headers={"Nats-Msg-Id": event.id})
            event.published = True
            event.published_at = datetime.now(timezone.utc)

        await session.commit()
        return len(events)


async def consume_events(js) -> None:
    async def handle(message) -> None:
        try:
            event = json.loads(message.data)
            if not event.get("event_id") or not event.get("event_type"):
                raise ValueError("event envelope is missing event_id or event_type")
            logger.info("event_received", extra={"event_id": event["event_id"], "event_type": event["event_type"]})
            await message.ack()
        except Exception as exc:
            deliveries = message.metadata.num_delivered
            logger.exception("event_processing_failed", extra={"delivery": deliveries})
            if deliveries >= 3:
                try:
                    raw = message.data.decode("utf-8", errors="replace")
                    try:
                        envelope = json.loads(raw)
                    except json.JSONDecodeError:
                        envelope = {"raw": raw}
                    event_id = str(envelope.get("event_id") or f"invalid-{message.metadata.sequence.stream}")[:64]
                    event_type = str(envelope.get("event_type") or "UnknownEvent")[:128]
                    async with AsyncSessionLocal() as session:
                        await session.execute(insert(DeadLetterEventModel.__table__).values(
                            original_event_id=event_id, event_type=event_type,
                            failure_reason=str(exc)[:2000], retry_count=deliveries, payload=envelope,
                        ).on_conflict_do_nothing(index_elements=["original_event_id"]))
                        await session.commit()
                    await js.publish(f"{settings.NATS_SUBJECT_PREFIX}.dlq", message.data,
                                     headers={"Nats-Msg-Id": event_id, "SolarOps-Failure": str(exc)[:500]})
                except Exception:
                    logger.exception("dead_letter_persistence_failed")
                    await message.nak(delay=30)
                    return
                await message.ack()
            else:
                await message.nak(delay=min(2 ** deliveries, 30))

    await js.subscribe(
        f"{settings.NATS_SUBJECT_PREFIX}.domain.*",
        durable="solarops-operations-v1",
        config=ConsumerConfig(ack_wait=30, max_deliver=3),
        cb=handle,
    )


async def main() -> None:
    nc = await nats.connect(settings.NATS_URL, name="solarops-outbox-worker", max_reconnect_attempts=-1)
    try:
        js = nc.jetstream()
        await ensure_event_stream(js)
        await consume_events(js)
        logger.info("worker_started", extra={"stream": settings.NATS_STREAM_NAME})
        backoff = 1.0
        while True:
            try:
                published = await publish_outbox_batch(js)
                if published:
                    logger.info("outbox_batch_published", extra={"count": published})
                backoff = 1.0
                if published == 0:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("outbox_publish_failed")
                await asyncio.sleep(min(backoff, 30) + random.random())
                backoff = min(backoff * 2, 30)
    finally:
        await nc.drain()
        await close_database()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
