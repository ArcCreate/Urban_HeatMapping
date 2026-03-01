# app/routers/chat.py
import duckdb
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends

from app.dependencies import get_anthropic, get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat import build_system_prompt
from app.services.summary import get_county_summary, get_city_summaries
from app.services.projections import get_series
from app.services.tracts import get_tracts_by_city

router = APIRouter(prefix="/chat", tags=["Chat"])


def _fetch_context(db: duckdb.DuckDBPyConnection, tract_data: list, tract_ids: list[str]) -> dict:
    """
    Fetch all DB context needed to ground Claude's answers:
      - county-wide aggregate stats
      - per-city aggregate stats for all King County cities
      - all tracts in the same city as the selected tract(s)
      - 2025-2050 projections for selected tract(s)
    """
    county_stats = get_county_summary(db)
    city_summaries = get_city_summaries(db)

    # Collect unique city names from selected tract data
    city_names: set[str] = set()
    for td in tract_data:
        if td.city_name:
            city_names.add(td.city_name)

    # All tracts in each relevant city — lets Claude reference any peer tract
    city_tracts: dict[str, list] = {}
    for city in city_names:
        city_tracts[city] = get_tracts_by_city(db, city)

    # Future projections for selected tracts
    tract_projections: dict[str, list] = {}
    for tid in tract_ids:
        result = get_series(db, tid)
        if result["projections"]:
            tract_projections[tid] = result["projections"]

    return {
        "county_stats": county_stats,
        "city_summaries": city_summaries,
        "city_tracts": city_tracts,
        "tract_projections": tract_projections,
    }


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    anthropic: AsyncAnthropic = Depends(get_anthropic),
    db: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    """
    CHAT-01: Accept user question + map context, return Claude reply + token usage.
    Fetches county stats, city-level aggregates, all tracts in the selected city,
    and future projections from DuckDB so Claude can answer about any relevant tract.
    """
    tract_ids = (
        [td.tract_id for td in body.map_context.tract_data]
        or body.map_context.selected_tract_ids
    )
    ctx = _fetch_context(db, body.map_context.tract_data, tract_ids)

    system_prompt = build_system_prompt(
        body.map_context,
        county_stats=ctx["county_stats"],
        city_summaries=ctx["city_summaries"],
        city_tracts=ctx["city_tracts"],
        tract_projections=ctx["tract_projections"],
    )
    message = await anthropic.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=system_prompt,
        messages=[{"role": "user", "content": body.message}],
    )
    return {
        "reply": message.content[0].text,
        "usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
    }
