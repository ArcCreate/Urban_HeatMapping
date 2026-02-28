# app/schemas/summary.py
"""
Pydantic schema for county summary endpoint.

SUM-01: CountySummary — county-wide aggregate statistics.
High-risk threshold: xgb_heat_score > 0.75 (per project research).
"""
from pydantic import BaseModel


class CountySummary(BaseModel):
    """County-wide aggregate stats returned by GET /summary/county (SUM-01)."""
    tract_count: int
    mean_heat_score: float
    p75_heat_score: float
    high_risk_tract_count: int
