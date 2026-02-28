# app/routers/predictions.py
"""
Prediction endpoints — no geometry, no GeoJSON.

PRED-01: GET /predictions/tracts           — all tract scores (no geometry)
PRED-02: GET /predictions/tracts/ranked    — sorted, limited list

Route order: /tracts/ranked (static) registered FIRST in router to avoid
any future dynamic path conflicts.

All route handlers are def (not async def).
"""
from fastapi import APIRouter, Depends, Query

from app.dependencies import get_db
from app.schemas.predictions import RankedTract, SortColumn, SortOrder, TractPrediction
from app.services import predictions as prediction_service

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.get("/tracts/ranked", response_model=list[RankedTract])
def get_ranked_tracts(
    sort_by: SortColumn = Query(
        SortColumn.xgb_heat_score,
        description="Column to sort by. Must be one of: xgb_heat_score, xgb_risk_score, tf_risk_score"
    ),
    order: SortOrder = Query(
        SortOrder.desc,
        description="Sort direction: asc or desc"
    ),
    limit: int = Query(
        10,
        ge=1,
        le=500,
        description="Maximum number of tracts to return (1–500)"
    ),
    db=Depends(get_db),
) -> list[dict]:
    """
    PRED-02: Return tracts ranked by a chosen score column.
    sort_by is validated against the SortColumn enum — invalid values return 422 automatically.
    GET /api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=10
    """
    return prediction_service.get_ranked_predictions(db, sort_by, order, limit)


@router.get("/tracts", response_model=list[TractPrediction])
def list_tract_predictions(db=Depends(get_db)) -> list[dict]:
    """
    PRED-01: Return all tract IDs with their 3 pre-scored model values.
    No geometry included — used by the frontend for choropleth coloring.
    GET /api/v1/predictions/tracts
    """
    return prediction_service.get_all_predictions(db)
