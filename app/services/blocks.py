# app/services/blocks.py
"""
DuckDB query functions for block data endpoints.

CRITICAL: Always use db.cursor() for thread safety under FastAPI's thread pool.
CRITICAL: ST_AsGeoJSON returns VARCHAR — call json.loads() on geometry before
including in response. Returning a raw VARCHAR string breaks all map libraries.
CRITICAL: Never query blocks without a tract_id filter — 25,552 rows = 50MB+ response.
"""
import json

import duckdb


def get_blocks_by_tract(db: duckdb.DuckDBPyConnection, tract_id: str) -> list[dict]:
    """
    BLOCK-01: Return all blocks in a given tract as GeoJSON Feature dicts.
    Result is wrapped in a FeatureCollection by the router.
    Average ~52 blocks per tract — this is a safe response size.
    """
    cursor = db.cursor()
    cursor.execute("LOAD spatial;")
    rows = cursor.execute("""
        SELECT
            block_id,
            tract_id,
            city_name,
            ST_AsGeoJSON(ST_GeomFromText(geometry_wkt))::TEXT AS geom_json
        FROM blocks
        WHERE tract_id = ?
          AND geometry_wkt IS NOT NULL
        ORDER BY block_id
    """, [tract_id]).fetchall()

    features = []
    for block_id, t_id, city, geom_json_str in rows:
        features.append({
            "type": "Feature",
            "geometry": json.loads(geom_json_str),  # VARCHAR → dict
            "properties": {
                "block_id": block_id,
                "tract_id": t_id,
                "city_name": city,
            },
        })
    return features


def get_block_detail(db: duckdb.DuckDBPyConnection, block_id: str) -> dict | None:
    """
    BLOCK-02: Return full detail for a single block.
    Returns None if block_id is not found (router raises 404).
    Note: does NOT include geometry — detail endpoint returns typed JSON only.
    """
    cursor = db.cursor()
    row = cursor.execute("""
        SELECT
            block_id,
            tract_id,
            mean_afternoon_temp,
            mean_morning_temp,
            mean_evening_temp,
            mean_tree_cov,
            mean_imperv,
            city_name
        FROM blocks
        WHERE block_id = ?
    """, [block_id]).fetchone()

    if row is None:
        return None

    return {
        "block_id": row[0],
        "tract_id": row[1],
        "mean_afternoon_temp": row[2],
        "mean_morning_temp": row[3],
        "mean_evening_temp": row[4],
        "mean_tree_cov": row[5],
        "mean_imperv": row[6],
        "city_name": row[7],
    }
