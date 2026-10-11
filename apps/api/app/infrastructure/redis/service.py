"""Redis-backed coordination primitives used by API and worker processes."""
from typing import Optional, Any
import json
import secrets
from datetime import datetime, timezone

from redis.asyncio import Redis
from redis.exceptions import RedisError

class RedisService:
    def __init__(self, redis_url: str):
        self.client = Redis.from_url(redis_url, decode_responses=True)

    async def acquire_lock(self, resource_name: str, lock_timeout_sec: int = 10, requester: str = "unknown") -> Optional[str]:
        """Acquire a lease and return its unguessable ownership token."""
        token = secrets.token_urlsafe(24)
        value = json.dumps({"token": token, "locked_by": requester,
                            "acquired_at": datetime.now(timezone.utc).isoformat(), "ttl_sec": lock_timeout_sec})
        acquired = await self.client.set(f"lock:{resource_name}", value, nx=True, ex=lock_timeout_sec)
        return token if acquired else None

    async def release_lock(self, resource_name: str, token: str) -> bool:
        release_if_owner = self.client.register_script(
            "local v = redis.call('get', KEYS[1]); if not v then return 0 end; "
            "if cjson.decode(v).token == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
        )
        return bool(await release_if_owner(keys=[f"lock:{resource_name}"], args=[token]))

    async def verify_idempotency_key(self, key: str, ttl_sec: int = 300) -> bool:
        """
        Returns True if the idempotency key is fresh and sets it.
        Returns False if the request has already been processed with this key.
        """
        return bool(await self.client.set(f"idempotency:{key}", "1", nx=True, ex=ttl_sec))

    async def check_rate_limit(self, client_id: str, max_requests: int = 60, window_sec: int = 60) -> bool:
        """Atomic fixed-window rate limiter."""
        key = f"rate-limit:{client_id}"
        increment_window = self.client.register_script(
            "local n = redis.call('incr', KEYS[1]); if n == 1 then redis.call('expire', KEYS[1], ARGV[1]); end; return n"
        )
        count = await increment_window(keys=[key], args=[window_sec])
        allowed = count <= max_requests
        if not allowed:
            await self.client.incr("rate-limit-blocked")
        return allowed

    async def active_locks(self) -> dict[str, dict[str, Any]]:
        result = {}
        async for key in self.client.scan_iter(match="lock:*"):
            value = await self.client.get(key)
            if value:
                details = json.loads(value)
                details.pop("token", None)
                result[key.removeprefix("lock:")] = details
        return result

    async def count_keys(self, pattern: str) -> int:
        return sum(1 async for _ in self.client.scan_iter(match=pattern))

    async def get_cache(self, key: str) -> Optional[Any]:
        value = await self.client.get(f"cache:{key}")
        return json.loads(value) if value is not None else None

    async def set_cache(self, key: str, value: Any, ttl_sec: int = 60) -> None:
        await self.client.set(f"cache:{key}", json.dumps(value), ex=ttl_sec)

    async def ping(self) -> bool:
        try:
            return bool(await self.client.ping())
        except RedisError:
            return False

    async def close(self) -> None:
        await self.client.aclose()

from apps.api.app.config import settings

redis_client = RedisService(settings.REDIS_URL)
