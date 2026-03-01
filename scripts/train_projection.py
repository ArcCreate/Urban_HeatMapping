#!/usr/bin/env python3
"""
Train TensorFlow projection model for King County heat risk 2025-2050.

PREREQUISITE: Run scripts/score_composite.py first to populate composite_risk.

USAGE (from project root, conda env urban-heatmap):
    python scripts/train_projection.py

OUTPUTS:
    models/tf_projection.keras       -- Saved TF regression model
    models/tf_projection_norm.npy    -- Normalization stats (mean, std) for inference

WARMING SCENARIO:
    King County official projection: +5.5F by 2050s from 2025 baseline.
    WARMING_RATE_F_PER_YEAR = 5.5 / 25 ~= 0.22F/year (linear interpolation, SSP2 "middle road").
    Morning temp warms at 0.7x afternoon rate; evening at 0.85x afternoon rate.
    Non-thermal features (tree cover, SVI, etc.) held constant -- no model for their change.

TRAINING DATA:
    492 tracts x 26 years (2025-2050) = 12,792 rows.
    Target y = composite_risk recomputed per tract-year after applying warming delta.
    Feature vector = 15 original features + year_norm (16 total inputs).
"""
import logging
import pathlib
import sys

import duckdb
import numpy as np
import pandas as pd
import tensorflow as tf

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PROJECT_ROOT = pathlib.Path(__file__).parent.parent
DUCKDB_PATH  = PROJECT_ROOT / "king_county.duckdb"
MODELS_DIR   = PROJECT_ROOT / "models"

# King County official projection: +5.5F by 2050s
# Linear interpolation from 2025 baseline -> 0.22F/year
WARMING_RATE_F_PER_YEAR = 5.5 / 25.0  # ~= 0.22F/year

# 15 base feature columns (same order as FEATURE_COLS in train_models.py)
PROJECTION_FEATURE_COLS = [
    "mean_afternoon_temp", "mean_morning_temp", "mean_evening_temp",
    "mean_tree_cov", "mean_imperv", "mean_dist_water",
    "mean_cvd_rate", "mean_diabetes", "mean_life_expectancy",
    "mean_svi_overall", "mean_poverty2x", "mean_disability",
    "mean_limited_english", "mean_under18", "mean_severe_cost",
]
# year_norm is appended as the 16th feature at training time

# Composite formula weights (must match score_composite.py WEIGHTS)
COMPOSITE_WEIGHTS = {"thermal": 0.30, "vegetation": 0.25, "health": 0.25, "social": 0.20}


def minmax_with_bounds(arr: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Min-max normalize using provided bounds (from training distribution)."""
    return (arr - lo) / (hi - lo + 1e-9)


def compute_composite_for_rows(df: pd.DataFrame, bounds: dict) -> np.ndarray:
    """Recompute composite_risk for generated rows using training-time bounds."""
    t = minmax_with_bounds(df["mean_afternoon_temp"].values, *bounds["mean_afternoon_temp"])
    imperv = 1.0 - minmax_with_bounds(df["mean_imperv"].values, *bounds["mean_imperv"])
    tree   = 1.0 - minmax_with_bounds(df["mean_tree_cov"].values, *bounds["mean_tree_cov"])
    v = 0.5 * imperv + 0.5 * tree
    cvd  = minmax_with_bounds(df["mean_cvd_rate"].values, *bounds["mean_cvd_rate"])
    diab = minmax_with_bounds(df["mean_diabetes"].values, *bounds["mean_diabetes"])
    le   = 1.0 - minmax_with_bounds(df["mean_life_expectancy"].values, *bounds["mean_life_expectancy"])
    h = np.nanmean(np.stack([cvd, diab, le], axis=1), axis=1)
    svi   = minmax_with_bounds(df["mean_svi_overall"].values, *bounds["mean_svi_overall"])
    pov   = minmax_with_bounds(df["mean_poverty2x"].values, *bounds["mean_poverty2x"])
    dis   = minmax_with_bounds(df["mean_disability"].values, *bounds["mean_disability"])
    u18   = minmax_with_bounds(df["mean_under18"].values, *bounds["mean_under18"])
    hcost = minmax_with_bounds(df["mean_severe_cost"].values, *bounds["mean_severe_cost"])
    s = np.nanmean(np.stack([svi, pov, dis, u18, hcost], axis=1), axis=1)
    return (
        COMPOSITE_WEIGHTS["thermal"]    * t +
        COMPOSITE_WEIGHTS["vegetation"] * v +
        COMPOSITE_WEIGHTS["health"]     * h +
        COMPOSITE_WEIGHTS["social"]     * s
    )


def apply_warming(df_base: pd.DataFrame, year: int) -> pd.DataFrame:
    """Apply linear warming delta to thermal columns for a given year."""
    delta = WARMING_RATE_F_PER_YEAR * (year - 2025)
    df_year = df_base.copy()
    df_year["mean_afternoon_temp"] = df_year["mean_afternoon_temp"] + delta
    df_year["mean_morning_temp"]   = df_year["mean_morning_temp"]   + delta * 0.70
    df_year["mean_evening_temp"]   = df_year["mean_evening_temp"]   + delta * 0.85
    df_year["year_norm"] = (year - 2025) / 25.0  # [0, 1]
    return df_year


def main() -> None:
    if not DUCKDB_PATH.exists():
        log.error("DuckDB not found at %s -- run build_duckdb.py first", DUCKDB_PATH)
        sys.exit(1)

    MODELS_DIR.mkdir(exist_ok=True)

    log.info("Loading tract_features from %s...", DUCKDB_PATH)
    conn = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    df_base = conn.execute(
        f"SELECT {', '.join(PROJECTION_FEATURE_COLS)}, tract_id FROM tract_features"
    ).fetchdf()
    conn.close()
    log.info("  %d tracts loaded", len(df_base))

    # NaN imputation -- same pattern as train_models.py
    for col in PROJECTION_FEATURE_COLS:
        mask = df_base[col].isna()
        if mask.any():
            df_base.loc[mask, col] = df_base[col].median()
            log.info("  Imputed %d NaN values in %s with median", mask.sum(), col)

    # Compute per-column bounds from the BASE (2025) data for consistent normalization
    bounds = {
        col: (df_base[col].min(), df_base[col].max())
        for col in ["mean_afternoon_temp", "mean_morning_temp", "mean_evening_temp",
                    "mean_tree_cov", "mean_imperv", "mean_cvd_rate", "mean_diabetes",
                    "mean_life_expectancy", "mean_svi_overall", "mean_poverty2x",
                    "mean_disability", "mean_under18", "mean_severe_cost"]
    }

    # Generate synthetic training dataset: 492 tracts x 26 years
    log.info("Generating synthetic training data (492 tracts x 26 years)...")
    all_X, all_y = [], []
    for year in range(2025, 2051):
        df_year = apply_warming(df_base, year)
        # Features: 15 base columns + year_norm
        X_year = df_year[PROJECTION_FEATURE_COLS + ["year_norm"]].values
        # Target: recomputed composite_risk under warming scenario
        y_year = compute_composite_for_rows(df_year, bounds)
        all_X.append(X_year)
        all_y.append(y_year)

    X = np.vstack(all_X).astype(float)   # (12792, 16)
    y = np.concatenate(all_y).astype(float)  # (12792,)
    log.info("  Training set: X=%s y=%s", X.shape, y.shape)
    log.info("  y stats -- min=%.4f max=%.4f mean=%.4f", y.min(), y.max(), y.mean())

    # NaN imputation on generated X (should be none, but defensive)
    for col_idx in range(X.shape[1]):
        nan_mask = np.isnan(X[:, col_idx])
        if nan_mask.any():
            X[nan_mask, col_idx] = np.nanmedian(X[:, col_idx])

    # Normalize -- save stats for inference time
    X_mean = X.mean(axis=0)
    X_std  = X.std(axis=0) + 1e-8
    X_norm = (X - X_mean) / X_std

    log.info("Training TF projection model (100 epochs)...")
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(16,)),       # 15 features + year_norm
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1,  activation="sigmoid"),  # output in [0, 1]
    ])
    model.compile(optimizer="adam", loss="mse")
    model.fit(X_norm, y, epochs=100, batch_size=64, verbose=0)

    preds = model.predict(X_norm, verbose=0).flatten()
    rmse = float(np.sqrt(np.mean((preds - y) ** 2)))
    log.info("  Training RMSE=%.4f  pred range=[%.3f, %.3f]", rmse, preds.min(), preds.max())

    model_path = MODELS_DIR / "tf_projection.keras"
    model.save(str(model_path))
    log.info("  Model saved to %s", model_path)

    norm_path = MODELS_DIR / "tf_projection_norm.npy"
    np.save(str(norm_path), {"mean": X_mean, "std": X_std})
    log.info("  Normalization stats saved to %s", norm_path)
    log.info("Done. Run scripts/build_projections.py next to precompute all tract-year scores.")


if __name__ == "__main__":
    main()
