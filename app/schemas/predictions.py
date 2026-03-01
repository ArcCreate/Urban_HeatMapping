# app/schemas/predictions.py
"""
Pydantic schemas and enums for prediction endpoints.

PRED-01: TractPrediction (tract_id + 3 scores + composite_risk, no geometry)
PRED-02: RankedTract, SortColumn, SortOrder (ranked list with validated sort params)
"""
from enum import Enum

from pydantic import BaseModel


class SortColumn(str, Enum):
    """Valid columns for PRED-02 sort_by parameter. Enum prevents SQL injection."""
    xgb_heat_score = "xgb_heat_score"
    xgb_risk_score = "xgb_risk_score"
    tf_risk_score = "tf_risk_score"
    composite_risk = "composite_risk"


class SortOrder(str, Enum):
    """Valid sort order for PRED-02 order parameter."""
    asc = "asc"
    desc = "desc"


class TractPrediction(BaseModel):
    """Tract ID + model scores including composite_risk (PRED-01)."""
    tract_id: str
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float
    composite_risk: float


class RankedTract(BaseModel):
    """Single row in PRED-02 ranked response."""
    tract_id: str
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float
    composite_risk: float | None = None
    city_name: str | None = None
    mean_tree_cov: float | None = None
    mean_imperv: float | None = None
    mean_afternoon_temp: float | None = None
