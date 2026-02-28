# app/routers/blocks.py
"""
Block data endpoints.

BLOCK-01: GET /blocks?tract_id={id}  — GeoJSON FeatureCollection of blocks in a tract
BLOCK-02: GET /blocks/{block_id}     — single block detail as typed JSON

SAFETY: tract_id is a REQUIRED query parameter on the list endpoint.
FastAPI returns 422 automatically if it is missing.
This prevents an accidental unfiltered query returning 25,552 blocks (~50MB+).

All route handlers are def (not async def).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from geojson_pydantic import FeatureCollection

from app.dependencies import get_db
from app.schemas.blocks import BlockDetail
from app.services import blocks as block_service

router = APIRouter(prefix="/blocks", tags=["Blocks"])


@router.get("", response_model=FeatureCollection)
def list_blocks_by_tract(
    tract_id: str = Query(..., description="11-digit Census tract FIPS (required)"),
    db=Depends(get_db),
) -> dict:
    """
    BLOCK-01: Return all blocks within the specified tract as a GeoJSON FeatureCollection.
    The tract_id query parameter is required — omitting it returns 422.
    GET /api/v1/blocks?tract_id={tract_id}
    """
    features = block_service.get_blocks_by_tract(db, tract_id)
    return {"type": "FeatureCollection", "features": features}


@router.get("/{block_id}", response_model=BlockDetail)
def get_block(block_id: str, db=Depends(get_db)) -> dict:
    """
    BLOCK-02: Return full detail for a single block.
    Returns 404 if the block_id is not in the database.
    GET /api/v1/blocks/{block_id}
    """
    result = block_service.get_block_detail(db, block_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Block '{block_id}' not found")
    return result
