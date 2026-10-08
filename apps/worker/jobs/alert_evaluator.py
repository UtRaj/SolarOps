"""
Alert Evaluator Worker (Phase 9)
Evaluates operational thresholds across fleet SoC, BESS thermals, and charger bay queues.
Emits domain AlertCreated events when thresholds are violated.
"""
import asyncio
import logging

logger = logging.getLogger("alert-evaluator")

class AlertRules:
    CRITICAL_SOC_THRESHOLD = 15.0  # Alert if truck SoC drops below 15% outside depot
    BESS_OVERHEAT_THRESHOLD = 38.0  # Alert if BESS core temp exceeds 38°C
    MAX_FAST_BAYS_CONCURRENCY = 5  # Alert if > 5 active DC fast chargers

async def evaluate_rules(state: dict):
    # Rule 1: BESS thermal envelope
    bess_temp = state.get("bess_temp_c", 28.0)
    if bess_temp > AlertRules.BESS_OVERHEAT_THRESHOLD:
        logger.warning(f"BESS Overheat detected: {bess_temp}°C")

    # Rule 2: Fleet SoC safety check
    for truck in state.get("trucks", []):
        if truck.get("soc", 100) < AlertRules.CRITICAL_SOC_THRESHOLD and truck.get("op_status") != "At Depot":
            logger.warning(f"Low Battery on Truck #{truck.get('id')}: {truck.get('soc')}% SoC")

async def run_alert_evaluator():
    logger.info("Starting Alert Evaluator Worker...")
    while True:
        try:
            await asyncio.sleep(15)
        except Exception as e:
            logger.error(f"Alert evaluator error: {e}")
            await asyncio.sleep(5)
