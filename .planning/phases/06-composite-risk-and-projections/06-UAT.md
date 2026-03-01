---
status: testing
phase: 06-composite-risk-and-projections
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md]
started: 2026-03-01T07:30:00Z
updated: 2026-03-01T07:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 4
name: Year Range Validation
expected: |
  GET /api/v1/projections/2024 returns HTTP 400 with an error about the year
  being out of range. GET /api/v1/projections/2051 also returns HTTP 400.
awaiting: user response

## Tests

### 1. Composite Risk in Ranked Predictions API
expected: GET /api/v1/predictions/tracts/ranked?sort_by=composite_risk returns HTTP 200. Each tract includes a composite_risk field (0–1). Results sorted by composite_risk descending.
result: pass

### 2. Projections Year Snapshot Endpoint
expected: GET /api/v1/projections/2030 returns 492 tract objects, each with tract_id, year=2030, and projected_risk between 0 and 1.
result: pass

### 3. Projections Tract Series Endpoint
expected: GET /api/v1/projections/range?tract_id={valid_id} (e.g. 53033000101) returns a series of 26 year entries covering 2025–2050, each with a projected_risk value. projected_risk values increase over the years reflecting the warming trend.
result: pass

### 4. Year Range Validation
expected: GET /api/v1/projections/2024 returns HTTP 400 with an error message "Year must be between 2025 and 2050". GET /api/v1/projections/2051 also returns HTTP 400.
result: [pending]

### 5. Timeline Slider Updates Choropleth
expected: In the UI, drag the timeline slider from 2025 to 2030. The choropleth map colors visibly update — tracts should shift towards higher-risk colors (warmer palette) as projected temperatures rise. A loading indicator appears briefly while data is fetching.
result: [pending]

### 6. Tract Popup PROJ Label
expected: With the slider at 2030, click any tract. The popup risk badge shows "PROJ 2030". Drag slider back to 2025 and click the same tract — the badge shows "RISK" (not PROJ).
result: [pending]

### 7. Timeline Auto-play
expected: Click the play button on the timeline slider. The year advances automatically year by year (2025 → 2026 → ... → 2050). Clicking pause stops it. The choropleth updates with each year advance.
result: [pending]

## Summary

total: 7
passed: 3
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
