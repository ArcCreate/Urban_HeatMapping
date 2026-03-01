# app/schemas/predictions.py
"""
Pydantic schemas and enums for prediction endpoints.

PRED-01: TractPrediction (tract_id + 3 scores, no geometry)
PRED-02: RankedTract, SortColumn, SortOrder (ranked list with validated sort params)
"""
from enum import Enum

from pydantic import BaseModel


class SortColumn(str, Enum):
    """Valid columns for PRED-02 sort_by parameter. Enum prevents SQL injection."""
    xgb_heat_score = "xgb_heat_score"
    xgb_risk_score = "xgb_risk_score"
    tf_risk_score = "tf_risk_score"


class SortOrder(str, Enum):
    """Valid sort order for PRED-02 order parameter."""
    asc = "asc"
    desc = "desc"


class TractPrediction(BaseModel):
    """Tract ID + 3 pre-scored model values, no geometry (PRED-01)."""
    tract_id: str
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float


class RankedTract(BaseModel):
    """Single row in PRED-02 ranked response — includes city_name and tree coverage for sidebar."""
    tract_id: str
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float
    city_name: str | None = None
    mean_tree_cov: float | None = None
    mean_imperv: float | None = None
    mean_afternoon_temp: float | None = None
