---
status: complete
phase: 03-simulation-engine
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-02-28T04:50:00Z
updated: 2026-02-28T05:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. What-If endpoint returns per-tract cooling deltas
expected: POST /api/v1/simulations/what-if with valid tract IDs and an intervention (e.g. tree_canopy_pct: 20) returns HTTP 200 with a list of objects — each having tract_id, delta_temp (negative = cooling), and delta_risk (negative = risk reduction).
result: pass

### 2. What-If zero-intervention returns zero deltas
expected: POST /api/v1/simulations/what-if with all intervention fields omitted (or set to 0) returns 200 with delta_temp: 0.0 and delta_risk: 0.0 for each tract.
result: pass

### 3. What-If empty tract_ids returns 422
expected: POST /api/v1/simulations/what-if with tract_ids: [] returns HTTP 422 with a JSON body shaped as {error, detail, status_code}.
result: pass

### 4. What-If unknown tract ID returns 404
expected: POST /api/v1/simulations/what-if with a made-up tract ID (e.g. "FAKE-9999") returns HTTP 404 with {error, detail, status_code}.
result: pass

### 5. What-If out-of-range field returns 422
expected: POST /api/v1/simulations/what-if with tree_canopy_pct: 150 (over the 100 max) returns HTTP 422. Similarly albedo_delta: 2.0 or any negative value should also return 422.
result: pass

### 6. Compare endpoint returns two-scenario deltas per tract
expected: POST /api/v1/simulations/compare with valid tract IDs, scenario_a interventions, and scenario_b interventions returns HTTP 200 with a list of objects — each having tract_id, scenario_a: {delta_temp, delta_risk}, scenario_b: {delta_temp, delta_risk}.
result: pass

### 7. Compare stronger intervention produces more cooling
expected: POST /api/v1/simulations/compare with scenario_b using a higher tree_canopy_pct than scenario_a should return scenario_b.delta_temp more negative than scenario_a.delta_temp (greater cooling effect).
result: pass

### 8. Compare empty tract_ids returns 422
expected: POST /api/v1/simulations/compare with tract_ids: [] returns HTTP 422 with {error, detail, status_code}.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
