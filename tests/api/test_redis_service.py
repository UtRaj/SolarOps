import json

import pytest

from apps.api.app.infrastructure.redis.service import RedisService


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.counts = {}
        self.last_set = None

    async def set(self, key, value, nx=False, ex=None):
        self.last_set = (key, value, nx, ex)
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def register_script(self, _script):
        async def run(keys, args):
            key = keys[0]
            if key.startswith("rate-limit:"):
                self.counts[key] = self.counts.get(key, 0) + 1
                return self.counts[key]
            current = self.values.get(key)
            if current is None or json.loads(current)["token"] != args[0]:
                return 0
            del self.values[key]
            return 1
        return run

    async def get(self, key):
        return self.values.get(key)

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def scan_iter(self, match):
        prefix = match.rstrip("*")
        for key in list(self.values):
            if key.startswith(prefix):
                yield key

    async def aclose(self):
        return None


@pytest.fixture
def service():
    redis = RedisService("redis://localhost")
    redis.client = FakeRedis()
    return redis


@pytest.mark.asyncio
async def test_lock_is_token_owned_and_release_is_idempotent(service):
    token = await service.acquire_lock("truck:42", 30, "operator")
    assert token
    assert service.client.last_set[0] == "lock:truck:42"
    assert service.client.last_set[2:] == (True, 30)
    assert await service.release_lock("truck:42", "wrong-token") is False
    assert await service.release_lock("truck:42", token) is True
    assert await service.release_lock("truck:42", token) is False


@pytest.mark.asyncio
async def test_lock_listing_hides_ownership_tokens(service):
    await service.acquire_lock("resource-a", 10, "operator")
    locks = await service.active_locks()
    assert "resource-a" in locks
    assert locks["resource-a"]["locked_by"] == "operator"
    assert "token" not in locks["resource-a"]


@pytest.mark.asyncio
async def test_idempotency_key_accepts_only_first_use(service):
    assert await service.verify_idempotency_key("request-1", ttl_sec=60) is True
    assert await service.verify_idempotency_key("request-1", ttl_sec=60) is False


@pytest.mark.asyncio
async def test_rate_limiter_allows_limit_and_counts_blocked_calls(service):
    for _ in range(2):
        assert await service.check_rate_limit("client", max_requests=2) is True
    assert await service.check_rate_limit("client", max_requests=2) is False
    assert service.client.counts["rate-limit-blocked"] == 1


@pytest.mark.asyncio
async def test_json_cache_round_trips_structured_values(service):
    data = {"state": "ready", "values": [1, 2, 3]}
    await service.set_cache("status", data, ttl_sec=15)
    assert await service.get_cache("status") == data
    assert await service.get_cache("missing") is None
