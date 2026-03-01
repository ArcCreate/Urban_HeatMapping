# app/schemas/chat.py
from pydantic import BaseModel, Field


class TractScore(BaseModel):
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float


class ActiveScenario(BaseModel):
    tree_canopy_pct: float | None = None
    albedo_delta: float | None = None
    green_space_sqft: float | None = None


class MapContext(BaseModel):
    selected_tract_ids: list[str] = Field(default_factory=list)
    current_scores: dict[str, TractScore] = Field(default_factory=dict)
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
