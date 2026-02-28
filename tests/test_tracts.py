# tests/test_tracts.py
"""
Tests for tract data endpoints.
Covers: TRACT-01, TRACT-02, TRACT-03, BATCH-01

Uses test_db fixture (in-memory DuckDB) — does not require king_county.duckdb.
Test tract IDs from fixture:
    '53033010800' — Seattle, xgb_heat_score=0.82
    '53033029306' — Kent, xgb_heat_score=0.55
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import test_db  # noqa: F401 — imported for pytest fixture


@pytest.fixture
def client(test_db):
    """TestClient with test_db injected into app.state."""
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)


class TestTractList:
    """TRACT-01: GET /api/v1/tracts — GeoJSON FeatureCollection"""

    def test_returns_200(self, client):
        response = client.get("/api/v1/tracts")
        assert response.status_code == 200

    def test_response_is_feature_collection(self, client):
        data = client.get("/api/v1/tracts").json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data
        assert isinstance(data["features"], list)

    def test_features_have_geometry_as_dict_not_string(self, client):
        """CRITICAL: geometry must be a dict, not an escaped JSON string."""
        features = client.get("/api/v1/tracts").json()["features"]
        assert len(features) > 0
        for feature in features:
            assert isinstance(feature["geometry"], dict), \
                f"geometry must be dict, got {type(feature['geometry'])}: {feature['geometry'][:50]!r}"
            assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")

    def test_features_have_required_properties(self, client):
        features = client.get("/api/v1/tracts").json()["features"]
        for feature in features:
            props = feature["properties"]
            assert "tract_id" in props
            assert "xgb_heat_score" in props
            assert "xgb_risk_score" in props
            assert "tf_risk_score" in props

    def test_returns_two_tracts_from_fixture(self, client):
        features = client.get("/api/v1/tracts").json()["features"]
        assert len(features) == 2


class TestTractDetail:
    """TRACT-02: GET /api/v1/tracts/{tract_id}"""

    def test_returns_200_for_valid_tract(self, client):
        response = client.get("/api/v1/tracts/53033010800")
        assert response.status_code == 200

    def test_returns_404_for_unknown_tract(self, client):
        response = client.get("/api/v1/tracts/99999999999")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["status_code"] == 404

    def test_detail_contains_all_required_fields(self, client):
        data = client.get("/api/v1/tracts/53033010800").json()
        assert data["tract_id"] == "53033010800"
        assert "xgb_heat_score" in data
        assert "xgb_risk_score" in data
        assert "tf_risk_score" in data
        # Feature columns
        assert "mean_afternoon_temp" in data
        assert "mean_tree_cov" in data
        assert "mean_svi_overall" in data
        assert "city_name" in data

    def test_detail_scores_match_fixture_values(self, client):
        data = client.get("/api/v1/tracts/53033010800").json()
        assert abs(data["xgb_heat_score"] - 0.82) < 0.01
        assert abs(data["xgb_risk_score"] - 0.74) < 0.01
        assert abs(data["tf_risk_score"] - 0.71) < 0.01


class TestTractGeometry:
    """TRACT-03: GET /api/v1/tracts/{tract_id}/geometry"""

    def test_returns_200_for_valid_tract(self, client):
        response = client.get("/api/v1/tracts/53033010800/geometry")
        assert response.status_code == 200

    def test_returns_404_for_unknown_tract(self, client):
        response = client.get("/api/v1/tracts/99999999999/geometry")
        assert response.status_code == 404

    def test_response_is_geojson_feature(self, client):
        data = client.get("/api/v1/tracts/53033010800/geometry").json()
        assert data["type"] == "Feature"
        assert "geometry" in data
        assert isinstance(data["geometry"], dict), "geometry must be dict, not string"
        assert data["geometry"]["type"] in ("Polygon", "MultiPolygon")

    def test_geometry_response_has_no_feature_vector(self, client):
        """TRACT-03: geometry endpoint returns no feature columns."""
        data = client.get("/api/v1/tracts/53033010800/geometry").json()
        props = data.get("properties", {})
        # Only tract_id should be in properties — no feature vector columns
        assert "mean_afternoon_temp" not in props
        assert "xgb_heat_score" not in props


class TestTractBatch:
    """BATCH-01: POST /api/v1/tracts/batch"""

    def test_returns_200_for_valid_ids(self, client):
        response = client.post(
            "/api/v1/tracts/batch",
            json={"tract_ids": ["53033010800", "53033029306"]}
        )
        assert response.status_code == 200

    def test_returns_list_of_tract_details(self, client):
        data = client.post(
            "/api/v1/tracts/batch",
            json={"tract_ids": ["53033010800", "53033029306"]}
        ).json()
        assert isinstance(data, list)
        assert len(data) == 2
        for tract in data:
            assert "tract_id" in tract
            assert "xgb_heat_score" in tract

    def test_empty_tract_ids_returns_422(self, client):
        response = client.post("/api/v1/tracts/batch", json={"tract_ids": []})
        assert response.status_code == 422

    def test_unknown_ids_omitted_not_404(self, client):
        """Batch partial match: unrecognized IDs are silently omitted."""
        data = client.post(
            "/api/v1/tracts/batch",
            json={"tract_ids": ["53033010800", "99999999999"]}
        ).json()
        assert len(data) == 1
        assert data[0]["tract_id"] == "53033010800"
