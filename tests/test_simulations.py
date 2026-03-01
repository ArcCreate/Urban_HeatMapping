# tests/test_simulations.py
"""
Integration tests for simulation endpoints (SIM-01 and SIM-02).

POST /api/v1/simulations/what-if — single intervention set across tracts
POST /api/v1/simulations/compare — two scenarios side-by-side

Fixture tracts:
    '53033010800': mean_afternoon_temp=90.3, xgb_heat_score=0.82, xgb_risk_score=0.74
    '53033029306': mean_afternoon_temp=89.2, xgb_heat_score=0.55, xgb_risk_score=0.48
"""
import pytest
from fastapi.testclient import TestClient

from tests.fixtures import test_db  # noqa: F401
from app.main import app
from app.routers import simulations

# Ensure router is registered (idempotent — main.py wires it in Plan 02 Task 1)
if not any(hasattr(r, "path") and "/simulations" in getattr(r, "path", "") for r in app.routes):
    app.include_router(simulations.router, prefix="/api/v1")


@pytest.fixture
def client(test_db):
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)


class TestWhatIf:
    """Tests for POST /api/v1/simulations/what-if (SIM-01)."""

    def test_what_if_returns_200_with_delta_results(self, client):
        """Single tract with tree canopy intervention returns cooling deltas."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["53033010800"], "interventions": {"tree_canopy_pct": 10.0}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["tract_id"] == "53033010800"
        assert isinstance(data[0]["delta_temp"], float)
        assert data[0]["delta_temp"] < 0  # cooling is negative
        assert isinstance(data[0]["delta_risk"], float)
        assert data[0]["delta_risk"] < 0  # risk decreases with cooling

    def test_what_if_multiple_tracts(self, client):
        """Both fixture tracts with mixed interventions returns two results."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={
                "tract_ids": ["53033010800", "53033029306"],
                "interventions": {"tree_canopy_pct": 5.0, "albedo_delta": 0.1},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        returned_ids = {item["tract_id"] for item in data}
        assert "53033010800" in returned_ids
        assert "53033029306" in returned_ids

    def test_what_if_all_interventions_zero(self, client):
        """Empty interventions object (all None) returns zero deltas."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["53033010800"], "interventions": {}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["delta_temp"] == 0.0
        assert data[0]["delta_risk"] == 0.0

    def test_what_if_empty_tract_ids_returns_422(self, client):
        """Empty tract_ids list fails schema validation — returns 422."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": [], "interventions": {}},
        )
        assert resp.status_code == 422
        assert "error" in resp.json()

    def test_what_if_unknown_tract_returns_404(self, client):
        """Unrecognized tract_id raises 404 from service layer."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["99999999999"], "interventions": {"tree_canopy_pct": 5.0}},
        )
        assert resp.status_code == 404
        assert resp.json()["status_code"] == 404

    def test_what_if_canopy_above_100_returns_422(self, client):
        """tree_canopy_pct > 100 violates field bound — returns 422."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["53033010800"], "interventions": {"tree_canopy_pct": 150.0}},
        )
        assert resp.status_code == 422

    def test_what_if_albedo_above_1_returns_422(self, client):
        """albedo_delta > 1.0 violates field bound — returns 422."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["53033010800"], "interventions": {"albedo_delta": 1.5}},
        )
        assert resp.status_code == 422

    def test_what_if_negative_intervention_returns_422(self, client):
        """Negative tree_canopy_pct violates ge=0 bound — returns 422."""
        resp = client.post(
            "/api/v1/simulations/what-if",
            json={"tract_ids": ["53033010800"], "interventions": {"tree_canopy_pct": -5.0}},
        )
        assert resp.status_code == 422


class TestCompare:
    """Tests for POST /api/v1/simulations/compare (SIM-02)."""

    def test_compare_returns_200_with_scenario_fields(self, client):
        """Single tract compare returns scenario_a and scenario_b fields with deltas."""
        resp = client.post(
            "/api/v1/simulations/compare",
            json={
                "tract_ids": ["53033010800"],
                "scenario_a": {"tree_canopy_pct": 5.0},
                "scenario_b": {"tree_canopy_pct": 20.0},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["tract_id"] == "53033010800"
        assert "scenario_a" in data[0]
        assert "scenario_b" in data[0]
        assert "delta_temp" in data[0]["scenario_a"]
        assert "delta_risk" in data[0]["scenario_a"]

    def test_compare_scenarios_differ(self, client):
        """Stronger intervention (scenario_b) produces more cooling than weaker (scenario_a)."""
        resp = client.post(
            "/api/v1/simulations/compare",
            json={
                "tract_ids": ["53033010800"],
                "scenario_a": {"tree_canopy_pct": 5.0},
                "scenario_b": {"tree_canopy_pct": 20.0},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data[0]["scenario_a"]["delta_temp"] != data[0]["scenario_b"]["delta_temp"]
        # scenario_b (20% canopy) should produce more cooling (more negative) than scenario_a (5%)
        assert data[0]["scenario_b"]["delta_temp"] < data[0]["scenario_a"]["delta_temp"]

    def test_compare_empty_tract_ids_returns_422(self, client):
        """Empty tract_ids in compare request fails schema validation — returns 422."""
        resp = client.post(
            "/api/v1/simulations/compare",
            json={
                "tract_ids": [],
                "scenario_a": {"tree_canopy_pct": 5.0},
                "scenario_b": {"tree_canopy_pct": 20.0},
            },
        )
        assert resp.status_code == 422

    def test_compare_unknown_tract_returns_404(self, client):
        """Unknown tract_id in compare request raises 404 from service layer."""
        resp = client.post(
            "/api/v1/simulations/compare",
            json={
                "tract_ids": ["99999999999"],
                "scenario_a": {"tree_canopy_pct": 5.0},
                "scenario_b": {"tree_canopy_pct": 20.0},
            },
        )
        assert resp.status_code == 404
