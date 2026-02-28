# app/schemas/blocks.py
"""
Pydantic schemas for block endpoints.

BLOCK-01: BlockProperties (used in GeoJSON FeatureCollection)
BLOCK-02: BlockDetail (full block detail as typed JSON)
"""
from pydantic import BaseModel


class BlockProperties(BaseModel):
    """Properties included in the GeoJSON FeatureCollection (BLOCK-01)."""
    block_id: str
    tract_id: str
    city_name: str | None = None


class BlockDetail(BaseModel):
    """Full block detail (BLOCK-02)."""
    block_id: str
    tract_id: str
    mean_afternoon_temp: float | None = None
    mean_morning_temp: float | None = None
    mean_evening_temp: float | None = None
    mean_tree_cov: float | None = None
    mean_imperv: float | None = None
    city_name: str | None = None
