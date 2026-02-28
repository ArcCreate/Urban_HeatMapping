#!/usr/bin/env python3
"""
Build king_county.duckdb from raw CSV sources + Census TIGER/Line geometry.

USAGE (from project root, with pipeline deps installed):
    pip install -r scripts/requirements-pipeline.txt
    python scripts/build_duckdb.py

OUTPUTS:
    king_county.duckdb  — DuckDB file with 3 tables:
        - tract_features          (492 rows, features + geometry_wkt)
        - tract_outputs_with_preds (492 rows, placeholder model scores [0,1])
        - blocks                  (25,552 rows, block attributes + geometry_wkt)

NOTE ON SCORES:
    tract_outputs_with_preds is populated with PLACEHOLDER scores
    derived from normalizing the raw PRED columns in TempKC.csv.
    Replace with real model outputs from the ML training pipeline
    (XGBoost heat, XGBoost risk, TensorFlow risk) when available.
"""

import json
import logging
import sys
from pathlib import Path

import duckdb
import geopandas as gpd
import pandas as pd
import pygris

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
CSV_BLOCKS = PROJECT_ROOT / "HeatHealthKC.csv"
CSV_TRACTS = PROJECT_ROOT / "TempKC.csv"
DUCKDB_PATH = PROJECT_ROOT / "king_county.duckdb"

KING_COUNTY_STATE = "WA"
KING_COUNTY_FIPS  = "033"
TIGER_YEAR        = 2020


def build(overwrite: bool = True) -> None:
    if DUCKDB_PATH.exists() and overwrite:
        log.info("Removing existing %s", DUCKDB_PATH)
        DUCKDB_PATH.unlink()

    log.info("Connecting to %s", DUCKDB_PATH)
    con = duckdb.connect(str(DUCKDB_PATH))
    con.execute("INSTALL spatial; LOAD spatial;")

    # ── Step 1: Load raw CSVs ─────────────────────────────────────────────
    log.info("Loading HeatHealthKC.csv (%s)...", CSV_BLOCKS)
    con.execute(f"""
        CREATE TABLE blocks_raw AS
        SELECT * FROM read_csv_auto('{CSV_BLOCKS}', header=True, ignore_errors=True)
    """)
    block_count = con.execute("SELECT COUNT(*) FROM blocks_raw").fetchone()[0]
    log.info("  blocks_raw: %d rows", block_count)

    log.info("Loading TempKC.csv (%s)...", CSV_TRACTS)
    con.execute(f"""
        CREATE TABLE tract_preds_raw AS
        SELECT * FROM read_csv_auto('{CSV_TRACTS}', header=True, ignore_errors=True)
    """)
    pred_count = con.execute("SELECT COUNT(*) FROM tract_preds_raw").fetchone()[0]
    log.info("  tract_preds_raw: %d rows", pred_count)

    # ── Step 2: Aggregate blocks → tract_features ─────────────────────────
    # Join key: RIGHT(TempKC.GEO_ID, 11) = CAST(HeatHealthKC."TRACT GEO ID" AS VARCHAR)
    # This yields 492 joinable tracts.
    log.info("Aggregating blocks to tract level...")
    con.execute("""
        CREATE TABLE tract_features AS
        SELECT
            CAST(b."TRACT GEO ID" AS VARCHAR)                           AS tract_id,
            AVG(b."Median afternoon temperature")                        AS mean_afternoon_temp,
            AVG(b."Median morning temperature")                          AS mean_morning_temp,
            AVG(b."Median evening temperature")                          AS mean_evening_temp,
            AVG(b."Percent tree coverage")                               AS mean_tree_cov,
            AVG(b."Percent impervious coverage")                         AS mean_imperv,
            AVG(b."Mean distance to water")                              AS mean_dist_water,
            AVG(b."Cardiovascular disease mortality rate")               AS mean_cvd_rate,
            AVG(b."Percent adults with diabetes")                        AS mean_diabetes,
            AVG(b."Life expectancy")                                     AS mean_life_expectancy,
            AVG(b."SVI Overall percentile ranking")                      AS mean_svi_overall,
            AVG(b."Percent of population whose income in the past 12 months is under 2.00x (200% of) the federal poverty level")
                                                                         AS mean_poverty2x,
            AVG(b."Percent of population with a disability")             AS mean_disability,
            AVG(b."Percent of adults 18 years and over who have limited English ability")
                                                                         AS mean_limited_english,
            AVG(b."Percent under 18 years old")                         AS mean_under18,
            AVG(b."Percent severe housing cost burdened")               AS mean_severe_cost,
            ANY_VALUE(b.CITYNAME)                                        AS city_name,
            NULL::VARCHAR                                                AS geometry_wkt
        FROM blocks_raw b
        GROUP BY CAST(b."TRACT GEO ID" AS VARCHAR)
    """)
    tract_count = con.execute("SELECT COUNT(*) FROM tract_features").fetchone()[0]
    log.info("  tract_features: %d rows", tract_count)

    # ── Step 3: Download TIGER tract geometry via pygris ─────────────────
    log.info("Downloading Census TIGER tract geometry (state=%s, county=%s, year=%d)...",
             KING_COUNTY_STATE, KING_COUNTY_FIPS, TIGER_YEAR)
    tracts_gdf = pygris.tracts(
        state=KING_COUNTY_STATE, county=KING_COUNTY_FIPS,
        year=TIGER_YEAR, cb=True  # cb=True = cartographic boundary (simplified)
    )
    tracts_gdf = tracts_gdf.to_crs("EPSG:4326")  # GeoJSON requires WGS84 — critical
    log.info("  Downloaded %d tract geometries", len(tracts_gdf))

    # GEOID column from pygris is 11-digit string — matches tract_id in tract_features
    tract_geom_map: dict[str, str] = {
        row["GEOID"]: row["geometry"].wkt
        for _, row in tracts_gdf.iterrows()
    }

    # Merge WKT geometry back into tract_features via pandas bridge
    df_tracts = con.execute(
        "SELECT tract_id FROM tract_features"
    ).fetchdf()
    df_tracts["geometry_wkt"] = df_tracts["tract_id"].map(tract_geom_map)

    matched = df_tracts["geometry_wkt"].notna().sum()
    log.info("  Geometry matched for %d / %d tracts", matched, len(df_tracts))
    if matched < len(df_tracts) * 0.9:
        log.warning("  WARNING: fewer than 90%% of tracts matched geometry — check GEOID join keys")

    # Register the pandas DataFrame and UPDATE tract_features
    con.register("tract_geom_update", df_tracts)
    con.execute("""
        UPDATE tract_features AS tf
        SET geometry_wkt = tgu.geometry_wkt
        FROM tract_geom_update AS tgu
        WHERE tf.tract_id = tgu.tract_id
    """)
    log.info("  tract_features geometry_wkt column populated")

    # ── Step 4: Create tract_outputs_with_preds (placeholder scores) ──────
    # Scores are NORMALIZED to [0,1] range from PRED12_PE (percentage, 0–100).
    # The JOIN key: RIGHT(GEO_ID, 11) matches tract_id in tract_features.
    # Replace these placeholder scores with real XGBoost/TF model outputs from
    # the offline training pipeline when trained model files are available.
    log.info("Creating tract_outputs_with_preds with normalized placeholder scores...")
    con.execute("""
        CREATE TABLE tract_outputs_with_preds AS
        SELECT
            tf.tract_id,
            -- xgb_heat_score: derived from PRED0_PE (normalized to [0,1])
            ROUND(
                COALESCE(
                    CAST(tp.PRED0_PE AS DOUBLE) / 100.0,
                    0.5  -- fallback if join fails
                ), 4
            ) AS xgb_heat_score,
            -- xgb_risk_score: derived from PRED12_PE (normalized to [0,1])
            ROUND(
                COALESCE(
                    CAST(tp.PRED12_PE AS DOUBLE) / 100.0,
                    0.5
                ), 4
            ) AS xgb_risk_score,
            -- tf_risk_score: derived from PRED3_PE (normalized to [0,1])
            ROUND(
                COALESCE(
                    CAST(tp.PRED3_PE AS DOUBLE) / 100.0,
                    0.5
                ), 4
            ) AS tf_risk_score
        FROM tract_features tf
        LEFT JOIN tract_preds_raw tp
            ON tf.tract_id = RIGHT(tp.GEO_ID, 11)
    """)
    scores_count = con.execute("SELECT COUNT(*) FROM tract_outputs_with_preds").fetchone()[0]
    score_range = con.execute("""
        SELECT
            MIN(xgb_heat_score), MAX(xgb_heat_score),
            MIN(xgb_risk_score), MAX(xgb_risk_score)
        FROM tract_outputs_with_preds
    """).fetchone()
    log.info("  tract_outputs_with_preds: %d rows", scores_count)
    log.info(
        "  Score ranges — heat: [%.3f, %.3f], risk: [%.3f, %.3f]",
        score_range[0], score_range[1], score_range[2], score_range[3]
    )

    # ── Step 5: Download TIGER block geometry and create blocks table ──────
    log.info("Downloading Census TIGER block geometry (this may take 1–2 min, ~200MB download)...")
    blocks_gdf = pygris.blocks(
        state=KING_COUNTY_STATE, county=KING_COUNTY_FIPS,
        year=TIGER_YEAR
    )
    blocks_gdf = blocks_gdf.to_crs("EPSG:4326")  # WGS84 required for GeoJSON
    log.info("  Downloaded %d block geometries", len(blocks_gdf))

    # GEOID20 column from pygris is 15-digit string — matches "BLOCK GEO ID" in HeatHealthKC
    block_geom_map: dict[str, str] = {
        row["GEOID20"]: row["geometry"].wkt
        for _, row in blocks_gdf.iterrows()
    }

    # Join block attributes from HeatHealthKC with geometry
    df_blocks_raw = con.execute("""
        SELECT
            CAST(b."BLOCK GEO ID" AS VARCHAR)              AS block_id,
            CAST(b."TRACT GEO ID" AS VARCHAR)              AS tract_id,
            b."Median afternoon temperature"               AS mean_afternoon_temp,
            b."Median morning temperature"                 AS mean_morning_temp,
            b."Median evening temperature"                 AS mean_evening_temp,
            b."Percent tree coverage"                      AS mean_tree_cov,
            b."Percent impervious coverage"                AS mean_imperv,
            b.CITYNAME                                     AS city_name
        FROM blocks_raw b
    """).fetchdf()

    df_blocks_raw["geometry_wkt"] = df_blocks_raw["block_id"].map(block_geom_map)
    block_geom_matched = df_blocks_raw["geometry_wkt"].notna().sum()
    log.info(
        "  Block geometry matched: %d / %d",
        block_geom_matched, len(df_blocks_raw)
    )

    # Write blocks table to DuckDB
    con.register("blocks_with_geom", df_blocks_raw)
    con.execute("""
        CREATE TABLE blocks AS
        SELECT * FROM blocks_with_geom
    """)
    blocks_written = con.execute("SELECT COUNT(*) FROM blocks").fetchone()[0]
    log.info("  blocks table: %d rows", blocks_written)

    # ── Step 6: Verify and close ───────────────────────────────────────────
    log.info("Running verification queries...")

    # Check spatial extension works on real data
    sample = con.execute("""
        SELECT ST_AsGeoJSON(ST_GeomFromText(geometry_wkt))::TEXT AS geom_json
        FROM tract_features
        WHERE geometry_wkt IS NOT NULL
        LIMIT 1
    """).fetchone()
    if sample and sample[0]:
        parsed = json.loads(sample[0])
        assert parsed["type"] in ("Polygon", "MultiPolygon"), \
            f"Unexpected geometry type: {parsed['type']}"
        log.info("  Spatial extension check: OK (type=%s)", parsed["type"])
    else:
        log.warning("  No geometry found for spatial extension check — verify geometry_wkt column")

    # Summarize table counts
    tables = con.execute(
        "SELECT table_name, estimated_size FROM duckdb_tables() ORDER BY table_name"
    ).fetchall()
    log.info("Tables in %s:", DUCKDB_PATH.name)
    for table_name, size in tables:
        count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        log.info("  %-35s %6d rows", table_name, count)

    con.close()
    log.info("Build complete: %s (%.1f MB)", DUCKDB_PATH,
             DUCKDB_PATH.stat().st_size / 1_048_576)


if __name__ == "__main__":
    build()
