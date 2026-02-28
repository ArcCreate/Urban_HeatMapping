# app/main.py
import asyncio
import logging
from contextlib import asynccontextmanager

import duckdb
from anthropic import AsyncAnthropic
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.models.loader import load_models
from app.routers import health, tracts, predictions, summary

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    logger.info("Startup: connecting to DuckDB at %s...", settings.duckdb_path)
    app.state.db = duckdb.connect(str(settings.duckdb_path), read_only=True)

    logger.info("Startup: loading ML models (this may take several seconds)...")
    app.state.models = await asyncio.to_thread(load_models, settings)

    logger.info("Startup: initializing Anthropic client...")
    app.state.anthropic = AsyncAnthropic()

    logger.info("Startup complete. API is ready.")
    yield

    # --- SHUTDOWN ---
    logger.info("Shutdown: closing DuckDB connection.")
    app.state.db.close()


app = FastAPI(
    lifespan=lifespan,
    title="Urban Heat Mapping API",
    version="1.0.0",
    description="FastAPI backend for King County urban heat risk data, model predictions, and what-if simulations.",
)

# CORS — allow all origins for internal v1 use (INFRA-02)
# CRITICAL: allow_credentials MUST be False when allow_origins=["*"]
# Setting allow_credentials=True with ["*"] raises a ValueError at startup.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # ["*"] from config
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)


# --- Global exception handlers (INFRA-08) ---
# All three handlers return {error, detail, status_code} JSON shape.
# Register BEFORE routers so they intercept validation errors from route params too.

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "detail": exc.detail,
            "status_code": exc.status_code,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Pydantic v2 error dicts may contain non-JSON-serializable ctx values (e.g. ValueError).
    # Stringify ctx values to ensure JSON serializability (Rule 1 fix: TypeError on empty batch).
    def _safe_errors(errors: list) -> list:
        safe = []
        for err in errors:
            e = dict(err)
            if "ctx" in e:
                e["ctx"] = {k: str(v) for k, v in e["ctx"].items()}
            if "url" in e:
                del e["url"]
            safe.append(e)
        return safe

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "RequestValidationError",
            "detail": _safe_errors(exc.errors()),
            "status_code": 422,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "detail": "An unexpected error occurred.",
            "status_code": 500,
        },
    )


# --- Routers (INFRA-01: all under /api/v1/ prefix) ---
app.include_router(health.router, prefix="/api/v1")
app.include_router(tracts.router, prefix="/api/v1")
app.include_router(predictions.router, prefix="/api/v1")
app.include_router(summary.router, prefix="/api/v1")
# Plan 02-04 (blocks) wired here when blocks.py is available:
# app.include_router(blocks.router, prefix="/api/v1")
# Future phases add:
# app.include_router(simulate.router, prefix="/api/v1")
# app.include_router(chat.router, prefix="/api/v1")
