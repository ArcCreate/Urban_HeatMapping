---
status: testing
phase: 02-data-endpoints
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md
started: 2026-02-28T23:40:00Z
updated: 2026-02-28T23:40:00Z
---

## Current Test

number: 1
name: Server Starts and Health Check Passes
expected: |
  With the urban-heatmap conda env active and king_county.duckdb present,
  the server starts without crashing. GET /api/v1/health returns HTTP 200.
  NOTE: Requires real ML model files at models/xgb_heat.json, models/xgb_risk.json,
  models/tf_risk/ — if these don't exist, startup will fail at load_models().
awaiting: user response

## Tests

### 1. Server Starts and Health Check Passes
expected: conda activate urban-heatmap && ANTHROPIC_API_KEY=test-key uvicorn app.main:app --reload starts without error. GET /api/v1/health returns {"status":"ok"}.
result: [pending]

### 2. Get All Tracts — GeoJSON FeatureCollection
expected: |
  GET /api/v1/tracts returns HTTP 200 with body:
  {"type": "FeatureCollection", "features": [...]}
  Each feature has "geometry" as a JSON object (not an escaped string) and
  "properties" containing tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score.
  curl: curl http://localhost:8000/api/v1/tracts | python3 -m json.tool | head -30
result: [pending]

### 3. Get Single Tract Detail
expected: |
  GET /api/v1/tracts/53033010800 returns HTTP 200 with tract_id, all mean_* feature columns, and 3 model scores.
  GET /api/v1/tracts/00000000000 returns HTTP 404.
  curl: curl http://localhost:8000/api/v1/tracts/53033010800 | python3 -m json.tool | head -20
result: [pending]

### 4. Get Tract Geometry Only
expected: |
  GET /api/v1/tracts/53033010800/geometry returns HTTP 200 with {"type":"Feature","geometry":{...},"properties":{"tract_id":"53033010800"}}.
  Response has NO mean_* feature columns and NO model scores — geometry only.
  curl: curl http://localhost:8000/api/v1/tracts/53033010800/geometry | python3 -m json.tool
result: [pending]

### 5. Batch Tract Lookup
expected: |
  POST /api/v1/tracts/batch with body {"tract_ids":["53033010800","53033029306"]} returns HTTP 200 with a JSON array of 2 TractDetail objects.
  POST with empty list {"tract_ids":[]} returns HTTP 422.
  curl: curl -X POST http://localhost:8000/api/v1/tracts/batch -H "Content-Type: application/json" -d '{"tract_ids":["53033010800"]}'
result: [pending]

### 6. Get Blocks by Tract
expected: |
  GET /api/v1/blocks?tract_id=53033010800 returns HTTP 200 with a GeoJSON FeatureCollection of blocks.
  Each block feature has geometry as a dict (not string) and properties with block_id and tract_id.
  GET /api/v1/blocks (no tract_id) returns HTTP 422 — required param missing.
  curl: curl "http://localhost:8000/api/v1/blocks?tract_id=53033010800" | python3 -m json.tool | head -20
result: [pending]

### 7. Get Block Detail
expected: |
  GET /api/v1/blocks/{block_id} for a valid block ID returns HTTP 200 with typed JSON (block_id, tract_id, mean_* columns, city_name) — NO geometry field.
  Unknown block_id returns HTTP 404.
  (Use a block_id from the blocks FeatureCollection in test 6.)
result: [pending]

### 8. Get All Predictions (No Geometry)
expected: |
  GET /api/v1/predictions/tracts returns HTTP 200 with a JSON array.
  Each item has tract_id, xgb_heat_score, xgb_risk_score, tf_risk_score.
  No "geometry" or "type" fields — this is a flat score list, not GeoJSON.
  curl: curl http://localhost:8000/api/v1/predictions/tracts | python3 -m json.tool | head -20
result: [pending]

### 9. Ranked Predictions with Validation
expected: |
  GET /api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=10 returns top 10 tracts ordered by heat score descending.
  GET /api/v1/predictions/tracts/ranked?sort_by=invalid_col returns HTTP 422.
  curl: curl "http://localhost:8000/api/v1/predictions/tracts/ranked?sort_by=xgb_heat_score&order=desc&limit=5"
result: [pending]

### 10. County Summary Stats
expected: |
  GET /api/v1/summary/county returns HTTP 200 with:
  {"tract_count": <int>, "mean_heat_score": <float>, "p75_heat_score": <float>, "high_risk_tract_count": <int>}
  high_risk_tract_count should be tracts where xgb_heat_score > 0.75.
  curl: curl http://localhost:8000/api/v1/summary/county | python3 -m json.tool
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0

## Gaps

[none yet]
