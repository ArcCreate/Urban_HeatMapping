# app/schemas/chat.py
from pydantic import BaseModel, Field


class TractScore(BaseModel):
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float


class TractFullData(BaseModel):
    """Full environmental + population data for a selected tract, sent from the frontend."""
    tract_id: str
    city_name: str | None = None
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float
    mean_afternoon_temp: float | None = None
    mean_tree_cov: float | None = None
    mean_imperv: float | None = None
    mean_dist_water: float | None = None
    mean_life_expectancy: float | None = None
    mean_svi_overall: float | None = None
    mean_poverty2x: float | None = None
    mean_disability: float | None = None
    mean_cvd_rate: float | None = None
    mean_diabetes: float | None = None


class ActiveScenario(BaseModel):
    tree_canopy_pct: float | None = None
    albedo_delta: float | None = None
    green_space_sqft: float | None = None


class MapContext(BaseModel):
    selected_tract_ids: list[str] = Field(default_factory=list)
    current_scores: dict[str, TractScore] = Field(default_factory=dict)
    tract_data: list[TractFullData] = Field(default_factory=list)
    active_scenario: ActiveScenario | None = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    map_context: MapContext


class UsageSummary(BaseModel):
    input_tokens: int
    output_tokens: int


class ChatResponse(BaseModel):
    reply: str
    usage: UsageSummary
