# app/services/predictions.py
"""
DuckDB query functions for prediction endpoints.

No geometry involved — queries only tract_outputs_with_preds.
CRITICAL: Always use db.cursor() for thread safety.
CRITICAL: sort_by is interpolated into SQL using the enum .value which is validated
          by FastAPI. This is safe — the value comes from an allowlist Enum, not raw user input.
"""
import duckdb

from app.schemas.predictions import SortColumn, SortOrder


def get_all_predictions(db: duckdb.DuckDBPyConnection) -> list[dict]:
    """
    PRED-01: Return all tract IDs with their 3 pre-scored model values.
    No geometry included — lightweight list for frontend choropleth coloring.
    """
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score
        FROM tract_outputs_with_preds
        ORDER BY tract_id
    """).fetchall()

    return [
        {
            "tract_id": row[0],
            "xgb_heat_score": row[1],
            "xgb_risk_score": row[2],
            "tf_risk_score": row[3],
        }
        for row in rows
    ]


def get_ranked_predictions(
    db: duckdb.DuckDBPyConnection,
    sort_by: SortColumn,
    order: SortOrder,
    limit: int,
) -> list[dict]:
    """
    PRED-02: Return tracts sorted by the chosen score column, with limit.
    sort_by.value is safe to interpolate — it comes from a validated Enum allowlist.
    """
    cursor = db.cursor()
    # Both sort_by.value and order.value are validated Enum values — safe to interpolate
    rows = cursor.execute(f"""
        SELECT p.tract_id, p.xgb_heat_score, p.xgb_risk_score, p.tf_risk_score,
               f.city_name, f.mean_tree_cov, f.mean_imperv, f.mean_afternoon_temp
        FROM tract_outputs_with_preds p
        LEFT JOIN tract_features f ON p.tract_id = f.tract_id
        ORDER BY p.{sort_by.value} {order.value}
        LIMIT ?
    """, [limit]).fetchall()

    return [
        {
            "tract_id": row[0],
            "xgb_heat_score": row[1],
            "xgb_risk_score": row[2],
            "tf_risk_score": row[3],
            "city_name": row[4],
            "mean_tree_cov": row[5],
            "mean_imperv": row[6],
            "mean_afternoon_temp": row[7],
        }
        for row in rows
    ]
