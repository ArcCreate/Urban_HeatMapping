---
status: diagnosed
phase: 02-data-endpoints
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md
started: 2026-02-28T23:40:00Z
updated: 2026-02-28T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Server Starts and Health Check Passes
expected: conda activate urban-heatmap && ANTHROPIC_API_KEY=test-key uvicorn app.main:app --reload starts without error. GET /api/v1/health returns {"status":"ok"}.
result: pass

### 2. Get All Tracts — GeoJSON FeatureCollection
expected: |
  GET /api/v1/tracts returns HTTP 200 with body:
  {"type": "FeatureCollection", "features": [...]}
  Each feature has "geometry" as a JSON object (not an escaped string) and
  "properties" containing tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score.
  curl: curl http://localhost:8000/api/v1/tracts | python3 -m json.tool | head -30
result: pass

### 3. Get Single Tract Detail
expected: |
  GET /api/v1/tracts/53033010800 returns HTTP 200 with tract_id, all mean_* feature columns, and 3 model scores.
  GET /api/v1/tracts/00000000000 returns HTTP 404.
  curl: curl http://localhost:8000/api/v1/tracts/53033010800 | python3 -m json.tool | head -20
result: pass

### 4. Get Tract Geometry Only
expected: |
  GET /api/v1/tracts/53033010800/geometry returns HTTP 200 with {"type":"Feature","geometry":{...},"properties":{"tract_id":"53033010800"}}.
  Response has NO mean_* feature columns and NO model scores — geometry only.
  curl: curl http://localhost:8000/api/v1/tracts/53033010800/geometry | python3 -m json.tool
result: pass

### 5. Batch Tract Lookup
expected: |
  POST /api/v1/tracts/batch with body {"tract_ids":["53033010800","53033029306"]} returns HTTP 200 with a JSON array of 2 TractDetail objects.
  POST with empty list {"tract_ids":[]} returns HTTP 422.
  curl: curl -X POST http://localhost:8000/api/v1/tracts/batch -H "Content-Type: application/json" -d '{"tract_ids":["53033010800"]}'
result: pass

### 6. Get Blocks by Tract
expected: |
  GET /api/v1/blocks?tract_id=53033010800 returns HTTP 200 with a GeoJSON FeatureCollection of blocks.
  Each block feature has geometry as a dict (not string) and properties with block_id and tract_id.
  GET /api/v1/blocks (no tract_id) returns HTTP 422 — required param missing.
  curl: curl "http://localhost:8000/api/v1/blocks?tract_id=53033010800" | python3 -m json.tool | head -20
result: issue
reported: "curl returns HTTP 404 {\"error\": \"HTTPException\", \"detail\": \"Not Found\", \"status_code\": 404}"
severity: major

### 7. Get Block Detail
expected: |
  GET /api/v1/blocks/{block_id} for a valid block ID returns HTTP 200 with typed JSON (block_id, tract_id, mean_* columns, city_name) — NO geometry field.
  Unknown block_id returns HTTP 404.
  (Use a block_id from the blocks FeatureCollection in test 6.)
result: skipped
reason: could not obtain a valid block_id since test 6 (blocks by tract) failed with 404

### 8. Get All Predictions (No Geometry)
expected: |
  GET /api/v1/predictions/tracts returns HTTP 200 with a JSON array.
  Each item has tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score.
  No "geometry" or "type" fields — this is a flat score list, not GeoJSON.
  curl: curl http://localhost:8000/api/v1/predictions/tracts | python3 -m json.tool | head -20
result: pass

### 9. Ranked Predictions with Validation
expected: |
  GET /api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=10 returns top 10 tracts ordered by heat score descending.
  GET /api/v1/predictions/tracts/ranked?sort_by=invalid_col returns HTTP 422.
  curl: curl "http://localhost:8000/api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=5"
result: pass

### 10. County Summary Stats
expected: |
  GET /api/v1/summary/county returns HTTP 200 with:
  {"tract_count": <int>, "mean_heat_score": <float>, "p75_heat_score": <float>, "high_risk_tract_count": <int>}
  high_risk_tract_count should be tracts where xgb_heat_score > 0.75.
  curl: curl http://localhost:8000/api/v1/summary/county | python3 -m json.tool
result: pass

## Summary

total: 10
passed: 8
issues: 1
pending: 0
skipped: 1

## Gaps

- truth: "GET /api/v1/blocks?tract_id=53033010800 returns HTTP 200 with GeoJSON FeatureCollection of blocks"
  status: failed
  reason: "User reported: curl returns HTTP 404 {\"error\": \"HTTPException\", \"detail\": \"Not Found\", \"status_code\": 404}"
  severity: major
  test: 6
  root_cause: "app/main.py never imports or registers blocks.router — include_router call was left commented out with a TODO. The blocks router, service, and DuckDB table are all fully implemented."
  artifacts:
    - path: "app/main.py"
      issue: "blocks not in import on line 16; app.include_router(blocks.router, ...) commented out on line 120"
  missing:
    - "Add blocks to import: from app.routers import health, tracts, predictions, summary, blocks"
    - "Uncomment: app.include_router(blocks.router, prefix=\"/api/v1\")"
  debug_session: ".planning/debug/blocks-404-tract-id.md"
