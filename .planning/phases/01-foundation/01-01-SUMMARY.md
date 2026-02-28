---
phase: 01-foundation
plan: "01"
subsystem: infra
tags: [fastapi, pydantic-settings, xgboost, tensorflow, duckdb, anthropic, python]

# Dependency graph
requires: []
provides:
  - requirements.txt with all 9 pinned dependencies
  - .env.example with all required environment variable names
  - app/config.py Settings class (pydantic-settings BaseSettings) reading ANTHROPIC_API_KEY and model paths from .env
  - app/models/loader.py LoadedModels dataclass and synchronous load_models() factory
  - app/dependencies.py get_db, get_models, get_anthropic FastAPI Depends() helpers reading from app.state
  - app package structure (app/, app/schemas/, app/models/, app/routers/)
affects: [01-02-PLAN.md, all subsequent phases that import from app.config, app.models.loader, app.dependencies]

# Tech tracking
tech-stack:
  added:
    - fastapi[standard]==0.134.0
    - duckdb>=1.2.0,<2.0
    - xgboost>=2.0,<3.0
    - tensorflow>=2.15,<3.0 (requires Python 3.12; Python 3.13 segfaults on arm64)
    - anthropic==0.84.0
    - pydantic-settings>=2.0,<3.0
    - pytest>=8.0, httpx>=0.28, pytest-asyncio>=0.24 (dev/test)
  patterns:
    - pydantic-settings BaseSettings for env-var config with startup validation
    - Synchronous load_models() factory called via asyncio.to_thread() in lifespan
    - app.state as shared resource store; Depends() helpers extract resources per-request
    - TF imported before XGBoost in loader.py to prevent macOS arm64 OpenMP conflict

key-files:
  created:
    - requirements.txt
    - .env.example
    - .gitignore
    - app/__init__.py
    - app/config.py
    - app/models/__init__.py
    - app/models/loader.py
    - app/dependencies.py
    - app/schemas/__init__.py
    - app/routers/__init__.py
  modified: []

key-decisions:
  - "Python 3.12 required — TensorFlow 2.20.0 segfaults on Python 3.13 (arm64); conda env with python=3.12 is the standard setup"
  - "TF imported before XGBoost in loader.py — prevents macOS arm64 OpenMP conflict (TF bundled runtime wins)"
  - "anthropic_api_key has no default in Settings — raises ValidationError at startup if missing, not at first chat request"
  - "Model paths have defaults (models/xgb_heat.json etc.) but no existence validation in Settings — validated at lifespan startup"

patterns-established:
  - "Pattern: load_models() is synchronous and MUST be called via asyncio.to_thread() — never directly from async code"
  - "Pattern: Depends() helpers read from request.app.state; resources are wired by lifespan in app/main.py (Plan 02)"
  - "Pattern: No circular imports — dependencies.py imports from models/loader.py only; config.py has no app imports"

requirements-completed: [INFRA-05, INFRA-06, INFRA-07]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 1 Plan 01: Foundation Scaffold Summary

**FastAPI scaffold layer: pydantic-settings config, XGBoost+TF model loader with macOS arm64 OpenMP fix, and DI helpers — all importable with zero model files required**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T21:47:36Z
- **Completed:** 2026-02-28T21:54:22Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- requirements.txt with all 9 pinned dependencies and Python 3.12 requirement note
- app/config.py Settings class that validates ANTHROPIC_API_KEY at startup (fails fast with clear error if missing)
- app/models/loader.py with LoadedModels dataclass and synchronous load_models() factory; TF imported before XGBoost to prevent macOS arm64 OpenMP conflict
- app/dependencies.py with get_db, get_models, get_anthropic Depends() helpers extracting from app.state
- Full app package structure with empty __init__.py files for all subpackages

## Task Commits

Each task was committed atomically:

1. **Task 1: Write requirements.txt and .env.example** - `332afce` (chore)
2. **Task 2: Create app package and pydantic-settings config** - `48dc522` (feat)
3. **Task 3: Create ML model loader and DI helpers** - `87ec13a` (feat)

## Files Created/Modified

- `requirements.txt` - All 9 pinned dependencies; Python 3.12 requirement noted (TF 2.20 + Python 3.13 arm64 = segfault)
- `.env.example` - Template for ANTHROPIC_API_KEY, DUCKDB_PATH, model paths, OMP thread settings
- `.gitignore` - Excludes .env, __pycache__, *.duckdb, /models/ (root only); .env.example tracked
- `app/__init__.py` - Empty package init
- `app/config.py` - Settings(BaseSettings) with anthropic_api_key (required), duckdb_path, model paths, cors_origins
- `app/models/__init__.py` - Empty package init
- `app/models/loader.py` - LoadedModels dataclass and synchronous load_models() factory
- `app/dependencies.py` - get_db, get_models, get_anthropic Depends() helpers
- `app/schemas/__init__.py` - Empty package init
- `app/routers/__init__.py` - Empty package init

## Decisions Made

- **Python 3.12 required:** TensorFlow 2.20.0 segfaults with exit code 139 on Python 3.13.5 arm64. The project must use Python 3.12 (via conda env or pyenv). This is documented in requirements.txt.
- **OMP_NUM_THREADS=1:** Set in .env.example to prevent macOS arm64 OpenMP conflict between TF and XGBoost even when import order is correct.
- **No path existence validation in Settings:** Model file existence is checked at lifespan startup (Plan 02), not in Settings. Settings validates required keys only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed .gitignore models/ pattern shadowing app/models/**
- **Found during:** Task 2 (Create app package)
- **Issue:** `.gitignore` had `models/` which git interpreted as matching any `models/` directory including `app/models/`, blocking the git add
- **Fix:** Changed `models/` to `/models/` (anchored to root) so only the top-level models/ directory containing ML model files is excluded
- **Files modified:** `.gitignore`
- **Verification:** `git add app/models/__init__.py` succeeded after fix
- **Committed in:** `48dc522` (Task 2 commit)

**2. [Rule 3 - Blocking] Used Python 3.12 conda env for verification (TF segfault on Python 3.13)**
- **Found during:** Task 3 (Create ML model loader)
- **Issue:** `import tensorflow as tf` causes exit code 139 (segfault) on the system Python 3.13.5 arm64; this is a TF 2.20.0 Python 3.13 incompatibility
- **Fix:** Created `conda create -n urban-heatmap python=3.12` env, installed all requirements, verified imports succeed. Added Python 3.12 requirement comment to requirements.txt.
- **Files modified:** `requirements.txt` (added Python version note)
- **Verification:** `ANTHROPIC_API_KEY=test-key /opt/anaconda3/envs/urban-heatmap/bin/python -c "from app.models.loader import LoadedModels, load_models; from app.dependencies import get_db, get_models, get_anthropic; print('PASS')"` output: `PASS`
- **Committed in:** `87ec13a` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes essential for task completion. No scope creep. The Python 3.12 requirement is a real constraint that Plan 02 executor must be aware of.

## Issues Encountered

- TensorFlow 2.20.0 does not support Python 3.13 on arm64 (segfault at import). Resolution: conda env with Python 3.12. All subsequent plans must run in this environment.

## User Setup Required

Before running the app, users must:
1. Create the conda environment: `conda create -n urban-heatmap python=3.12 -y`
2. Activate it: `conda activate urban-heatmap`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`

See `.env.example` for all required environment variables.

## Next Phase Readiness

- Foundation scaffold complete; all imports verified with `ANTHROPIC_API_KEY=test-key`
- Plan 02 (app wiring: main.py, lifespan, health router) can proceed immediately
- Plan 02 executor must use Python 3.12 env (`/opt/anaconda3/envs/urban-heatmap/bin/python`)
- Model files (`models/xgb_heat.json`, `models/xgb_risk.json`, `models/tf_risk/`) do not need to exist for import tests; they are needed only when `load_models()` is called in the lifespan

---
*Phase: 01-foundation*
*Completed: 2026-02-28*
