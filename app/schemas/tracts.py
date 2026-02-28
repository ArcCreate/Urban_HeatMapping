# app/schemas/tracts.py
"""
Pydantic schemas for tract endpoints.

TRACT-01: TractFeature (used in GeoJSON FeatureCollection — properties only)
TRACT-02: TractDetail (full detail with all feature columns + model scores)
TRACT-03: TractGeometry (lightweight Feature — geometry only, no feature vector)
BATCH-01: BatchRequest (list of tract_ids for POST /tracts/batch)
"""
from pydantic import BaseModel, field_validator


class TractProperties(BaseModel):
    """Properties included in the GeoJSON FeatureCollection (TRACT-01)."""
    tract_id: str
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float


class TractDetail(BaseModel):
    """Full tract detail: all feature columns + 3 model scores (TRACT-02, BATCH-01)."""
    tract_id: str
    # Heat features
    mean_afternoon_temp: float | None = None
    mean_morning_temp: float | None = None
    mean_evening_temp: float | None = None
    # Land cover
    mean_tree_cov: float | None = None
    mean_imperv: float | None = None
    mean_dist_water: float | None = None
    # Health
    mean_cvd_rate: float | None = None
    mean_diabetes: float | None = None
    mean_life_expectancy: float | None = None
    # Social vulnerability
    mean_svi_overall: float | None = None
    mean_poverty2x: float | None = None
    mean_disability: float | None = None
    mean_limited_english: float | None = None
    mean_under18: float | None = None
    mean_severe_cost: float | None = None
    # Geography
    city_name: str | None = None
    # Model scores
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float


class BatchRequest(BaseModel):
    """Request body for POST /tracts/batch (BATCH-01)."""
    tract_ids: list[str]

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per batch request")
        return v
