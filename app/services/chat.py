# app/services/chat.py
from app.schemas.chat import MapContext, TractFullData

SYSTEM_PREAMBLE = """You are an urban heat risk analyst for King County, Washington.

CRITICAL RULES:
1. Use ONLY the dataset provided below. Never use external data, internet searches, or invented values.
2. If a value is missing from the dataset, say "not available in dataset" — do not estimate.
3. Keep responses concise: 2-4 sentences or a short bullet list. Max 130 words.
4. Write for city planners and contractors — plain English, no raw score names.
5. Use plain-text formatting only: bullet points with •, no markdown bold/italic syntax.

DATA DEFINITIONS:
• Heat intensity (0-10): higher = more dangerous heat buildup in this tract
• Risk score (0-10): composite health risk score from ML models
• Tree canopy %: fraction of tract with tree cover — lower is worse for heat
• Imperviousness %: hard surfaces (roads, rooftops) — higher means more heat retention
• SVI percentile (0-1): Social Vulnerability Index — higher means more vulnerable residents
• Poverty rate: residents below twice the federal poverty line
• Life expectancy: average years for tract residents
• Distance to water: proximity to nearest water body"""


def _v(val: float | None, decimals: int = 1, suffix: str = "") -> str:
    """Format a nullable float value for the system prompt."""
    if val is None:
        return "not in dataset"
    return f"{round(val, decimals)}{suffix}"


def _dist(val: float | None) -> str:
    if val is None:
        return "not in dataset"
    return f"{int(val)}m" if val < 1000 else f"{val / 1000:.1f}km"


def _risk_label(score: float) -> str:
    if score >= 0.75:
        return "extreme"
    if score >= 0.5:
        return "high"
    if score >= 0.25:
        return "moderate"
    return "low"


def _format_tract(td: TractFullData) -> str:
    risk = (td.xgb_risk_score + td.tf_risk_score) / 2
    heat = td.xgb_heat_score
    label = f"Tract {td.tract_id}"
    if td.city_name:
        label += f" ({td.city_name})"
    lines = [
        f"### {label}",
        f"Risk level: {_risk_label(risk)} — {risk * 10:.1f}/10",
        f"Heat intensity: {_risk_label(heat)} — {heat * 10:.1f}/10",
        f"Afternoon surface temp: {_v(td.mean_afternoon_temp, 1, '°F')}",
        f"Tree canopy: {_v(td.mean_tree_cov, 1, '%')}",
        f"Impervious surface: {_v(td.mean_imperv, 1, '%')}",
        f"Distance to water: {_dist(td.mean_dist_water)}",
        f"Life expectancy: {_v(td.mean_life_expectancy, 1, ' yrs')}",
        f"Social Vulnerability Index: {_v(td.mean_svi_overall, 2)} ({int(td.mean_svi_overall * 100) if td.mean_svi_overall is not None else 'unknown'}th percentile)",
        f"Poverty rate (2x FPL): {_v(td.mean_poverty2x, 1, '%')}",
        f"Disability rate: {_v(td.mean_disability, 1, '%')}",
        f"CVD rate: {_v(td.mean_cvd_rate, 1)}",
        f"Diabetes rate: {_v(td.mean_diabetes, 1, '%')}",
    ]
    return "\n".join(lines)


def build_system_prompt(ctx: MapContext) -> str:
    parts = [SYSTEM_PREAMBLE, "\n## DATASET FOR THIS SESSION\n"]

    if ctx.tract_data:
        for td in ctx.tract_data:
            parts.append(_format_tract(td))
    elif ctx.selected_tract_ids:
        parts.append(
            f"Tracts selected: {', '.join(ctx.selected_tract_ids)}\n"
            "Full environmental data is still loading. Tell the user to ask again in a moment."
        )
    else:
        parts.append(
            "No tract selected yet.\n"
            "Tell the user to click any tract on the map to load its data, then ask their question. "
            "Do NOT answer with invented or external data about King County."
        )

    if ctx.active_scenario:
        s = ctx.active_scenario
        scenario_parts = []
        if s.tree_canopy_pct is not None:
            scenario_parts.append(f"tree canopy +{s.tree_canopy_pct}%")
        if s.albedo_delta is not None:
            scenario_parts.append(f"albedo delta {s.albedo_delta}")
        if s.green_space_sqft is not None:
            scenario_parts.append(f"green space +{s.green_space_sqft} sqft")
        if scenario_parts:
            parts.append(f"\nActive simulation scenario: {', '.join(scenario_parts)}")

    return "\n".join(parts)
