"""
Train and save XGBoost + TensorFlow models from king_county.duckdb.

Outputs:
  models/xgb_heat.json   — XGBoost Booster predicting xgb_heat_score
  models/xgb_risk.json   — XGBoost Booster predicting xgb_risk_score
  models/tf_risk/        — TF SavedModel predicting tf_risk_score

Run:
  conda activate urban-heatmap
  cd <project root>
  python scripts/train_models.py
"""
import pathlib
import numpy as np
import duckdb
import xgboost as xgb
import tensorflow as tf

FEATURE_COLS = [
    "mean_afternoon_temp", "mean_morning_temp", "mean_evening_temp",
    "mean_tree_cov", "mean_imperv", "mean_dist_water",
    "mean_cvd_rate", "mean_diabetes", "mean_life_expectancy",
    "mean_svi_overall", "mean_poverty2x", "mean_disability",
    "mean_limited_english", "mean_under18", "mean_severe_cost",
]

def load_data():
    conn = duckdb.connect("king_county.duckdb", read_only=True)
    rows = conn.execute(f"""
        SELECT {', '.join('tf.' + c for c in FEATURE_COLS)},
               top.xgb_heat_score, top.xgb_risk_score, top.tf_risk_score
        FROM tract_features tf
        JOIN tract_outputs_with_preds top ON tf.tract_id = top.tract_id
    """).fetchall()
    conn.close()

    data = np.array(rows, dtype=float)
    # Replace NaN with column medians
    for col in range(data.shape[1]):
        nan_mask = np.isnan(data[:, col])
        if nan_mask.any():
            data[nan_mask, col] = np.nanmedian(data[:, col])

    X = data[:, :len(FEATURE_COLS)]
    y_heat = data[:, len(FEATURE_COLS)]
    y_risk = data[:, len(FEATURE_COLS) + 1]
    y_tf   = data[:, len(FEATURE_COLS) + 2]
    return X, y_heat, y_risk, y_tf


def train_xgb(X, y, label):
    dtrain = xgb.DMatrix(X, label=y)
    params = {
        "objective": "reg:squarederror",
        "max_depth": 4,
        "eta": 0.1,
        "subsample": 0.8,
        "seed": 42,
    }
    model = xgb.train(params, dtrain, num_boost_round=100, verbose_eval=False)
    preds = model.predict(dtrain)
    rmse = float(np.sqrt(np.mean((preds - y) ** 2)))
    print(f"  {label}: RMSE={rmse:.4f}  range=[{preds.min():.3f}, {preds.max():.3f}]")
    return model


def train_tf(X, y):
    # Normalise inputs
    mean, std = X.mean(axis=0), X.std(axis=0) + 1e-8
    X_norm = (X - mean) / std

    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(X.shape[1],)),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(16, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(optimizer="adam", loss="mse")
    model.fit(X_norm, y, epochs=50, batch_size=32, verbose=0)

    preds = model.predict(X_norm, verbose=0).flatten()
    rmse = float(np.sqrt(np.mean((preds - y) ** 2)))
    print(f"  tf_risk:  RMSE={rmse:.4f}  range=[{preds.min():.3f}, {preds.max():.3f}]")
    return model


def main():
    out = pathlib.Path("models")
    out.mkdir(exist_ok=True)

    print("Loading data from king_county.duckdb...")
    X, y_heat, y_risk, y_tf = load_data()
    print(f"  {X.shape[0]} tracts, {X.shape[1]} features")

    print("\nTraining XGBoost models...")
    xgb_heat = train_xgb(X, y_heat, "xgb_heat")
    xgb_risk = train_xgb(X, y_risk, "xgb_risk")

    print("\nTraining TensorFlow model...")
    tf_risk = train_tf(X, y_tf)

    print("\nSaving models...")
    xgb_heat.save_model(str(out / "xgb_heat.json"))
    print("  models/xgb_heat.json saved")
    xgb_risk.save_model(str(out / "xgb_risk.json"))
    print("  models/xgb_risk.json saved")
    tf_risk.save(str(out / "tf_risk.keras"))
    print("  models/tf_risk.keras saved")

    print("\nDone. Start the server with:")
    print("  conda activate urban-heatmap")
    print("  ANTHROPIC_API_KEY=<key> uvicorn app.main:app --reload")


if __name__ == "__main__":
    main()
