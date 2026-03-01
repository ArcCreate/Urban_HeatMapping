# app/routers/projections.py
"""
Projection endpoints: projected heat risk scores from precomputed tract_projections table.

ROUTE ORDERING IS CRITICAL:
    /range must be registered BEFORE /{year}.
    FastAPI matches routes in registration order. If /{year} were first, the string
    "range" would match as the year path parameter, causing a 422 validation error.

Handler pattern: def (not async def) — DuckDB is synchronous; FastAPI dispatches to threadpool.
This matches all other routers in this project (predictions, tracts, blocks, simulations, summary).
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_db
from app.schemas.projections import ProjectedTractScore, ProjectionSeries
import app.services.projections as projection_service

router = APIRouter(prefix="/projections", tags=["Projections"])


@router.get(
    "/range",
    response_model=ProjectionSeries,
    summary="Get full 2025-2050 projection series for one tract",
)
def get_projection_series(
    tract_id: str = Query(..., description="11-digit census tract GEOID (e.g. 53033000100)"),
    db=Depends(get_db),
) -> dict:
    # IMPORTANT: /range MUST be registered before /{year} — see module docstring
    result = projection_service.get_series(db, tract_id)
    if not result["projections"]:
        raise HTTPException(
            status_code=404,
            detail=f"No projection data found for tract_id '{tract_id}'. "
                   "Ensure scripts/build_projections.py has been run.",
        )
    return result


@router.get(
    "/{year}",
    response_model=list[ProjectedTractScore],
    summary="Get projected risk scores for all tracts in a given year",
)
def get_projections_for_year(
    year: int,
    db=Depends(get_db),
) -> list[dict]:
    if not (2025 <= year <= 2050):
        raise HTTPException(
            status_code=400,
            detail=f"Year must be between 2025 and 2050 (got {year}).",
        )
    return projection_service.get_year_projections(db, year)
