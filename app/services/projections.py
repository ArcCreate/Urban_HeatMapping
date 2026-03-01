# app/services/projections.py
"""
DuckDB query functions for projection endpoints.

Queries the precomputed tract_projections table (created by scripts/build_projections.py).
CRITICAL: Always use db.cursor() for thread safety.
No geometry involved — pure numeric lookups.
"""
import duckdb


def get_year_projections(db: duckdb.DuckDBPyConnection, year: int) -> list[dict]:
    """
    Return projected_risk for all 492 tracts for the specified year.
    Caller is responsible for year bounds validation (2025-2050).
    """
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT tract_id, year, projected_risk
        FROM tract_projections
        WHERE year = ?
        ORDER BY tract_id
    """, [year]).fetchall()
    return [{"tract_id": r[0], "year": r[1], "projected_risk": r[2]} for r in rows]


def get_series(db: duckdb.DuckDBPyConnection, tract_id: str) -> dict:
    """
    Return full 2025-2050 projection series for one tract.
    Returns empty projections list if tract_id not found (not a 404 — let caller decide).
    """
    cursor = db.cursor()
    rows = cursor.execute("""
        SELECT tract_id, year, projected_risk
        FROM tract_projections
        WHERE tract_id = ?
        ORDER BY year
    """, [tract_id]).fetchall()
    return {
        "tract_id": tract_id,
        "projections": [{"tract_id": r[0], "year": r[1], "projected_risk": r[2]} for r in rows],
    }
