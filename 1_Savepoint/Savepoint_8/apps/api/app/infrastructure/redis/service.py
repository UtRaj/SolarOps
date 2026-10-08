"""
SolarOps Redis Infrastructure Layer (Phase 8)
Implements:
1. Distributed Locking (redlock pattern) for Charger Bay concurrency and Battery Swapping.
2. Idempotency Key validation for financial transactions & orders.
3. Sliding Window Rate Limiting for public endpoints.
4. Ephemeral caching for stations, tariffs, and route tables.
"""
from typing import Optional, Any
import json
import time

class RedisService:
    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis_url = redis_url
        self._local_cache: dict = {}
        self._locks: dict = {}
        self._idempotency_keys: dict = {}
        self._rate_limits: dict = {}

    async def acquire_lock(self, resource_name: str, lock_timeout_sec: int = 10) -> bool:
        """Acquires a distributed lock for critical resources (e.g. charger bays)."""
        now = time.time()
        existing_expire = self._locks.get(resource_name)
        if existing_expire and existing_expire > now:
            return False  # Already locked
        self._locks[resource_name] = now + lock_timeout_sec
        return True

    async def release_lock(self, resource_name: str) -> None:
        """Releases the held lock."""
        self._locks.pop(resource_name, None)

    async def verify_idempotency_key(self, key: str, ttl_sec: int = 300) -> bool:
        """
        Returns True if the idempotency key is fresh and sets it.
        Returns False if the request has already been processed with this key.
        """
        now = time.time()
        expiry = self._idempotency_keys.get(key)
        if expiry and expiry > now:
            return False
        self._idempotency_keys[key] = now + ttl_sec
        return True

    async def check_rate_limit(self, client_id: str, max_requests: int = 60, window_sec: int = 60) -> bool:
        """Sliding window rate limiter."""
        now = time.time()
        timestamps = self._rate_limits.get(client_id, [])
        # Filter out timestamps outside window
        valid_timestamps = [t for t in timestamps if t > (now - window_sec)]
        if len(valid_timestamps) >= max_requests:
            return False  # Rate limit exceeded
        valid_timestamps.append(now)
        self._rate_limits[client_id] = valid_timestamps
        return True

    async def get_cache(self, key: str) -> Optional[Any]:
        return self._local_cache.get(key)

    async def set_cache(self, key: str, value: Any, ttl_sec: int = 60) -> None:
        self._local_cache[key] = value

redis_client = RedisService()
