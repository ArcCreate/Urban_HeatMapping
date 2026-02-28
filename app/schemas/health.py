# app/schemas/health.py
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    db_connected: bool
