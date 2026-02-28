# app/models/loader.py
import logging
import time
from dataclasses import dataclass

# Import TensorFlow before XGBoost — prevents macOS arm64 OpenMP conflict
# (TF's bundled runtime must win; XGBoost links system OpenMP)
import tensorflow as tf
import xgboost as xgb

logger = logging.getLogger(__name__)


@dataclass
class LoadedModels:
    xgb_heat: xgb.Booster
    xgb_risk: xgb.Booster
    tf_risk: tf.keras.Model


def load_models(settings) -> LoadedModels:
    """
    Synchronous model loader — MUST be called via asyncio.to_thread() in the
    lifespan context manager. Never call directly from async code.

    Args:
        settings: app.config.Settings instance with model path attributes.
    Returns:
        LoadedModels dataclass with all three models loaded into memory.
    Raises:
        FileNotFoundError: If any model file/directory does not exist.
        RuntimeError: If any model fails to load.
    """
    t0 = time.perf_counter()
    logger.info("Loading XGBoost heat model from %s", settings.xgb_heat_model_path)
    xgb_heat = xgb.Booster()
    xgb_heat.load_model(str(settings.xgb_heat_model_path))

    logger.info("Loading XGBoost risk model from %s", settings.xgb_risk_model_path)
    xgb_risk = xgb.Booster()
    xgb_risk.load_model(str(settings.xgb_risk_model_path))

    logger.info("Loading TensorFlow risk model from %s", settings.tf_risk_model_path)
    tf_risk = tf.keras.models.load_model(str(settings.tf_risk_model_path))

    elapsed = time.perf_counter() - t0
    logger.info("All models loaded in %.2fs", elapsed)

    return LoadedModels(xgb_heat=xgb_heat, xgb_risk=xgb_risk, tf_risk=tf_risk)
