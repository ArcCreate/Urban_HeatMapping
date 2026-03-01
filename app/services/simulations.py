# app/services/simulations.py
"""
Parametric simulation engine for urban heat intervention modeling.

SIM-01: simulate_what_if — apply a single intervention set across specified tracts
SIM-02: simulate_compare — compare two intervention scenarios side-by-side

CRITICAL: All functions use db.cursor() for thread safety under FastAPI's thread pool.
CRITICAL: No reference to app.state.models — v1 uses parametric formulas only (no model re-inference).
"""
import duckdb
from fastapi import HTTPException

from app.schemas.simulations import Interventions

# ---------------------------------------------------------------------------
# Physical bounds for absolute temperature
# ---------------------------------------------------------------------------
TEMP_MIN_F = 0.0    # Absolute lower bound (°F)
TEMP_MAX_F = 150.0  # Absolute upper bound (°F)

# ---------------------------------------------------------------------------
# Formula coefficients
# ---------------------------------------------------------------------------

# beta_canopy: 0.04°F cooling per 1% canopy increase
# Source: Seattle canopy research (technical_spec.md); +13% canopy → ~0.5°F cooling; 0.5/13 ≈ 0.04
BETA_CANOPY = 0.04

# beta_albedo: 5.4°F cooling per full albedo unit increase (0→1)
# Source: Mesoscale UHI modeling consensus (Scientific Reports 2024 PMC10766998; MDPI Buildings 2024);
# 0.3°C per 0.1 albedo unit × 10 × 1.8°F/°C = 5.4°F/unit.
# Range in literature: 0.09–0.61°C per 0.1 unit depending on climate and study design.
BETA_ALBEDO = 5.4

# beta_green_space: 5.0e-6 °F cooling per sqft of added green space
# Source: Manchester urban study (ScienceDirect 2025): +5% tree density across ~200 acre tract → -1.0°C;
# 5% × 8,712,000 sqft = 435,600 sqft → -1.8°F; coefficient = 1.8/435,600 ≈ 4.1e-6.
# Midpoint with Adama City study (Tandfonline 2024): 5.5 ha → -2.85°C → ~8.6e-6.
# Conservative midpoint adopted: 5.0e-6. Note: per-sqft linearity is a planning simplification.
BETA_GREEN_SPACE = 5.0e-6

# heat_weight: heat's contribution to overall risk score (technical_spec.md)
# risk = 0.4×heat + 0.3×canopy_gap + 0.2×health + 0.1×equity
HEAT_WEIGHT = 0.4

# NULL fallback for mean_afternoon_temp when DuckDB returns None
TEMP_NULL_FALLBACK_F = 85.0


def _compute_simulation(
    db: duckdb.DuckDBPyConnection,
    tract_ids: list[str],
    interventions: Interventions,
) -> list[dict]:
    """
    Private helper: fetch tract data, apply parametric formulas, return per-tract deltas.

    Raises HTTPException(404) on the first unrecognized tract_id before any formula application.
    Returns list of {"tract_id": str, "delta_temp": float, "delta_risk": float}.
    """
    cursor = db.cursor()
    placeholders = ", ".join(["?" for _ in tract_ids])
    rows = cursor.execute(
        f"""
        SELECT tf.tract_id, tf.mean_afternoon_temp, top.xgb_heat_score, top.xgb_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
        WHERE tf.tract_id IN ({placeholders})
        ORDER BY tf.tract_id
        """,
        tract_ids,
    ).fetchall()

    # Validate all requested tract IDs were found — raise 404 on first missing
    found_ids = {row[0] for row in rows}
    for tid in tract_ids:
        if tid not in found_ids:
            raise HTTPException(status_code=404, detail=f"Tract '{tid}' not found")

    results = []
    for row in rows:
        tract_id, mean_afternoon_temp, xgb_heat_score, xgb_risk_score = row

        # Step 1: raw temperature delta from interventions (negative = cooling)
        raw_delta = -(
            BETA_CANOPY * (interventions.tree_canopy_pct or 0.0)
            + BETA_ALBEDO * (interventions.albedo_delta or 0.0)
            + BETA_GREEN_SPACE * (interventions.green_space_sqft or 0.0)
        )

        # Step 2: use fallback if base temp is NULL
        base_temp_safe = mean_afternoon_temp if mean_afternoon_temp is not None else TEMP_NULL_FALLBACK_F

        # Step 3: clamp simulated absolute temp to physical bounds
        simulated_temp = max(TEMP_MIN_F, min(TEMP_MAX_F, base_temp_safe + raw_delta))

        # Step 4: effective temperature delta after clamping
        bounded_delta_temp = simulated_temp - base_temp_safe

        # Step 5: proportional risk delta — heat's share of risk scaled by temp change fraction
        delta_risk = HEAT_WEIGHT * xgb_heat_score * (bounded_delta_temp / base_temp_safe)

        # Step 6: clamp simulated risk to [0, 1]
        simulated_risk = max(0.0, min(1.0, xgb_risk_score + delta_risk))

        # Step 7: effective risk delta after clamping
        bounded_delta_risk = simulated_risk - xgb_risk_score

        results.append({
            "tract_id": tract_id,
            "delta_temp": round(bounded_delta_temp, 4),
            "delta_risk": round(bounded_delta_risk, 4),
        })

    return results


def simulate_what_if(
    db: duckdb.DuckDBPyConnection,
    tract_ids: list[str],
    interventions: Interventions,
) -> list[dict]:
    """
    SIM-01: Apply a single intervention set to all specified tracts.

    Returns list of WhatIfResult-compatible dicts: {tract_id, delta_temp, delta_risk}.
    Raises HTTPException(404) if any tract_id is not found.
    """
    return _compute_simulation(db, tract_ids, interventions)


def simulate_compare(
    db: duckdb.DuckDBPyConnection,
    tract_ids: list[str],
    scenario_a: Interventions,
    scenario_b: Interventions,
) -> list[dict]:
    """
    SIM-02: Compare two intervention scenarios side-by-side for all specified tracts.

    Returns list of CompareResult-compatible dicts:
        {tract_id, scenario_a: {delta_temp, delta_risk}, scenario_b: {delta_temp, delta_risk}}
    Raises HTTPException(404) if any tract_id is not found (propagates from first _compute_simulation call).
    """
    results_a = {r["tract_id"]: r for r in _compute_simulation(db, tract_ids, scenario_a)}
    results_b = {r["tract_id"]: r for r in _compute_simulation(db, tract_ids, scenario_b)}

    # Key-based merge sorted by tract_id for deterministic output
    return [
        {
            "tract_id": tid,
            "scenario_a": {
                "delta_temp": results_a[tid]["delta_temp"],
                "delta_risk": results_a[tid]["delta_risk"],
            },
            "scenario_b": {
                "delta_temp": results_b[tid]["delta_temp"],
                "delta_risk": results_b[tid]["delta_risk"],
            },
        }
        for tid in sorted(results_a.keys())
    ]
