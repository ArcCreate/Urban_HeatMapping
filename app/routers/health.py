# app/routers/health.py
from fastapi import APIRouter, Request

from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health(request: Request) -> HealthResponse:
    db_connected = False
    models_loaded = False

    try:
        request.app.state.db.execute("SELECT 1").fetchone()
        db_connected = True
    except Exception:
        db_connected = False

    try:
        models = request.app.state.models
        models_loaded = (
            models is not None
            and models.xgb_heat is not None
            and models.xgb_risk is not None
            and models.tf_risk is not None
        )
    except AttributeError:
        models_loaded = False

    return HealthResponse(
        status="ok",
        models_loaded=models_loaded,
        db_connected=db_connected,
    )
