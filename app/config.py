# app/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    duckdb_path: Path = Path("king_county.duckdb")

    # ML model file paths
    xgb_heat_model_path: Path = Path("models/xgb_heat.json")
    xgb_risk_model_path: Path = Path("models/xgb_risk.json")
    tf_risk_model_path: Path = Path("models/tf_risk.keras")

    # Anthropic (required — no default; validated by pydantic-settings at startup)
    anthropic_api_key: str

    # CORS origins — allow all for internal v1 use
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
