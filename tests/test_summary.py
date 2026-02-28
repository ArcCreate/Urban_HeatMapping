# tests/test_summary.py
"""
Tests for county summary endpoint.
Covers: SUM-01

Uses test_db fixture. Test data:
    2 tracts with xgb_heat_scores 0.82 and 0.55
    Expected: tract_count=2, mean_heat=(0.82+0.55)/2=0.685,
              p75 between 0.55 and 0.82, high_risk_count=1 (0.82 > 0.75)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import test_db  # noqa: F401


@pytest.fixture
def client(test_db):
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)


class TestCountySummary:
    """SUM-01: GET /api/v1/summary/county"""

    def test_returns_200(self, client):
        response = client.get("/api/v1/summary/county")
        assert response.status_code == 200

    def test_response_has_all_required_fields(self, client):
        data = client.get("/api/v1/summary/county").json()
        assert "tract_count" in data
        assert "mean_heat_score" in data
        assert "p75_heat_score" in data
        assert "high_risk_tract_count" in data

    def test_tract_count_matches_fixture(self, client):
        data = client.get("/api/v1/summary/county").json()
        assert data["tract_count"] == 2

    def test_mean_heat_score_is_correct(self, client):
        """mean_heat = (0.82 + 0.55) / 2 = 0.685"""
        data = client.get("/api/v1/summary/county").json()
        assert abs(data["mean_heat_score"] - 0.685) < 0.01

    def test_high_risk_tract_count_uses_0_75_threshold(self, client):
        """Only Seattle (0.82) exceeds the 0.75 threshold — count should be 1."""
        data = client.get("/api/v1/summary/county").json()
        assert data["high_risk_tract_count"] == 1

    def test_p75_heat_score_is_float(self, client):
        data = client.get("/api/v1/summary/county").json()
        assert isinstance(data["p75_heat_score"], float)
        # With 2 values (0.55, 0.82), p75 should be between them
        assert 0.55 <= data["p75_heat_score"] <= 0.82

    def test_all_values_are_correct_types(self, client):
        data = client.get("/api/v1/summary/county").json()
        assert isinstance(data["tract_count"], int)
        assert isinstance(data["mean_heat_score"], float)
        assert isinstance(data["p75_heat_score"], float)
        assert isinstance(data["high_risk_tract_count"], int)
