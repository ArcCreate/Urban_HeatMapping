# app/routers/tracts.py
"""
Tract data endpoints.

Route registration order matters:
  POST /tracts/batch    — static path — MUST be before /{tract_id}
  GET  /tracts          — list all tracts
  GET  /tracts/{tract_id}           — single tract detail
  GET  /tracts/{tract_id}/geometry  — geometry only

All route handlers are def (not async def) — FastAPI dispatches to thread pool automatically.
"""
from fastapi import APIRouter, Depends, HTTPException
from geojson_pydantic import FeatureCollection, Feature

from app.dependencies import get_db
from app.schemas.tracts import TractDetail, BatchRequest
from app.services import tracts as tract_service

router = APIRouter(prefix="/tracts", tags=["Tracts"])


@router.post("/batch", response_model=list[TractDetail])
def get_tract_batch(body: BatchRequest, db=Depends(get_db)) -> list[dict]:
    """
    BATCH-01: Return full TractDetail for each tract_id in the request body.
    Unrecognized IDs are omitted from the response (not a 404).
    POST /api/v1/tracts/batch
    """
    return tract_service.get_batch_tracts(db, body.tract_ids)


@router.get("", response_model=FeatureCollection)
def list_tracts(db=Depends(get_db)) -> dict:
    """
    TRACT-01: All tracts as GeoJSON FeatureCollection.
    Each Feature has geometry (dict) and properties (tract_id, model scores).
    GET /api/v1/tracts
    """
    features = tract_service.get_all_tracts(db)
    return {"type": "FeatureCollection", "features": features}


@router.get("/{tract_id}", response_model=TractDetail)
def get_tract(tract_id: str, db=Depends(get_db)) -> dict:
    """
    TRACT-02: Full tract detail for a single tract_id.
    Returns 404 if the tract_id is not in the database.
    GET /api/v1/tracts/{tract_id}
    """
    result = tract_service.get_tract_detail(db, tract_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Tract '{tract_id}' not found")
    return result


@router.get("/{tract_id}/geometry", response_model=Feature)
def get_tract_geometry(tract_id: str, db=Depends(get_db)) -> dict:
    """
    TRACT-03: Lightweight GeoJSON Feature with geometry only (no feature vector).
    Returns 404 if the tract_id is not found or has no geometry.
    GET /api/v1/tracts/{tract_id}/geometry
    """
    result = tract_service.get_tract_geometry(db, tract_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Tract '{tract_id}' not found or has no geometry"
        )
    return result
