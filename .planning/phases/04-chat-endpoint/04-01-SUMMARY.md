---
phase: 04-chat-endpoint
plan: 01
subsystem: api
tags: [anthropic, fastapi, pydantic, asyncanthropic, system-prompt, chat, mocking]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: AsyncAnthropic client in app.state via get_anthropic() dependency, global exception handlers, FastAPI lifespan
  - phase: 03-simulation-engine
    provides: router registration patterns (idempotent guard, prefix wiring in main.py)
provides:
  - POST /api/v1/chat — async Claude-powered endpoint accepting ChatRequest (message + map context)
  - ChatRequest, MapContext, TractScore, ActiveScenario, ChatResponse, UsageSummary Pydantic v2 schemas
  - build_system_prompt() — context-aware system prompt builder with enumeration (<= 50 tracts) and summary (> 50 tracts) modes
affects: [05-frontend, any phase adding conversational AI features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - async def router handler pattern (first and only async router in the project)
    - AsyncMock/MagicMock override of app.state.anthropic for no-API-call testing
    - System prompt token budget strategy: enumerate <= 50 tracts, summarize > 50 with min/max/mean

key-files:
  created:
    - app/schemas/chat.py
    - app/services/chat.py
    - app/routers/chat.py
    - tests/test_chat.py
  modified:
    - app/main.py

key-decisions:
  - "async def (not def) for chat handler — await anthropic.messages.create() requires async; only async router in project"
  - "claude-haiku-4-5-20251001 model selected — current non-deprecated haiku, 200K context, 64K output, cost-efficient for v1 planner queries"
  - "Compact per-tract format (h=, rx=, rt= abbreviations) to keep 50-tract enumeration under 3000 chars — verbose format exceeded limit"
  - "Idempotent router guard in test file — hasattr(r, 'path') and '/chat' in path prevents duplicate registration before main.py wiring"
  - "SDK errors propagate to global 500 handler — no per-request error wrapping needed in v1"

patterns-established:
  - "Async router pattern: async def handler with Depends(get_anthropic) injects AsyncAnthropic from app.state"
  - "Test isolation via app.state override: app.state.anthropic = make_mock_anthropic() in fixture, no real API calls"
  - "System prompt budget strategy: <= 50 tracts enumerate IDs+scores; > 50 summarize with min/max/mean statistics"

requirements-completed: [CHAT-01]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 4 Plan 01: Chat Endpoint Summary

**POST /api/v1/chat with Claude haiku-4-5, context-aware system prompt (enumerate <= 50 tracts / summarize > 50), and 8 mocked integration tests — CHAT-01 complete**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T00:53:50Z
- **Completed:** 2026-03-01T00:56:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Six Pydantic v2 schemas (ChatRequest, MapContext, TractScore, ActiveScenario, ChatResponse, UsageSummary) with min_length=1 validation on message
- build_system_prompt() enumerates tract IDs + scores for <= 50 tracts; generates min/max/mean summary for > 50 tracts; stays under 3000 chars
- POST /api/v1/chat async handler using claude-haiku-4-5-20251001, wired into app via app.include_router in main.py
- 8 tests all passing: 200 happy path, 422 validation (empty/missing message), empty tracts, mock assertion, active scenario, prompt length bounds, summary mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Schemas and service — contracts and system prompt builder** - `8a6e216` (feat)
2. **Task 2: Router, tests, and main.py wiring** - `e1f26fb` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `app/schemas/chat.py` - Six Pydantic v2 models for chat request/response contracts
- `app/services/chat.py` - SYSTEM_PREAMBLE constant and build_system_prompt() with token budget strategy
- `app/routers/chat.py` - POST /chat async handler using Depends(get_anthropic) and AsyncAnthropic
- `tests/test_chat.py` - 8 tests with AsyncMock override of app.state.anthropic (no real API calls)
- `app/main.py` - Added chat to router imports and app.include_router(chat.router, prefix="/api/v1")

## Decisions Made
- Used `async def` for the chat handler (first async router in the project) — required by `await anthropic.messages.create()`
- Selected claude-haiku-4-5-20251001 for cost-efficient v1 planner queries
- Used compact abbreviations (h=, rx=, rt=) in per-tract lines to keep 50-tract enumeration under 3000 chars

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Compact per-tract format to pass 3000-char prompt length test**
- **Found during:** Task 2 (tests/test_chat.py run)
- **Issue:** Verbose format `heat=0.500, risk_xgb=0.400, risk_tf=0.450` per line caused 50-tract prompt to reach 3407 chars, exceeding the 3000-char limit asserted in the test and specified in plan must_haves
- **Fix:** Shortened field labels to `h=`, `rx=`, `rt=` in per-tract lines; reduced to 2607 chars for 50 tracts
- **Files modified:** app/services/chat.py
- **Verification:** `test_build_system_prompt_50_tracts_stays_under_token_limit` passes; all 8 tests pass
- **Committed in:** e1f26fb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug/correctness)
**Impact on plan:** Fix necessary for correctness per plan must_haves. No scope creep. Abbreviated field names are still readable in Claude's context.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. Anthropic API key is already required by Phase 1 settings (`ANTHROPIC_API_KEY` env var).

## Next Phase Readiness
- CHAT-01 complete: POST /api/v1/chat live, tested, and wired into main.py
- Phase 4 plan 01 is the only plan in phase 04 — phase 04 is complete
- API v1 feature set complete: health, tracts, predictions, summary, blocks, simulations, chat

---
*Phase: 04-chat-endpoint*
*Completed: 2026-03-01*
