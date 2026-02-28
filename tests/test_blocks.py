# tests/test_blocks.py
"""
Tests for block data endpoints.
Covers: BLOCK-01, BLOCK-02

Uses test_db fixture (in-memory DuckDB) — no king_county.duckdb required.
Test block data from fixture:
    block_id='530330108001016', tract_id='53033010800', city='Seattle'
    block_id='530330108001017', tract_id='53033010800', city='Seattle'
    block_id='530330293061005', tract_id='53033029306', city='Kent'
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import blocks as blocks_router_module
from tests.fixtures import test_db  # noqa: F401

# Wire blocks router into app if not already registered (Plan 02-05 is the canonical
# main.py writer; this ensures tests pass before 02-05 runs).
_blocks_routes_registered = any(
    getattr(r, "path", "").startswith("/api/v1/blocks")
    for r in app.routes
)
if not _blocks_routes_registered:
    app.include_router(blocks_router_module.router, prefix="/api/v1")


@pytest.fixture
def client(test_db):
    """TestClient with test_db injected into app.state."""
    app.state.db = test_db
    return TestClient(app, raise_server_exceptions=True)


class TestBlocksByTract:
    """BLOCK-01: GET /api/v1/blocks?tract_id={id}"""

    def test_returns_200_for_valid_tract(self, client):
        response = client.get("/api/v1/blocks?tract_id=53033010800")
        assert response.status_code == 200

    def test_returns_422_when_tract_id_missing(self, client):
        """CRITICAL: tract_id is required — missing it must return 422, not 500."""
        response = client.get("/api/v1/blocks")
        assert response.status_code == 422

    def test_response_is_feature_collection(self, client):
        data = client.get("/api/v1/blocks?tract_id=53033010800").json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data
        assert isinstance(data["features"], list)

    def test_returns_blocks_for_correct_tract(self, client):
        """Should return 2 blocks for tract 53033010800 (not the Kent block)."""
        features = client.get("/api/v1/blocks?tract_id=53033010800").json()["features"]
        assert len(features) == 2
        for feature in features:
            assert feature["properties"]["tract_id"] == "53033010800"

    def test_geometry_is_dict_not_string(self, client):
        """CRITICAL: geometry must be a dict, not an escaped JSON string."""
        features = client.get("/api/v1/blocks?tract_id=53033010800").json()["features"]
        assert len(features) > 0
        for feature in features:
            assert isinstance(feature["geometry"], dict), \
                f"geometry must be dict, got {type(feature['geometry'])}"
            assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")

    def test_features_have_required_properties(self, client):
        features = client.get("/api/v1/blocks?tract_id=53033010800").json()["features"]
        for feature in features:
            props = feature["properties"]
            assert "block_id" in props
            assert "tract_id" in props

    def test_empty_result_for_unknown_tract(self, client):
        """Querying a tract with no blocks returns empty FeatureCollection."""
        data = client.get("/api/v1/blocks?tract_id=99999999999").json()
        assert data["type"] == "FeatureCollection"
        assert data["features"] == []


class TestBlockDetail:
    """BLOCK-02: GET /api/v1/blocks/{block_id}"""

    def test_returns_200_for_valid_block(self, client):
        response = client.get("/api/v1/blocks/530330108001016")
        assert response.status_code == 200

    def test_returns_404_for_unknown_block(self, client):
        response = client.get("/api/v1/blocks/999999999999999")
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["status_code"] == 404

    def test_detail_has_required_fields(self, client):
        data = client.get("/api/v1/blocks/530330108001016").json()
        assert data["block_id"] == "530330108001016"
        assert data["tract_id"] == "53033010800"
        assert "mean_afternoon_temp" in data
        assert "city_name" in data

    def test_detail_does_not_contain_geometry(self, client):
        """BLOCK-02 detail endpoint returns typed JSON, not GeoJSON."""
        data = client.get("/api/v1/blocks/530330108001016").json()
        assert "geometry" not in data
        assert "type" not in data or data.get("type") not in ("Feature", "FeatureCollection")
