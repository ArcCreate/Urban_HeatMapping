# app/routers/simulations.py
from fastapi import APIRouter, Depends

from app.dependencies import get_db
from app.schemas.simulations import WhatIfRequest, WhatIfResult, CompareRequest, CompareResult
from app.services import simulations as sim_service

router = APIRouter(prefix="/simulations", tags=["Simulations"])


@router.post("/what-if", response_model=list[WhatIfResult])
def what_if(body: WhatIfRequest, db=Depends(get_db)) -> list[dict]:
    """
    SIM-01: Apply parametric cooling intervention formula per requested tract.
    Returns per-tract delta_temp (°F, negative = cooling) and delta_risk (unitless, negative = reduced risk).
    Empty tract_ids → 422 (validated at schema layer).
    Unknown tract_id → 404 (raised in service layer).
    """
    return sim_service.simulate_what_if(db, body.tract_ids, body.interventions)


@router.post("/compare", response_model=list[CompareResult])
def compare(body: CompareRequest, db=Depends(get_db)) -> list[dict]:
    """
    SIM-02: Apply parametric formula for two intervention scenarios, return side-by-side per-tract deltas.
    Both scenarios use the same tract_ids. Unknown tract_id → 404. Empty tract_ids → 422.
    """
    return sim_service.simulate_compare(db, body.tract_ids, body.scenario_a, body.scenario_b)
