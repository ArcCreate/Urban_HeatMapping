# app/schemas/simulations.py
"""
Pydantic schemas for simulation endpoints.

SIM-01: WhatIfRequest / WhatIfResult — POST /what-if request and per-tract response
SIM-02: CompareRequest / CompareResult — POST /compare request and per-tract response
Shared: Interventions (input sub-object), ScenarioDelta (response sub-object)
"""
from pydantic import BaseModel, Field, field_validator


class Interventions(BaseModel):
    """Urban intervention parameters — all fields optional, defaults to no-op (no change)."""
    tree_canopy_pct: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Percentage increase in tree canopy (0-100)",
    )
    albedo_delta: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Surface albedo change (0.0-1.0 scale)",
    )
    green_space_sqft: float | None = Field(
        default=None,
        ge=0,
        description="Additional green space in square feet",
    )


class ScenarioDelta(BaseModel):
    """Simulation outcome for one scenario — temperature and risk deltas."""
    delta_temp: float
    delta_risk: float


class WhatIfResult(BaseModel):
    """Per-tract response for POST /what-if."""
    tract_id: str
    delta_temp: float
    delta_risk: float


class CompareResult(BaseModel):
    """Per-tract response for POST /compare — side-by-side scenario deltas."""
    tract_id: str
    scenario_a: ScenarioDelta
    scenario_b: ScenarioDelta


class WhatIfRequest(BaseModel):
    """Request body for POST /what-if."""
    tract_ids: list[str]
    interventions: Interventions

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per simulation request")
        return v


class CompareRequest(BaseModel):
    """Request body for POST /compare."""
    tract_ids: list[str]
    scenario_a: Interventions
    scenario_b: Interventions

    @field_validator("tract_ids")
    @classmethod
    def validate_non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("tract_ids must not be empty")
        if len(v) > 200:
            raise ValueError("Maximum 200 tract IDs per simulation request")
        return v
