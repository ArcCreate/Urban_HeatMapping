# app/schemas/projections.py
"""
Pydantic schemas for projection endpoints.

ProjectedTractScore: single (tract_id, year, projected_risk) row
ProjectionSeries: full 2025-2050 series for one tract
"""
from pydantic import BaseModel


class ProjectedTractScore(BaseModel):
    """One tract's projected risk score for a specific year."""
    tract_id: str
    year: int
    projected_risk: float


class ProjectionSeries(BaseModel):
    """Full 2025-2050 projection series for one tract."""
    tract_id: str
    projections: list[ProjectedTractScore]
