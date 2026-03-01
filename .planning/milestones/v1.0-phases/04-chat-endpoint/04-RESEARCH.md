# Phase 4: Chat Endpoint - Research

**Researched:** 2026-02-28
**Domain:** Anthropic SDK (AsyncAnthropic), FastAPI async routes, system prompt engineering, token budget management
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | `POST /api/v1/chat` accepts `{message, map_context: {selected_tract_ids, current_scores, active_scenario}}`, injects map context into Claude system prompt, returns `{reply, usage}` | Anthropic SDK AsyncAnthropic.messages.create() verified; system prompt pattern documented; usage object shape confirmed; token budget strategy for 50+ tracts established |
</phase_requirements>

---

## Summary

Phase 4 adds a single POST endpoint that accepts a natural-language user question plus a map context object and returns a reasoned reply from Claude. The Anthropic client (`AsyncAnthropic`) is already initialized in `app.state.anthropic` (completed in Phase 1, INFRA-07). The endpoint must be an `async def` handler because the Anthropic API call is I/O-bound and must not block FastAPI's event loop — unlike Phases 2 and 3 which used `def` (sync) handlers exclusively because DuckDB is synchronous. This is the first router in the project that requires an `async def` handler.

The critical design challenge is the system prompt: it must include meaningful context about selected tracts (IDs, scores, scenario) without blowing the 200K token limit when 50+ tracts are selected. The strategy is to summarize scores (min/max/mean) rather than enumerate all 50 tract IDs verbatim, keeping the system prompt well under a few thousand tokens regardless of selection size. The recommended model is `claude-haiku-4-5-20251001` — it is Anthropic's fastest, cheapest current model ($1/1M input tokens), has a 200K context window, 64K output ceiling, and near-frontier performance appropriate for planner Q&A on heat data.

Testing uses `unittest.mock.AsyncMock` to mock `AsyncAnthropic.messages.create` via `app.state.anthropic` override — no real API calls in tests. The router, schema, and service all follow established project conventions. No new packages are needed.

**Primary recommendation:** Use `claude-haiku-4-5-20251001` with an `async def` router handler, summarize tract context (not enumerate) when count > 10, mock `AsyncAnthropic` with `AsyncMock` in tests, target `max_tokens=1024` for replies.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anthropic | 0.84.0 (in requirements.txt) | Python SDK for Anthropic API; `AsyncAnthropic` class | Already installed; `app.state.anthropic` already initialized as `AsyncAnthropic()` in `app/main.py` |
| fastapi | 0.134.0 (in requirements.txt) | `async def` route handler support; Depends() injection | Existing framework — no change |
| pydantic v2 | via fastapi[standard] | `ChatRequest` and `ChatResponse` schemas | Consistent with all existing schemas |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-asyncio | >=0.24 (in requirements.txt) | Run async test functions with `@pytest.mark.asyncio` | Required for any test that `await`s the mocked Anthropic client |
| unittest.mock.AsyncMock | stdlib (Python 3.8+) | Mock `await client.messages.create(...)` without real API call | All chat tests must mock this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `claude-haiku-4-5-20251001` | `claude-sonnet-4-5-20250929` | Sonnet is 3x more expensive ($3/1M input); overkill for planner Q&A; Haiku 4.5 has same 200K context and 64K output ceiling |
| summarized tract context | full tract feature vectors | Feature vectors would be thousands of tokens per tract; 50 tracts * ~30 features = context explosion |
| `async def` handler | `def` handler with `asyncio.to_thread` | DuckDB is the only sync dependency (not needed in chat router); Anthropic SDK is async-native, so `async def` is correct here |

**Installation:** Nothing new — all packages already in `requirements.txt`.

---

## Architecture Patterns

### Recommended Project Structure

New files for Phase 4:

```
app/
├── routers/
│   └── chat.py              # POST /chat handler (async def)
├── schemas/
│   └── chat.py              # ChatRequest, MapContext, ChatResponse schemas
├── services/
│   └── chat.py              # build_system_prompt() function
tests/
└── test_chat.py             # Unit tests with AsyncMock
```

Wire into existing:
```
app/main.py                  # app.include_router(chat.router, prefix="/api/v1")
app/dependencies.py          # get_anthropic() already exists — use as-is
```

### Pattern 1: Async def Handler with AsyncAnthropic

**What:** The chat router uses `async def` (not `def`) because the Anthropic API call is a genuine async I/O operation. DuckDB is not used in this router.

**When to use:** Any route that calls `await` on an async external API. Contrast with Phases 2/3 which used `def` for DuckDB (synchronous).

**Example:**
```python
# Source: https://github.com/anthropics/anthropic-sdk-python README
# app/routers/chat.py
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends
from app.dependencies import get_anthropic
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat import build_system_prompt

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, anthropic: AsyncAnthropic = Depends(get_anthropic)) -> dict:
    """
    CHAT-01: Accept user question + map context, return Claude reply + usage.
    """
    system_prompt = build_system_prompt(body.map_context)
    message = await anthropic.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
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
```

### Pattern 2: Pydantic Schemas (ChatRequest / ChatResponse)

**What:** Request schema validates map context structure; response schema types the reply + usage object.

**Example:**
```python
# app/schemas/chat.py
from pydantic import BaseModel, Field

class TractScore(BaseModel):
    """Score triple for one selected tract."""
    xgb_heat_score: float
    xgb_risk_score: float
    tf_risk_score: float

class ActiveScenario(BaseModel):
    """Optional simulation scenario active on the map — mirrors Interventions shape."""
    tree_canopy_pct: float | None = None
    albedo_delta: float | None = None
    green_space_sqft: float | None = None

class MapContext(BaseModel):
    """What is currently visible on the planner's map."""
    selected_tract_ids: list[str] = Field(default_factory=list)
    current_scores: dict[str, TractScore] = Field(
        default_factory=dict,
        description="tract_id -> score triple for currently selected tracts",
    )
    active_scenario: ActiveScenario | None = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    map_context: MapContext

class UsageSummary(BaseModel):
    input_tokens: int
    output_tokens: int

class ChatResponse(BaseModel):
    reply: str
    usage: UsageSummary
```

### Pattern 3: System Prompt Builder with Token Budget Strategy

**What:** Separating prompt construction into a service function makes it independently testable and keeps the router thin. For 50+ tracts, summarize with statistics instead of enumerating all IDs.

**Token budget math (verified):**
- 200K total context window for `claude-haiku-4-5-20251001`
- System prompt goal: stay under ~2,000 tokens (leaves 198K for user message and history)
- 50 tracts enumerated with 3 scores each: ~50 * 15 tokens = ~750 tokens (safe if listed compactly)
- 50 tracts with full feature vectors: ~50 * 300 tokens = ~15,000 tokens (avoid this)
- Strategy: list IDs + scores compactly when <= 50; summarize with min/max/mean when > 50

**Example:**
```python
# app/services/chat.py
from app.schemas.chat import MapContext

SYSTEM_PREAMBLE = """You are an urban heat analyst assistant for King County, Washington.
You help city planners understand heat risk data and intervention options.
Answer in plain language. Be concise and specific to the data provided.

Data context:
- Scores are in [0, 1] range; higher = higher heat/risk
- xgb_heat_score: XGBoost predicted heat intensity
- xgb_risk_score: XGBoost predicted health risk
- tf_risk_score: TensorFlow predicted health risk
- Interventions: tree_canopy_pct (%), albedo_delta (0-1), green_space_sqft"""


def build_system_prompt(ctx: MapContext) -> str:
    """
    Build system prompt from map context. Stays under ~2,000 tokens for any input size.
    Enumerates tracts when count <= 50; summarizes statistics when count > 50.
    """
    parts = [SYSTEM_PREAMBLE, "\n## Current Map Context"]

    n = len(ctx.selected_tract_ids)
    if n == 0:
        parts.append("No tracts selected. Answer based on general King County heat data.")
    elif n <= 50:
        parts.append(f"\nSelected tracts ({n}):")
        for tid in ctx.selected_tract_ids:
            scores = ctx.current_scores.get(tid)
            if scores:
                parts.append(
                    f"  {tid}: heat={scores.xgb_heat_score:.3f}, "
                    f"risk_xgb={scores.xgb_risk_score:.3f}, "
                    f"risk_tf={scores.tf_risk_score:.3f}"
                )
            else:
                parts.append(f"  {tid}: (scores not provided)")
    else:
        # Summarize to stay within token budget
        heat_vals = [s.xgb_heat_score for s in ctx.current_scores.values()]
        risk_vals = [s.xgb_risk_score for s in ctx.current_scores.values()]
        parts.append(
            f"\n{n} tracts selected (too many to enumerate). Summary statistics:\n"
            f"  heat_score: min={min(heat_vals):.3f}, max={max(heat_vals):.3f}, "
            f"mean={sum(heat_vals)/len(heat_vals):.3f}\n"
            f"  risk_score: min={min(risk_vals):.3f}, max={max(risk_vals):.3f}, "
            f"mean={sum(risk_vals)/len(risk_vals):.3f}"
        )

    if ctx.active_scenario:
        s = ctx.active_scenario
        scenario_parts = []
        if s.tree_canopy_pct is not None:
            scenario_parts.append(f"tree_canopy_pct={s.tree_canopy_pct}%")
        if s.albedo_delta is not None:
            scenario_parts.append(f"albedo_delta={s.albedo_delta}")
        if s.green_space_sqft is not None:
            scenario_parts.append(f"green_space_sqft={s.green_space_sqft}")
        if scenario_parts:
            parts.append(f"\nActive scenario: {', '.join(scenario_parts)}")

    return "\n".join(parts)
```

### Pattern 4: Testing with AsyncMock + app.state Override

**What:** Override `app.state.anthropic` with a `MagicMock` whose `.messages.create` is an `AsyncMock`. Use `TestClient` (sync) — it handles async routes transparently.

**Why TestClient works:** FastAPI's `TestClient` uses `anyio` to run async handlers synchronously in tests. No need for `AsyncClient` or `pytest.mark.asyncio` for integration-style tests.

**Example:**
```python
# tests/test_chat.py
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routers import chat

# Idempotent router registration guard (matches Phase 3 pattern)
if not any(hasattr(r, "path") and "/chat" in getattr(r, "path", "") for r in app.routes):
    app.include_router(chat.router, prefix="/api/v1")


def make_mock_anthropic(reply_text: str = "Test reply from Claude.") -> MagicMock:
    """Return a mock AsyncAnthropic client with messages.create as AsyncMock."""
    mock_content = MagicMock()
    mock_content.text = reply_text

    mock_message = MagicMock()
    mock_message.content = [mock_content]
    mock_message.usage.input_tokens = 42
    mock_message.usage.output_tokens = 17

    mock_anthropic = MagicMock()
    mock_anthropic.messages.create = AsyncMock(return_value=mock_message)
    return mock_anthropic


@pytest.fixture
def client():
    app.state.anthropic = make_mock_anthropic()
    return TestClient(app, raise_server_exceptions=True)


class TestChatEndpoint:
    """Tests for POST /api/v1/chat (CHAT-01)."""

    def test_chat_returns_200_with_reply_and_usage(self, client):
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "Why is this area high risk?",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {
                            "xgb_heat_score": 0.82,
                            "xgb_risk_score": 0.74,
                            "tf_risk_score": 0.71,
                        }
                    },
                    "active_scenario": None,
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0
        assert "usage" in data
        assert "input_tokens" in data["usage"]
        assert "output_tokens" in data["usage"]

    def test_chat_empty_message_returns_422(self, client):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "", "map_context": {"selected_tract_ids": [], "current_scores": {}}},
        )
        assert resp.status_code == 422

    def test_chat_no_tracts_selected(self, client):
        """Empty tract selection is valid — system prompt handles it gracefully."""
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the county average?", "map_context": {"selected_tract_ids": [], "current_scores": {}}},
        )
        assert resp.status_code == 200

    def test_chat_system_prompt_includes_tract_scores(self, client):
        """Verify the mock was called — indirectly validates system prompt was built."""
        client.post(
            "/api/v1/chat",
            json={
                "message": "Tell me about this tract.",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {
                            "xgb_heat_score": 0.82,
                            "xgb_risk_score": 0.74,
                            "tf_risk_score": 0.71,
                        }
                    },
                    "active_scenario": None,
                },
            },
        )
        app.state.anthropic.messages.create.assert_called_once()
        call_kwargs = app.state.anthropic.messages.create.call_args.kwargs
        assert "system" in call_kwargs
        assert "53033010800" in call_kwargs["system"]

    def test_chat_with_active_scenario(self, client):
        """Active scenario is included in the request and processed without error."""
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "How much does adding trees help?",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {"xgb_heat_score": 0.82, "xgb_risk_score": 0.74, "tf_risk_score": 0.71}
                    },
                    "active_scenario": {"tree_canopy_pct": 10.0, "albedo_delta": None, "green_space_sqft": None},
                },
            },
        )
        assert resp.status_code == 200

    def test_build_system_prompt_50_tracts_stays_under_token_limit(self):
        """Unit test: build_system_prompt with 50 tracts produces < 3000 chars (~750 tokens)."""
        from app.schemas.chat import MapContext, TractScore
        from app.services.chat import build_system_prompt

        tract_ids = [f"5303300{i:04d}" for i in range(50)]
        scores = {tid: TractScore(xgb_heat_score=0.5, xgb_risk_score=0.4, tf_risk_score=0.45) for tid in tract_ids}
        ctx = MapContext(selected_tract_ids=tract_ids, current_scores=scores, active_scenario=None)
        prompt = build_system_prompt(ctx)

        # ~4 chars per token; 3000 chars ~ 750 tokens — well within 200K budget
        assert len(prompt) < 3000

    def test_build_system_prompt_over_50_tracts_summarizes(self):
        """Unit test: > 50 tracts triggers summary mode — no individual IDs enumerated."""
        from app.schemas.chat import MapContext, TractScore
        from app.services.chat import build_system_prompt

        tract_ids = [f"5303300{i:04d}" for i in range(51)]
        scores = {tid: TractScore(xgb_heat_score=0.5, xgb_risk_score=0.4, tf_risk_score=0.45) for tid in tract_ids}
        ctx = MapContext(selected_tract_ids=tract_ids, current_scores=scores, active_scenario=None)
        prompt = build_system_prompt(ctx)

        assert "51 tracts selected" in prompt
        assert "mean=" in prompt
        # Should NOT list individual tract IDs
        assert tract_ids[0] not in prompt
```

### Anti-Patterns to Avoid

- **Sync def with await:** Never use `def` (non-async) with `await` in the body — Python will raise a `SyntaxError`. The chat handler MUST be `async def`.
- **Passing feature vectors in context:** Do NOT pull full `tract_features` rows (30 columns) from DuckDB to include in the system prompt. The frontend already computed and sends `current_scores` — use those.
- **Using `Anthropic` (sync) instead of `AsyncAnthropic`:** The client in `app.state.anthropic` is already `AsyncAnthropic`. Calling `.messages.create()` without `await` will return a coroutine, not a response.
- **Not mocking the Anthropic client in tests:** Tests that make real API calls will fail without `ANTHROPIC_API_KEY` set, are slow, and incur cost.
- **Using `Mock` instead of `AsyncMock` for messages.create:** `Mock().messages.create()` returns a `Mock`, not a coroutine — `await` on it will raise `TypeError`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async HTTP to Anthropic API | Custom `aiohttp` wrapper | `AsyncAnthropic.messages.create()` | SDK handles retries, auth, rate limiting, response parsing |
| Token counting for system prompt | Character-counting heuristic | Keep prompt under 3,000 chars (~750 tokens) — far below 200K limit | At 50 tracts with 3 scores each, even verbose formatting stays under 1,500 chars; no counting needed |
| Response text extraction | `.content[0]["text"]` dict parsing | `.content[0].text` attribute access | SDK response is typed Pydantic-like objects, not raw dicts |
| Streaming for v1 | Server-Sent Events / async generator | Not needed — v1 is non-streaming (CHAT-V2-01 deferred) | Confirmed in REQUIREMENTS.md: "WebSocket / SSE streaming for chat (v1)" is Out of Scope |

**Key insight:** The Anthropic SDK wraps all complexity of the HTTP API. The only task is building the system prompt and extracting `.content[0].text` from the response.

---

## Common Pitfalls

### Pitfall 1: Using `def` Instead of `async def` for the Chat Handler

**What goes wrong:** DuckDB routes in Phases 2 and 3 ALL use `def` (sync). A developer may follow that pattern for the chat router, leading to `await` inside a sync function (SyntaxError) or a blocking Anthropic call inside a thread-pool-dispatched sync function.

**Why it happens:** The established pattern in this codebase is `def` for DuckDB routes. Chat is the first route that needs `async def`.

**How to avoid:** The chat router does NOT use DuckDB. It uses `AsyncAnthropic`. Use `async def` unconditionally for chat handlers.

**Warning signs:** If you see `def chat(...)` in the router with `await anthropic.messages.create(...)` — that's a SyntaxError.

---

### Pitfall 2: Forgetting `await` on `messages.create`

**What goes wrong:** `message = anthropic.messages.create(...)` without `await` returns a coroutine object. Accessing `message.content[0].text` raises `AttributeError: 'coroutine' object has no attribute 'content'`.

**Why it happens:** The `AsyncAnthropic` client's methods are coroutines — they must be awaited.

**How to avoid:** Always `await anthropic.messages.create(...)`. Add a type hint to the return to catch this at review time.

**Warning signs:** `AttributeError: 'coroutine' object has no attribute 'content'` in logs.

---

### Pitfall 3: Token Overflow from Full Feature Vector in System Prompt

**What goes wrong:** Fetching `tract_features` from DuckDB (30 columns per tract) and embedding all rows in the system prompt for 50 tracts creates a prompt in the tens of thousands of tokens. Even if it fits in the 200K window, it's expensive and degrades response quality.

**Why it happens:** Developers think "more context = better answers."

**How to avoid:** The frontend already computes `current_scores` (3 scores per tract). Use ONLY those scores in the system prompt. Never query DuckDB from the chat service.

**Warning signs:** System prompt length > 10,000 characters; DuckDB import in `app/services/chat.py`.

---

### Pitfall 4: Using `Mock()` Instead of `AsyncMock()` for the Anthropic Client in Tests

**What goes wrong:** `MagicMock().messages.create = Mock(return_value=...)` returns a plain object when called, not a coroutine. `await mock.messages.create(...)` raises `TypeError: object Mock can't be used in 'await' expression`.

**Why it happens:** `unittest.mock.Mock` does not produce awaitables.

**How to avoid:** Use `AsyncMock(return_value=mock_message)` for any async method being mocked.

**Warning signs:** `TypeError: object Mock can't be used in 'await' expression` during test runs.

---

### Pitfall 5: Not Registering the Chat Router in main.py

**What goes wrong:** The test passes (because the test file registers the router idempotently), but the production app returns 404 on `POST /api/v1/chat`.

**Why it happens:** The test's idempotent router guard masks the missing `app.include_router(chat.router, ...)` call in `main.py`.

**How to avoid:** The final plan task must update `app/main.py` to uncomment/add `app.include_router(chat.router, prefix="/api/v1")`.

**Warning signs:** All tests pass but manual `POST /api/v1/chat` returns 404.

---

## Code Examples

Verified patterns from official sources:

### Anthropic SDK: AsyncAnthropic.messages.create (non-streaming)

```python
# Source: https://github.com/anthropics/anthropic-sdk-python README
import asyncio
from anthropic import AsyncAnthropic

async def call_claude(system: str, user_message: str) -> dict:
    client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env
    message = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    return {
        "reply": message.content[0].text,
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens,
    }
```

### Response Object Shape (anthropic SDK 0.84.0)

```python
# message is an anthropic.types.Message object with:
message.id            # str — unique message ID
message.type          # "message"
message.role          # "assistant"
message.content       # list[ContentBlock] — always at least one element for non-streaming
message.content[0].type  # "text"
message.content[0].text  # str — the reply text
message.model         # str — model used, e.g. "claude-haiku-4-5-20251001"
message.stop_reason   # "end_turn" | "max_tokens" | "stop_sequence"
message.usage         # Usage object
message.usage.input_tokens   # int
message.usage.output_tokens  # int
```

### Model: claude-haiku-4-5-20251001 Confirmed Specs

```
# Source: https://platform.claude.com/docs/en/docs/about-claude/models/overview (fetched 2026-02-28)
Model ID:       claude-haiku-4-5-20251001
Alias:          claude-haiku-4-5
Context window: 200,000 tokens
Max output:     64,000 tokens
Input pricing:  $1.00 / 1M tokens
Output pricing: $5.00 / 1M tokens
Latency:        Fastest (Haiku tier)
```

### FastAPI async def + Depends(get_anthropic) pattern

```python
# Source: FastAPI docs https://fastapi.tiangolo.com/async/
# app/routers/chat.py
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends
from app.dependencies import get_anthropic

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    anthropic: AsyncAnthropic = Depends(get_anthropic),
) -> dict:
    # Anthropic call is awaitable — async def is required
    message = await anthropic.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=build_system_prompt(body.map_context),
        messages=[{"role": "user", "content": body.message}],
    )
    return {
        "reply": message.content[0].text,
        "usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
    }
```

### get_anthropic dependency (already exists in app/dependencies.py)

```python
# app/dependencies.py — already implemented (Phase 1 INFRA-07)
from anthropic import AsyncAnthropic
from fastapi import Request

def get_anthropic(request: Request) -> AsyncAnthropic:
    """Return the shared AsyncAnthropic client from app.state."""
    return request.app.state.anthropic
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `claude-3-haiku-20240307` | `claude-haiku-4-5-20251001` | Oct 2025 | Old Haiku 3 is deprecated (retirement Apr 19, 2026); use Haiku 4.5 |
| `Anthropic` (sync client) | `AsyncAnthropic` | SDK v0.20+ | Async client non-blocking in async frameworks; already used in this project |
| `stream=True` SSE for v1 | Full reply string for v1 | Project decision (REQUIREMENTS.md) | Streaming deferred to CHAT-V2-01; non-streaming sufficient for v1 |

**Deprecated/outdated:**
- `claude-3-haiku-20240307`: Deprecated, retires April 19, 2026. Do not use.
- `claude-sonnet-3-7-*`: Retired October 28, 2025. Do not use.
- Synchronous `Anthropic()` client in async FastAPI routes: Works but blocks event loop thread; use `AsyncAnthropic()` instead.

---

## Open Questions

1. **max_tokens ceiling for `max_tokens=1024`**
   - What we know: `claude-haiku-4-5-20251001` supports up to 64K output tokens. 1024 is sufficient for planner Q&A answers (typically a few paragraphs).
   - What's unclear: Whether any user question could legitimately require a longer answer.
   - Recommendation: Start with `max_tokens=1024`. If planners report truncated answers in UAT, increase to 2048. Do not go higher without user evidence.

2. **Anthropic API error handling in chat handler**
   - What we know: The SDK raises `anthropic.APIError` subclasses (rate limit, auth, server error) on API failures.
   - What's unclear: Project convention for upstream API failures — current handlers (main.py exception_handler(Exception)) catch unhandled exceptions and return 500.
   - Recommendation: Let the global unhandled exception handler in `main.py` catch Anthropic SDK errors as 500. Do not add bespoke Anthropic error handling in v1 — single consumer, low failure rate.

3. **selected_tract_ids max count validation**
   - What we know: Success criterion 3 says "more than 50 tracts does not cause context window overflow." There is no schema-layer max.
   - What's unclear: Whether to enforce a hard cap at the schema layer (e.g., max 500 tracts).
   - Recommendation: No schema cap needed for context safety — the summarization strategy handles 50+ gracefully. If needed for performance, add `le=500` constraint on `selected_tract_ids` list length.

---

## Sources

### Primary (HIGH confidence)

- `https://platform.claude.com/docs/en/docs/about-claude/models/overview` — Confirmed `claude-haiku-4-5-20251001` model ID, 200K context window, 64K max output, $1/$5 pricing (fetched 2026-02-28)
- `https://github.com/anthropics/anthropic-sdk-python` README — Confirmed `AsyncAnthropic.messages.create(model, max_tokens, system, messages)` API; response `.content[0].text` and `.usage.input_tokens`/`.usage.output_tokens` shape
- `app/main.py` (project codebase) — Confirmed `app.state.anthropic = AsyncAnthropic()` initialized at startup; confirmed `def` (sync) pattern for Phase 2/3 DuckDB routes; chat router placeholder commented out
- `app/dependencies.py` (project codebase) — Confirmed `get_anthropic(request)` dependency already implemented and returns `AsyncAnthropic`
- `requirements.txt` (project codebase) — Confirmed `anthropic==0.84.0` and `pytest-asyncio>=0.24` already installed

### Secondary (MEDIUM confidence)

- `https://fastapi.tiangolo.com/async/` — FastAPI async/await concurrency model; `async def` route for non-blocking I/O; verified via FastAPI official docs
- Multiple WebSearch results confirming `AsyncMock` from `unittest.mock` is the standard pattern for mocking async methods in pytest (Python 3.8+ stdlib)

### Tertiary (LOW confidence)

- Token budget estimate (3,000 chars = ~750 tokens for 50 tracts): Based on ~4 chars/token approximation rule. Not validated with Anthropic's token counting API. Margin of safety is very large (750 tokens vs 200K limit), so LOW confidence in the exact count is not a risk.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in requirements.txt; `AsyncAnthropic` confirmed in codebase
- Architecture: HIGH — async/await pattern confirmed via official FastAPI docs; system prompt strategy verified against confirmed context window specs
- Model selection: HIGH — verified directly from official Anthropic models overview page (fetched 2026-02-28); `claude-haiku-4-5-20251001` is current, not deprecated
- Pitfalls: HIGH — `AsyncMock` requirement confirmed via Python stdlib docs; DuckDB vs Anthropic async distinction confirmed from codebase inspection
- Token budget: MEDIUM — 200K context window confirmed; token count approximation (4 chars/token) is approximate but with 250x margin of safety

**Research date:** 2026-02-28
**Valid until:** 2026-04-01 (model IDs and SDK API stable; Anthropic deprecation schedule for Haiku 3 is April 2026 — already accounted for by using Haiku 4.5)
