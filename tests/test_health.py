# tests/test_health.py
"""
Smoke tests for Phase 1 Foundation.

These tests run without real model files or a real DuckDB file.
app.state is overridden directly after the TestClient context starts —
the lifespan is NOT triggered by TestClient by default, which is correct
for unit-level smoke tests.

If you need the full lifespan to run, use:
    with TestClient(app, raise_server_exceptions=False) as client:
        ...  # lifespan executes on __enter__
"""
from unittest.mock import MagicMock

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.main import app


def make_mock_models():
    """Create a mock LoadedModels-like object for tests."""
    mock = MagicMock()
    mock.xgb_heat = MagicMock()
    mock.xgb_risk = MagicMock()
    mock.tf_risk = MagicMock()
    return mock


def make_in_memory_db():
    """Create an in-memory DuckDB connection for tests (no file required)."""
    return duckdb.connect(":memory:")


class TestHealthEndpoint:
    """GET /api/v1/health — INFRA-03."""

    def test_health_returns_200_with_healthy_state(self):
        """Health endpoint returns 200 and correct JSON when state is set."""
        client = TestClient(app, raise_server_exceptions=True)
        # Inject mock state directly — lifespan not triggered
        app.state.db = make_in_memory_db()
        app.state.models = make_mock_models()

        response = client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["models_loaded"] is True
        assert data["db_connected"] is True

    def test_health_returns_ok_status_when_db_missing(self):
        """Health endpoint still returns 200 (not 500) when db is not set; db_connected=False."""
        client = TestClient(app, raise_server_exceptions=True)
        # Remove db from state — simulates partial startup
        if hasattr(app.state, "db"):
            del app.state.db
        app.state.models = make_mock_models()

        response = client.get("/api/v1/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["db_connected"] is False

    def test_health_response_schema(self):
        """Health response must have exactly {status, models_loaded, db_connected}."""
        client = TestClient(app, raise_server_exceptions=True)
        app.state.db = make_in_memory_db()
        app.state.models = make_mock_models()

        response = client.get("/api/v1/health")
        data = response.json()

        assert set(data.keys()) == {"status", "models_loaded", "db_connected"}


class TestOpenAPIDocs:
    """GET /docs — INFRA-04."""

    def test_docs_ui_returns_200(self):
        """Swagger UI is available at /docs (FastAPI default — never disabled)."""
        client = TestClient(app, raise_server_exceptions=True)
        response = client.get("/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]


class TestErrorHandlers:
    """Global exception handlers return {error, detail, status_code} — INFRA-08."""

    def test_404_returns_json_error_shape(self):
        """A request to an unknown route returns 404 JSON, not HTML."""
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/api/v1/nonexistent-route-xyz")

        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert "detail" in data
        assert "status_code" in data
        assert data["status_code"] == 404

    def test_method_not_allowed_returns_json_error_shape(self):
        """POST to a GET-only endpoint returns 405 JSON, not HTML."""
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/api/v1/health", json={})

        assert response.status_code == 405
        data = response.json()
        assert "error" in data
        assert "detail" in data
        assert "status_code" in data


class TestApiPrefix:
    """All routes served under /api/v1/ — INFRA-01."""

    def test_health_only_reachable_under_api_v1_prefix(self):
        """GET /health (without prefix) returns 404; GET /api/v1/health returns 200."""
        client = TestClient(app, raise_server_exceptions=False)
        app.state.db = make_in_memory_db()
        app.state.models = make_mock_models()

        no_prefix = client.get("/health")
        with_prefix = client.get("/api/v1/health")

        assert no_prefix.status_code == 404
        assert with_prefix.status_code == 200


class TestCORS:
    """CORS configured to allow all origins — INFRA-02."""

    def test_cors_headers_present_on_health_response(self):
        """CORS headers are present on a cross-origin request to /api/v1/health."""
        client = TestClient(app, raise_server_exceptions=True)
        app.state.db = make_in_memory_db()
        app.state.models = make_mock_models()

        response = client.get(
            "/api/v1/health",
            headers={"Origin": "http://localhost:3000"},
        )

        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "*"
