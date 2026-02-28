# app/dependencies.py
import duckdb
from anthropic import AsyncAnthropic
from fastapi import Request

from app.models.loader import LoadedModels


def get_db(request: Request) -> duckdb.DuckDBPyConnection:
    """Return the shared read-only DuckDB connection from app.state."""
    return request.app.state.db


def get_models(request: Request) -> LoadedModels:
    """Return the loaded ML models from app.state."""
    return request.app.state.models


def get_anthropic(request: Request) -> AsyncAnthropic:
    """Return the shared AsyncAnthropic client from app.state."""
    return request.app.state.anthropic
