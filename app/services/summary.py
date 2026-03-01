# app/services/summary.py
"""
DuckDB aggregation query for county summary endpoint.

SUM-01: Single query computes all 4 aggregate stats in one round trip.
high_risk_tract_count threshold: xgb_heat_score > 0.75 (per project research spec).
"""
import duckdb


def get_city_summaries(db: duckdb.DuckDBPyConnection) -> list[dict]:
    """
    Return per-city aggregate stats for all named cities in King County.
    Used to give the chat model city-level context for comparisons.
    """
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT
            tf.city_name,
            COUNT(*)                    AS tract_count,
            AVG(top.xgb_heat_score)     AS mean_heat,
            AVG(top.xgb_risk_score)     AS mean_risk,
            AVG(tf.mean_tree_cov)       AS mean_tree_cov,
            AVG(tf.mean_imperv)         AS mean_imperv,
            AVG(tf.mean_life_expectancy)AS mean_life_exp,
            AVG(tf.mean_svi_overall)    AS mean_svi,
            AVG(tf.mean_poverty2x)      AS mean_poverty
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.city_name IS NOT NULL
        GROUP BY tf.city_name
        ORDER BY mean_heat DESC
    """).fetchall()

    return [
        {
            "city_name": r[0],
            "tract_count": int(r[1]),
            "mean_heat": float(r[2]),
            "mean_risk": float(r[3]),
            "mean_tree_cov": float(r[4]) if r[4] is not None else None,
            "mean_imperv": float(r[5]) if r[5] is not None else None,
            "mean_life_exp": float(r[6]) if r[6] is not None else None,
            "mean_svi": float(r[7]) if r[7] is not None else None,
            "mean_poverty": float(r[8]) if r[8] is not None else None,
        }
        for r in rows
    ]


def get_county_summary(db: duckdb.DuckDBPyConnection) -> dict:
    """
    SUM-01: Return county-wide aggregate stats from tract_outputs_with_preds.

    High-risk threshold: xgb_heat_score > 0.75 (documented threshold from Phase 2 research).
    PERCENTILE_CONT is DuckDB-native SQL — computes in a single aggregation pass.
    """
    cursor = db.cursor()
    row = cursor.execute("""
        SELECT
            COUNT(*)                                                      AS tract_count,
            AVG(xgb_heat_score)                                           AS mean_heat_score,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY xgb_heat_score)  AS p75_heat_score,
            COUNT(*) FILTER (WHERE xgb_heat_score > 0.75)                 AS high_risk_tract_count
        FROM tract_outputs_with_preds
    """).fetchone()

    return {
        "tract_count": int(row[0]),
        "mean_heat_score": float(row[1]),
        "p75_heat_score": float(row[2]),
        "high_risk_tract_count": int(row[3]),
    }
