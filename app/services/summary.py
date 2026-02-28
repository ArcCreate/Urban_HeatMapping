# app/services/summary.py
"""
DuckDB aggregation query for county summary endpoint.

SUM-01: Single query computes all 4 aggregate stats in one round trip.
high_risk_tract_count threshold: xgb_heat_score > 0.75 (per project research spec).
"""
import duckdb


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
