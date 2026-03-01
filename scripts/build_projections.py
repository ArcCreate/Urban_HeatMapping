#!/usr/bin/env python3
"""
Precompute projected heat risk scores for all 492 King County tracts x 26 years (2025-2050).

PREREQUISITE: Run scripts/train_projection.py first to generate:
  - models/tf_projection.keras
  - models/tf_projection_norm.npy

USAGE (from project root, conda env urban-heatmap):
    python scripts/build_projections.py

OUTPUT:
    Creates/replaces `tract_projections` table in king_county.duckdb:
        tract_id       VARCHAR NOT NULL
        year           INTEGER NOT NULL
        projected_risk DOUBLE  NOT NULL
    12,792 rows total (492 tracts x 26 years).
    Indexes: idx_proj_year (year), idx_proj_tract (tract_id) for fast API queries.

NOTE: projected_risk values are in [0, 1] -- model uses sigmoid output activation.
"""
import logging
import pathlib
import sys

import duckdb
import numpy as np
import tensorflow as tf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PROJECT_ROOT = pathlib.Path(__file__).parent.parent
DUCKDB_PATH  = PROJECT_ROOT / "king_county.duckdb"
MODELS_DIR   = PROJECT_ROOT / "models"
MODEL_PATH   = MODELS_DIR / "tf_projection.keras"
NORM_PATH    = MODELS_DIR / "tf_projection_norm.npy"

WARMING_RATE_F_PER_YEAR = 5.5 / 25.0  # Must match train_projection.py

PROJECTION_FEATURE_COLS = [
    "mean_afternoon_temp", "mean_morning_temp", "mean_evening_temp",
    "mean_tree_cov", "mean_imperv", "mean_dist_water",
    "mean_cvd_rate", "mean_diabetes", "mean_life_expectancy",
    "mean_svi_overall", "mean_poverty2x", "mean_disability",
    "mean_limited_english", "mean_under18", "mean_severe_cost",
]


def apply_warming(base_features: np.ndarray, tract_ids: list, year: int) -> np.ndarray:
    """Apply warming delta and append year_norm. Returns (N, 16) array."""
    import pandas as pd
    df = pd.DataFrame(base_features, columns=PROJECTION_FEATURE_COLS)
    delta = WARMING_RATE_F_PER_YEAR * (year - 2025)
    df["mean_afternoon_temp"] = df["mean_afternoon_temp"] + delta
    df["mean_morning_temp"]   = df["mean_morning_temp"]   + delta * 0.70
    df["mean_evening_temp"]   = df["mean_evening_temp"]   + delta * 0.85
    df["year_norm"] = (year - 2025) / 25.0
    return df[PROJECTION_FEATURE_COLS + ["year_norm"]].values


def main() -> None:
    for path, name in [(DUCKDB_PATH, "DuckDB"), (MODEL_PATH, "TF model"), (NORM_PATH, "norm stats")]:
        if not path.exists():
            log.error("%s not found at %s -- run prerequisite scripts first", name, path)
            sys.exit(1)

    log.info("Loading TF model from %s...", MODEL_PATH)
    model = tf.keras.models.load_model(str(MODEL_PATH))

    log.info("Loading normalization stats from %s...", NORM_PATH)
    norm = np.load(str(NORM_PATH), allow_pickle=True).item()
    X_mean = norm["mean"]
    X_std  = norm["std"]

    log.info("Loading base tract features from DuckDB...")
    # Read in write mode (we'll CREATE TABLE below)
    conn = duckdb.connect(str(DUCKDB_PATH))
    df_raw = conn.execute(
        f"SELECT {', '.join(PROJECTION_FEATURE_COLS)}, tract_id FROM tract_features"
    ).fetchdf()
    tract_ids = df_raw["tract_id"].tolist()
    log.info("  %d tracts loaded", len(tract_ids))

    # NaN imputation on base features
    base_features = df_raw[PROJECTION_FEATURE_COLS].values.astype(float)
    for col_idx in range(base_features.shape[1]):
        nan_mask = np.isnan(base_features[:, col_idx])
        if nan_mask.any():
            base_features[nan_mask, col_idx] = np.nanmedian(base_features[:, col_idx])

    # Create / replace tract_projections table
    log.info("Creating tract_projections table...")
    conn.execute("""
        CREATE OR REPLACE TABLE tract_projections (
            tract_id       VARCHAR NOT NULL,
            year           INTEGER NOT NULL,
            projected_risk DOUBLE  NOT NULL
        )
    """)

    # Inference: 26 years x 492 tracts
    log.info("Running inference for 26 years (2025-2050)...")
    all_rows = []
    for year in range(2025, 2051):
        X_year = apply_warming(base_features, tract_ids, year)
        # Apply same normalization as training -- CRITICAL: use saved mean/std, not recomputed
        X_norm = (X_year - X_mean) / X_std
        preds = model.predict(X_norm, verbose=0).flatten()
        for tract_id, risk in zip(tract_ids, preds):
            all_rows.append((tract_id, year, round(float(risk), 4)))

    log.info("  Inserting %d rows into tract_projections...", len(all_rows))
    conn.executemany(
        "INSERT INTO tract_projections VALUES (?, ?, ?)",
        all_rows,
    )

    # Build indexes for fast API queries
    log.info("Creating indexes...")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_proj_year  ON tract_projections(year)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_proj_tract ON tract_projections(tract_id)")

    # Verify
    result = conn.execute("""
        SELECT
            COUNT(*) AS total_rows,
            COUNT(DISTINCT year) AS years,
            COUNT(DISTINCT tract_id) AS tracts,
            MIN(projected_risk) AS min_risk,
            MAX(projected_risk) AS max_risk
        FROM tract_projections
    """).fetchone()
    log.info(
        "  tract_projections -- rows=%d years=%d tracts=%d risk=[%.4f, %.4f]",
        result[0], result[1], result[2], result[3], result[4],
    )
    assert result[0] == 12792, f"Expected 12792 rows, got {result[0]}"
    assert result[1] == 26, f"Expected 26 years, got {result[1]}"
    assert result[2] == len(tract_ids), f"Expected {len(tract_ids)} tracts, got {result[2]}"

    conn.close()
    log.info("Done. tract_projections table ready. Start/restart the API to serve projections.")


if __name__ == "__main__":
    main()
