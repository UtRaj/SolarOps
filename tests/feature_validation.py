"""Repository contract checks for the primary SolarOps product surfaces."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_core_application_sources_are_present():
    required = [
        "src/App.tsx",
        "src/main.tsx",
        "server.ts",
        "apps/api/app/main.py",
        "apps/worker/main.py",
        "docker-compose.yml",
        "README.md",
    ]
    assert all((ROOT / path).is_file() for path in required)


def test_existing_user_features_remain_in_the_application():
    app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
    required_views = ["overview", "orders", "chat", "solar-grid", "fleet", "battery", "map"]
    assert all(view in app_source for view in required_views)
    assert (ROOT / "src/components/MerchantOrderChat.tsx").is_file()
    assert (ROOT / "src/server/openSourceAI.ts").is_file()


def test_compose_contains_the_complete_local_service_stack():
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    expected = {"web", "api", "worker", "postgres", "redis", "nats", "prometheus"}
    assert expected <= compose["services"].keys()
    assert compose["services"]["postgres"]["healthcheck"]
    assert compose["services"]["redis"]["healthcheck"]
    assert compose["services"]["api"]["depends_on"]["postgres"]["condition"] == "service_healthy"


def test_local_secrets_and_generated_build_outputs_are_ignored():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert ".env" in gitignore
    assert "node_modules/" in gitignore
    assert "dist/" in gitignore
    assert "!.env.example" in gitignore
    assert (ROOT / ".env.example").is_file()


def test_core_api_and_worker_capabilities_are_present():
    api_source = (ROOT / "apps/api/app/main.py").read_text(encoding="utf-8")
    worker_source = (ROOT / "apps/worker/main.py").read_text(encoding="utf-8")
    for route in ("/api/v1/health", "/api/v1/ready", "/api/v1/orders/quote", "/api/v1/alerts"):
        assert route in api_source
    assert "skip_locked=True" in worker_source
    assert "Nats-Msg-Id" in worker_source
