# tests/fixtures.py
"""
Shared pytest fixtures for Phase 2 data endpoint tests.

The test_db fixture creates an in-memory DuckDB with the production table
schema and a small set of test rows — no king_county.duckdb file required.
All Phase 2 test files import from here.

Usage in a test file:
    from tests.fixtures import test_db

    def test_something(test_db):
        ...
"""
import duckdb
import pytest


@pytest.fixture
def test_db():
    """
    In-memory DuckDB with Phase 2 table schema and minimal test data.

    Tables created:
        tract_features          — 2 test tracts with geometry_wkt
        tract_outputs_with_preds — 2 test tracts with model scores
        blocks                  — 3 test blocks (2 in tract 53033010800, 1 in 53033010900)

    Geometry: valid WKT triangles in WGS84 (King County longitude/latitude range).
    Scores: within [0, 1] range.
    """
    con = duckdb.connect(":memory:")
    con.execute("INSTALL spatial; LOAD spatial;")

    # ── tract_features ─────────────────────────────────────────────────────
    con.execute("""
        CREATE TABLE tract_features (
            tract_id            VARCHAR PRIMARY KEY,
            mean_afternoon_temp DOUBLE,
            mean_morning_temp   DOUBLE,
            mean_evening_temp   DOUBLE,
            mean_tree_cov       DOUBLE,
            mean_imperv         DOUBLE,
            mean_dist_water     DOUBLE,
            mean_cvd_rate       DOUBLE,
            mean_diabetes       DOUBLE,
            mean_life_expectancy DOUBLE,
            mean_svi_overall    DOUBLE,
            mean_poverty2x      DOUBLE,
            mean_disability     DOUBLE,
            mean_limited_english DOUBLE,
            mean_under18        DOUBLE,
            mean_severe_cost    DOUBLE,
            city_name           VARCHAR,
            geometry_wkt        VARCHAR
        )
    """)
    con.execute("""
        INSERT INTO tract_features VALUES
        (
            '53033010800', 90.3, 65.8, 85.6,
            0.12, 0.65, 13996.0,
            223.0, 0.13, 78.2,
            0.45, 22.9, 8.3, 8.3,
            21.1, 17.9,
            'Seattle',
            'POLYGON ((-122.36 47.60, -122.34 47.60, -122.34 47.61, -122.36 47.60))'
        ),
        (
            '53033029306', 89.2, 60.8, 83.4,
            0.22, 0.45, 27000.0,
            181.0, 0.10, 78.0,
            0.55, 21.6, 12.9, 25.2,
            21.4, 7.1,
            'Kent',
            'POLYGON ((-122.20 47.38, -122.18 47.38, -122.18 47.40, -122.20 47.38))'
        )
    """)

    # ── tract_outputs_with_preds ────────────────────────────────────────────
    con.execute("""
        CREATE TABLE tract_outputs_with_preds (
            tract_id        VARCHAR PRIMARY KEY,
            xgb_heat_score  DOUBLE,
            xgb_risk_score  DOUBLE,
            tf_risk_score   DOUBLE
        )
    """)
    con.execute("""
        INSERT INTO tract_outputs_with_preds VALUES
        ('53033010800', 0.82, 0.74, 0.71),
        ('53033029306', 0.55, 0.48, 0.50)
    """)

    # ── blocks ─────────────────────────────────────────────────────────────
    con.execute("""
        CREATE TABLE blocks (
            block_id            VARCHAR PRIMARY KEY,
            tract_id            VARCHAR,
            mean_afternoon_temp DOUBLE,
            mean_morning_temp   DOUBLE,
            mean_evening_temp   DOUBLE,
            mean_tree_cov       DOUBLE,
            mean_imperv         DOUBLE,
            city_name           VARCHAR,
            geometry_wkt        VARCHAR
        )
    """)
    con.execute("""
        INSERT INTO blocks VALUES
        (
            '530330108001016', '53033010800',
            90.5, 65.7, 85.6,
            0.10, 0.90,
            'Seattle',
            'POLYGON ((-122.36 47.60, -122.35 47.60, -122.35 47.605, -122.36 47.60))'
        ),
        (
            '530330108001017', '53033010800',
            89.8, 65.0, 84.9,
            0.14, 0.80,
            'Seattle',
            'POLYGON ((-122.355 47.60, -122.345 47.60, -122.345 47.605, -122.355 47.60))'
        ),
        (
            '530330293061005', '53033029306',
            90.3, 61.1, 86.4,
            0.22, 0.13,
            'Kent',
            'POLYGON ((-122.20 47.38, -122.19 47.38, -122.19 47.385, -122.20 47.38))'
        )
    """)

    yield con
    con.close()
