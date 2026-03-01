# app/services/chat.py
from app.schemas.chat import MapContext

SYSTEM_PREAMBLE = """You are an urban heat analyst assistant for King County, Washington.
You help city planners understand heat risk data and intervention options.
Answer in plain language. Be concise and specific to the data provided.

Data context:
- Scores are in [0, 1] range; higher = higher heat/risk
- xgb_heat_score: XGBoost predicted heat intensity
- xgb_risk_score: XGBoost predicted health risk
- tf_risk_score: TensorFlow predicted health risk
- Interventions: tree_canopy_pct (%), albedo_delta (0-1), green_space_sqft"""


def build_system_prompt(ctx: MapContext) -> str:
    """
    Build system prompt from map context. Stays under ~2,000 tokens for any input size.
    Enumerates tracts when count <= 50; summarizes min/max/mean statistics when count > 50.
    """
    parts = [SYSTEM_PREAMBLE, "\n## Current Map Context"]

    n = len(ctx.selected_tract_ids)
    if n == 0:
        parts.append("No tracts selected. Answer based on general King County heat data.")
    elif n <= 50:
        parts.append(f"\nSelected tracts ({n}):")
        for tid in ctx.selected_tract_ids:
            scores = ctx.current_scores.get(tid)
            if scores:
                parts.append(
                    f"  {tid}: heat={scores.xgb_heat_score:.3f}, "
                    f"risk_xgb={scores.xgb_risk_score:.3f}, "
                    f"risk_tf={scores.tf_risk_score:.3f}"
                )
            else:
                parts.append(f"  {tid}: (scores not provided)")
    else:
        heat_vals = [s.xgb_heat_score for s in ctx.current_scores.values()]
        risk_vals = [s.xgb_risk_score for s in ctx.current_scores.values()]
        parts.append(
            f"\n{n} tracts selected (too many to enumerate). Summary statistics:\n"
            f"  heat_score: min={min(heat_vals):.3f}, max={max(heat_vals):.3f}, "
            f"mean={sum(heat_vals)/len(heat_vals):.3f}\n"
            f"  risk_score: min={min(risk_vals):.3f}, max={max(risk_vals):.3f}, "
            f"mean={sum(risk_vals)/len(risk_vals):.3f}"
        )

    if ctx.active_scenario:
        s = ctx.active_scenario
        scenario_parts = []
        if s.tree_canopy_pct is not None:
            scenario_parts.append(f"tree_canopy_pct={s.tree_canopy_pct}%")
        if s.albedo_delta is not None:
            scenario_parts.append(f"albedo_delta={s.albedo_delta}")
        if s.green_space_sqft is not None:
            scenario_parts.append(f"green_space_sqft={s.green_space_sqft}")
        if scenario_parts:
            parts.append(f"\nActive scenario: {', '.join(scenario_parts)}")

    return "\n".join(parts)
