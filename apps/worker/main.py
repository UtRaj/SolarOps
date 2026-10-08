"""Asynchronous Background Worker: NATS JetStream Consumer & Outbox Publisher"""
import asyncio
import logging
from datetime import datetime, timezone
import json

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("solarops-worker")

async def run_outbox_publisher():
    """Polls database outbox table and publishes events to NATS JetStream"""
    logger.info("Starting Transactional Outbox Publisher worker...")
    while True:
        try:
            # In production, query SELECT * FROM outbox_events WHERE published = FALSE LIMIT 50
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"Outbox publisher error: {e}")
            await asyncio.sleep(2)

async def run_nats_event_consumer():
    """Consumes domain events from NATS JetStream stream SOLAROPS_EVENTS"""
    logger.info("Subscribing to NATS JetStream stream: SOLAROPS_EVENTS...")
    while True:
        try:
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"NATS consumer error: {e}")
            await asyncio.sleep(2)

async def main():
    logger.info("SolarOps Background Worker starting up...")
    await asyncio.gather(
        run_outbox_publisher(),
        run_nats_event_consumer()
    )

if __name__ == "__main__":
    asyncio.run(main())
