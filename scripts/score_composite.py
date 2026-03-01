#!/usr/bin/env python3
"""
Compute formula-based composite_risk for all 492 King County tracts.

USAGE (from project root, conda env urban-heatmap):
    python scripts/score_composite.py

OUTPUT:
    Adds or updates `composite_risk` DOUBLE column in tract_outputs_with_preds.
    Values are in [0, 1] by construction.

FORMULA (4 domains, weights sum to 1.0):
    composite_risk = (
        0.30 * thermal_score        +   # direct heat exposure
        0.25 * vegetation_score     +   # imperv + tree_cov (built-environment modifiers)
        0.25 * health_score         +   # CVD, diabetes, life_expectancy
        0.20 * social_score             # SVI, poverty, disability, under-18, housing cost
    )

WEIGHT JUSTIFICATION:
    Thermal 0.30: Temperature is the primary heat exposure signal.
        Source: PMC8531084 systematic review; King County Heat Safety framework.
    Vegetation 0.25: Impervious surface + tree canopy are the dominant built-environment
        modifiers of daytime heat (PNAS 2019 canopy/imperviousness interaction study).
    Health 0.25: CVD, diabetes, life expectancy are the strongest predictors of
        heat mortality per HVI literature (7/13 studies in PMC8531084).
    Social 0.20: SVI, poverty, disability, under-18 are established secondary
        sensitivity factors (CDC SVI Heat Vulnerability Index methodology).
"""
import logging
import pathlib
import sys

import duckdb
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Tunable weight constants ────────────────────────────────────────────────
WEIGHTS = {
    "thermal":    0.30,  # mean_afternoon_temp (normalized)
    "vegetation": 0.25,  # mean_imperv (inverted) + mean_tree_cov (inverted), equal split
    "health":     0.25,  # mean_cvd_rate, mean_diabetes, mean_life_expectancy (inverted), avg
    "social":     0.20,  # mean_svi_overall, mean_poverty2x, mean_disability, mean_under18, mean_severe_cost, avg
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "Weights must sum to 1.0"

PROJECT_ROOT = pathlib.Path(__file__).parent.parent
DUCKDB_PATH  = PROJECT_ROOT / "king_county.duckdb"


def minmax(arr: np.ndarray) -> np.ndarray:
    """Min-max normalize array to [0, 1]. NaN-safe. Avoids division by zero with 1e-9."""
    lo = np.nanmin(arr)
    hi = np.nanmax(arr)
    return (arr - lo) / (hi - lo + 1e-9)


def compute_composite(df: pd.DataFrame) -> np.ndarray:
    # Thermal domain (higher temp = higher risk)
    t = minmax(df["mean_afternoon_temp"].values)

    # Vegetation domain (high imperv = high risk, high tree_cov = low risk → both inverted)
    imperv = 1.0 - minmax(df["mean_imperv"].values)
    tree   = 1.0 - minmax(df["mean_tree_cov"].values)
    v = 0.5 * imperv + 0.5 * tree

    # Health domain (low life_expectancy = high risk → inverted)
    cvd  = minmax(df["mean_cvd_rate"].values)
    diab = minmax(df["mean_diabetes"].values)
    le   = 1.0 - minmax(df["mean_life_expectancy"].values)
    h = np.nanmean(np.stack([cvd, diab, le], axis=1), axis=1)

    # Social domain (all higher = higher vulnerability)
    svi   = minmax(df["mean_svi_overall"].values)
    pov   = minmax(df["mean_poverty2x"].values)
    dis   = minmax(df["mean_disability"].values)
    u18   = minmax(df["mean_under18"].values)
    hcost = minmax(df["mean_severe_cost"].values)
    s = np.nanmean(np.stack([svi, pov, dis, u18, hcost], axis=1), axis=1)

    return (
        WEIGHTS["thermal"]    * t +
        WEIGHTS["vegetation"] * v +
        WEIGHTS["health"]     * h +
        WEIGHTS["social"]     * s
    )


def main() -> None:
    if not DUCKDB_PATH.exists():
        log.error("DuckDB not found at %s — run scripts/build_duckdb.py first", DUCKDB_PATH)
        sys.exit(1)

    log.info("Connecting to %s (write mode)...", DUCKDB_PATH)
    conn = duckdb.connect(str(DUCKDB_PATH))  # NO read_only — we write

    log.info("Loading tract_features...")
    df = conn.execute("SELECT * FROM tract_features").fetchdf()
    log.info("  %d tracts loaded", len(df))

    scores = compute_composite(df)

    # Fill NaN scores (tracts with all-NULL feature columns) with the county median
    # so every tract gets a valid composite_risk instead of storing NULL/0.0.
    nan_count = int(np.isnan(scores).sum())
    if nan_count:
        county_median = float(np.nanmedian(scores))
        scores = np.where(np.isnan(scores), county_median, scores)
        log.info("  Filled %d NaN scores with county median %.4f", nan_count, county_median)

    scores = scores.round(4)
    log.info(
        "  composite_risk stats — min=%.4f max=%.4f mean=%.4f",
        np.nanmin(scores), np.nanmax(scores), np.nanmean(scores),
    )

    # Add column if missing (idempotent — try/except on older DuckDB compatibility)
    log.info("Adding composite_risk column to tract_outputs_with_preds (if not exists)...")
    try:
        conn.execute(
            "ALTER TABLE tract_outputs_with_preds ADD COLUMN composite_risk DOUBLE DEFAULT 0.0"
        )
        log.info("  Column added.")
    except Exception:
        log.info("  Column already exists — skipping ALTER TABLE.")

    # Batch UPDATE — safe because DuckDB is opened in write mode here (not read_only)
    log.info("Updating composite_risk for all %d tracts...", len(df))
    updates = list(zip(scores.tolist(), df["tract_id"].tolist()))
    conn.executemany(
        "UPDATE tract_outputs_with_preds SET composite_risk = ? WHERE tract_id = ?",
        updates,
    )

    # Verify
    result = conn.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN composite_risk IS NULL OR composite_risk = 0.0 THEN 1 ELSE 0 END) AS zeros,
            MIN(composite_risk) AS min_risk,
            MAX(composite_risk) AS max_risk
        FROM tract_outputs_with_preds
    """).fetchone()
    log.info(
        "  Verify — total=%d zeros=%d min=%.4f max=%.4f",
        result[0], result[1], result[2], result[3],
    )
    if result[1] > 10:
        log.warning("  WARNING: %d rows have 0.0 composite_risk — check tract_id join alignment", result[1])

    conn.close()
    log.info("Done. composite_risk column updated in tract_outputs_with_preds.")


if __name__ == "__main__":
    main()
