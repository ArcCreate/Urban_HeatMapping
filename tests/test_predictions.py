# tests/test_predictions.py
"""
Tests for prediction endpoints.
Covers: PRED-01, PRED-02

Uses test_db fixture (in-memory DuckDB — no king_county.duckdb required).
Test data from fixture:
    '53033010800': xgb_heat_score=0.82, xgb_risk_score=0.74, tf_risk_score=0.71
    '53033029306': xgb_heat_score=0.55, xgb_risk_score=0.48, tf_risk_score=0.50
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import test_db  # noqa: F401


@pytest.fixture
def client(test_db):
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)


class TestTractPredictions:
    """PRED-01: GET /api/v1/predictions/tracts"""

    def test_returns_200(self, client):
        response = client.get("/api/v1/predictions/tracts")
        assert response.status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/v1/predictions/tracts").json()
        assert isinstance(data, list)
        assert len(data) == 2  # 2 tracts in fixture

    def test_each_item_has_required_fields(self, client):
        data = client.get("/api/v1/predictions/tracts").json()
        for item in data:
            assert "tract_id" in item
            assert "xgb_heat_score" in item
            assert "xgb_risk_score" in item
            assert "tf_risk_score" in item

    def test_no_geometry_in_response(self, client):
        """PRED-01 must not include geometry — lightweight for frontend coloring."""
        data = client.get("/api/v1/predictions/tracts").json()
        for item in data:
            assert "geometry" not in item
            assert "type" not in item  # no GeoJSON Feature wrapper

    def test_scores_are_in_0_1_range(self, client):
        data = client.get("/api/v1/predictions/tracts").json()
        for item in data:
            assert 0.0 <= item["xgb_heat_score"] <= 1.0
            assert 0.0 <= item["xgb_risk_score"] <= 1.0
            assert 0.0 <= item["tf_risk_score"] <= 1.0


class TestRankedTractPredictions:
    """PRED-02: GET /api/v1/predictions/tracts/ranked"""

    def test_returns_200_with_defaults(self, client):
        response = client.get("/api/v1/predictions/tracts/ranked")
        assert response.status_code == 200

    def test_default_sort_by_heat_desc(self, client):
        """Default: sort_by=xgb_heat_score, order=desc — highest heat first."""
        data = client.get("/api/v1/predictions/tracts/ranked").json()
        assert len(data) >= 1
        # Seattle (0.82) should be first, Kent (0.55) second
        assert data[0]["tract_id"] == "53033010800"
        assert abs(data[0]["xgb_heat_score"] - 0.82) < 0.01

    def test_sort_asc_returns_lowest_first(self, client):
        data = client.get(
            "/api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=asc&limit=10"
        ).json()
        # Kent (0.55) should be first
        assert data[0]["tract_id"] == "53033029306"

    def test_limit_respected(self, client):
        data = client.get("/api/v1/predictions/tracts/ranked?limit=1").json()
        assert len(data) == 1

    def test_invalid_sort_by_returns_422(self, client):
        """CRITICAL: Invalid sort_by must return 422 (enum validation), not 500."""
        response = client.get(
            "/api/v1/predictions/tracts/ranked?sort_by=invalid_column"
        )
        assert response.status_code == 422

    def test_invalid_order_returns_422(self, client):
        response = client.get(
            "/api/v1/predictions/tracts/ranked?order=sideways"
        )
        assert response.status_code == 422

    def test_limit_below_1_returns_422(self, client):
        response = client.get(
            "/api/v1/predictions/tracts/ranked?limit=0"
        )
        assert response.status_code == 422

    def test_sort_by_risk_score(self, client):
        data = client.get(
            "/api/v1/predictions/tracts/ranked?sort_by=xgb_risk_score&order=desc&limit=10"
        ).json()
        # Seattle risk 0.74 > Kent risk 0.48
        assert data[0]["xgb_risk_score"] >= data[-1]["xgb_risk_score"]

    def test_response_has_no_geometry(self, client):
        data = client.get("/api/v1/predictions/tracts/ranked").json()
        for item in data:
            assert "geometry" not in item
