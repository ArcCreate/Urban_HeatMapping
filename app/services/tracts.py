# app/services/tracts.py
"""
DuckDB query functions for tract data endpoints.

CRITICAL: All functions use db.cursor() for thread safety under FastAPI's thread pool.
Never call db.execute() directly — it is not thread-safe when shared across concurrent def routes.

CRITICAL: ST_AsGeoJSON() returns VARCHAR. Always call json.loads() on the result
before including geometry in a response dict. Failing to do so returns geometry
as an escaped JSON string, which map libraries silently reject.
"""
import json
from typing import Any

import duckdb


def get_all_tracts(db: duckdb.DuckDBPyConnection) -> list[dict]:
    """
    TRACT-01: Return all tracts as GeoJSON Feature dicts (to be wrapped in FeatureCollection).

    Each dict has shape:
        {"type": "Feature", "geometry": <dict>, "properties": {tract_id, xgb_heat_score, ...}}
    """
    cursor = db.cursor()
    cursor.execute("LOAD spatial;")
    rows = cursor.execute("""
        SELECT
            tf.tract_id,
            ST_AsGeoJSON(ST_GeomFromText(tf.geometry_wkt))::TEXT AS geom_json,
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.geometry_wkt IS NOT NULL
        ORDER BY tf.tract_id
    """).fetchall()

    features = []
    for tract_id, geom_json_str, xgb_heat, xgb_risk, tf_risk in rows:
        features.append({
            "type": "Feature",
            "geometry": json.loads(geom_json_str),  # MUST json.loads — returns VARCHAR not dict
            "properties": {
                "tract_id": tract_id,
                "xgb_heat_score": xgb_heat,
                "xgb_risk_score": xgb_risk,
                "tf_risk_score": tf_risk,
            },
        })
    return features


def get_tract_detail(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict | None:
    """
    TRACT-02: Return full tract detail (all feature columns + model scores) for one tract.
    Returns None if tract_id is not found (router raises 404).
    """
    cursor = db.cursor()
    row = cursor.execute("""
        SELECT
            tf.tract_id,
            tf.mean_afternoon_temp,
            tf.mean_morning_temp,
            tf.mean_evening_temp,
            tf.mean_tree_cov,
            tf.mean_imperv,
            tf.mean_dist_water,
            tf.mean_cvd_rate,
            tf.mean_diabetes,
            tf.mean_life_expectancy,
            tf.mean_svi_overall,
            tf.mean_poverty2x,
            tf.mean_disability,
            tf.mean_limited_english,
            tf.mean_under18,
            tf.mean_severe_cost,
            tf.city_name,
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id = ?
    """, [tract_id]).fetchone()

    if row is None:
        return None

    return {
        "tract_id": row[0],
        "mean_afternoon_temp": row[1],
        "mean_morning_temp": row[2],
        "mean_evening_temp": row[3],
        "mean_tree_cov": row[4],
        "mean_imperv": row[5],
        "mean_dist_water": row[6],
        "mean_cvd_rate": row[7],
        "mean_diabetes": row[8],
        "mean_life_expectancy": row[9],
        "mean_svi_overall": row[10],
        "mean_poverty2x": row[11],
        "mean_disability": row[12],
        "mean_limited_english": row[13],
        "mean_under18": row[14],
        "mean_severe_cost": row[15],
        "city_name": row[16],
        "xgb_heat_score": row[17],
        "xgb_risk_score": row[18],
        "tf_risk_score": row[19],
    }


def get_tract_geometry(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict | None:
    """
    TRACT-03: Return lightweight GeoJSON Feature for one tract (geometry only).
    No feature vector columns. Returns None if tract_id not found.
    """
    cursor = db.cursor()
    cursor.execute("LOAD spatial;")
    row = cursor.execute("""
        SELECT
            tract_id,
            ST_AsGeoJSON(ST_GeomFromText(geometry_wkt))::TEXT AS geom_json
        FROM tract_features
        WHERE tract_id = ? AND geometry_wkt IS NOT NULL
    """, [tract_id]).fetchone()

    if row is None:
        return None

    return {
        "type": "Feature",
        "geometry": json.loads(row[1]),  # json.loads required — ST_AsGeoJSON returns VARCHAR
        "properties": {"tract_id": row[0]},
    }


def get_batch_tracts(db: duckdb.DuckDBPyConnection, tract_ids: list[str]) -> list[dict]:
    """
    BATCH-01: Return full TractDetail for each ID in tract_ids.
    Unrecognized IDs are silently omitted (not a 404 — batch partial match is acceptable).
    Uses parameterized IN clause — safe against SQL injection.
    """
    cursor = db.cursor()
    placeholders = ", ".join(["?" for _ in tract_ids])
    rows = cursor.execute(f"""
        SELECT
            tf.tract_id,
            tf.mean_afternoon_temp,
            tf.mean_morning_temp,
            tf.mean_evening_temp,
            tf.mean_tree_cov,
            tf.mean_imperv,
            tf.mean_dist_water,
            tf.mean_cvd_rate,
            tf.mean_diabetes,
            tf.mean_life_expectancy,
            tf.mean_svi_overall,
            tf.mean_poverty2x,
            tf.mean_disability,
            tf.mean_limited_english,
            tf.mean_under18,
            tf.mean_severe_cost,
            tf.city_name,
            top.xgb_heat_score,
            top.xgb_risk_score,
            top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id IN ({placeholders})
    """, tract_ids).fetchall()

    return [
        {
            "tract_id": r[0], "mean_afternoon_temp": r[1], "mean_morning_temp": r[2],
            "mean_evening_temp": r[3], "mean_tree_cov": r[4], "mean_imperv": r[5],
            "mean_dist_water": r[6], "mean_cvd_rate": r[7], "mean_diabetes": r[8],
            "mean_life_expectancy": r[9], "mean_svi_overall": r[10], "mean_poverty2x": r[11],
            "mean_disability": r[12], "mean_limited_english": r[13], "mean_under18": r[14],
            "mean_severe_cost": r[15], "city_name": r[16],
            "xgb_heat_score": r[17], "xgb_risk_score": r[18], "tf_risk_score": r[19],
        }
        for r in rows
    ]
