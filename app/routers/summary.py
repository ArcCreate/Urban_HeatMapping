# app/routers/summary.py
"""
County summary endpoint.

SUM-01: GET /summary/county — county-wide aggregate statistics.
All route handlers are def (not async def).
"""
from fastapi import APIRouter, Depends

from app.dependencies import get_db
from app.schemas.summary import CountySummary
from app.services import summary as summary_service

router = APIRouter(prefix="/summary", tags=["Summary"])


@router.get("/county", response_model=CountySummary)
def get_county_summary(db=Depends(get_db)) -> dict:
    """
    SUM-01: Return county-wide aggregate statistics.
    high_risk_tract_count counts tracts where xgb_heat_score > 0.75.
    GET /api/v1/summary/county
    """
    return summary_service.get_county_summary(db)
