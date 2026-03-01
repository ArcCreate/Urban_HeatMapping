# app/services/chat.py
from app.schemas.chat import MapContext, TractFullData

SYSTEM_PREAMBLE = """You are an urban heat risk analyst for King County, Washington.

RESPONSE FORMAT:
Plain text only — no markdown, no bold, no italic, no headers, no backticks.

Structure every response like this:
1. One sentence verdict: state the direct answer — which city is worse, which tract to prioritize, what the risk is. No hedging, no preamble.
2. Concise numbered reasons (3-5 max) explaining how you reached that conclusion. Each reason is one line with the key numbers inline. No filler words.

Example shape (do not copy the text, just the format):
Auburn is the higher-risk city for heat intervention.
1. Heat score 7.2 vs Renton 5.1 — 41% hotter on average across all tracts.
2. Tree canopy 11% vs 19% — less shade means faster surface heat buildup.
3. SVI 0.64 vs 0.48 — residents are significantly more vulnerable to heat illness.
4. Life expectancy 76.2 vs 79.1 yrs — existing health gap compounds heat risk.

INFORMATION SOURCES:
1. DATABASE (PRIMARY): Use the city-level averages and tract tables below as the authoritative source. Always cite specific numbers.
2. GENERAL KNOWLEDGE (SECONDARY): Supplement with urban heat science, King County planning context, or Pacific Northwest regional knowledge when the data alone cannot fully answer. Prefix these with "Regional research suggests..." or "King County's Climate Action Plan...".

CITY COMPARISONS — CRITICAL:
When asked to compare two cities (e.g. "Auburn vs Renton"), use the CITY-LEVEL AVERAGES table directly. Do not ask the user to select tracts from each city. The city averages aggregate all tracts within each city's limits and are sufficient for a full comparison. Compare all available metrics: heat score, risk score, tree canopy, imperviousness, life expectancy, SVI, poverty rate. State which city is worse and why, with all numbers inline.

TRACT VS CITY:
When asked how a selected tract compares to its city, use the city averages and the full tract list for that city. Show where the tract ranks and how far it deviates from the city mean.

FUTURE QUESTIONS:
Use the 2025-2050 projection data provided. Cite the trajectory and combine with knowledge of King County's Heat Action Plan and Seattle Climate Action Plan for actionable guidance.

NO TRACT SELECTED:
Only ask the user to select a tract if the question is about a specific tract and no tract is selected. For city-vs-city or county-level questions, answer directly from the city averages data.

DATA DEFINITIONS:
• Heat score (0-10): higher = more dangerous heat buildup
• Risk score (0-10): composite health risk from ML models
• Canopy %: tree cover — lower is worse for heat
• Imperv %: hard surfaces — higher means more heat retention
• SVI (0-1): Social Vulnerability Index — higher = more vulnerable residents
• Poverty rate: residents below twice federal poverty line
• Life expectancy: average years for tract residents
• Projected risk (2025-2050): modeled future heat risk under current climate trends"""


def _v(val: float | None, decimals: int = 1, suffix: str = "") -> str:
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
        f"TRACT: {label}",
        f"Risk level: {_risk_label(risk)} — {risk * 10:.1f}/10",
        f"Heat intensity: {_risk_label(heat)} — {heat * 10:.1f}/10",
        f"Afternoon surface temp: {_v(td.mean_afternoon_temp, 1, chr(176) + 'F')}",
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


def _format_projections(tract_id: str, projections: list[dict]) -> str:
    if not projections:
        return ""
    lines = [f"Future risk projections for tract {tract_id} (2025-2050):"]
    for p in projections:
        lines.append(f"  {p['year']}: {p['projected_risk'] * 10:.1f}/10")
    return "\n".join(lines)


def _format_city_tracts(city_name: str, tracts: list[dict]) -> str:
    """Compact table of all tracts in a city — lets Claude reference any peer tract."""
    if not tracts:
        return ""
    lines = [
        f"ALL TRACTS IN {city_name.upper()} ({len(tracts)} tracts, sorted high-to-low risk):",
        "  tract_id         | heat  | risk  | canopy% | imperv% | life_exp | svi  | poverty%",
        "  " + "-" * 84,
    ]
    for t in tracts:
        risk = (t["xgb_risk_score"] + t["tf_risk_score"]) / 2
        lines.append(
            f"  {t['tract_id']:<16} | "
            f"{t['xgb_heat_score'] * 10:4.1f} | "
            f"{risk * 10:4.1f} | "
            f"{_v(t['mean_tree_cov'], 1):>7} | "
            f"{_v(t['mean_imperv'], 1):>7} | "
            f"{_v(t['mean_life_expectancy'], 1):>8} | "
            f"{_v(t['mean_svi_overall'], 2):>4} | "
            f"{_v(t['mean_poverty2x'], 1)}"
        )
    return "\n".join(lines)


def _format_city_summaries(city_summaries: list[dict]) -> str:
    """Per-city averages for all King County cities — enables cross-city comparison."""
    if not city_summaries:
        return ""
    lines = [
        "CITY-LEVEL AVERAGES (all King County cities, sorted high-to-low heat):",
        "  city                 | tracts | heat  | risk  | canopy% | imperv% | life_exp | svi",
        "  " + "-" * 90,
    ]
    for c in city_summaries:
        lines.append(
            f"  {c['city_name']:<20} | "
            f"{c['tract_count']:>6} | "
            f"{c['mean_heat'] * 10:4.1f} | "
            f"{c['mean_risk'] * 10:4.1f} | "
            f"{_v(c['mean_tree_cov'], 1):>7} | "
            f"{_v(c['mean_imperv'], 1):>7} | "
            f"{_v(c['mean_life_exp'], 1):>8} | "
            f"{_v(c['mean_svi'], 2)}"
        )
    return "\n".join(lines)


def build_system_prompt(
    ctx: MapContext,
    county_stats: dict | None = None,
    city_summaries: list[dict] | None = None,
    city_tracts: dict[str, list] | None = None,
    tract_projections: dict[str, list] | None = None,
) -> str:
    parts = [SYSTEM_PREAMBLE]

    # County-wide baseline
    if county_stats:
        cs = county_stats
        high = cs.get("high_risk_tract_count", "?")
        total = cs.get("tract_count", "?")
        parts.append(
            "\nCOUNTY-WIDE BASELINE (all King County tracts):\n"
            f"Total tracts: {total}\n"
            f"County mean heat score: {cs.get('mean_heat_score', 0) * 10:.1f}/10\n"
            f"75th percentile heat score: {cs.get('p75_heat_score', 0) * 10:.1f}/10 "
            f"(tracts above this threshold are high-concern)\n"
            f"High-risk tracts (heat score > 7.5): {high} of {total}"
        )

    # Per-city averages — enables cross-city comparison
    if city_summaries:
        parts.append("\n" + _format_city_summaries(city_summaries))

    # All tracts in the selected city — enables intra-city comparison
    if city_tracts:
        for city_name, tracts in city_tracts.items():
            parts.append("\n" + _format_city_tracts(city_name, tracts))

    parts.append("\nSELECTED ZONE (full detail):\n")

    if ctx.tract_data:
        for td in ctx.tract_data:
            parts.append(_format_tract(td))
    elif ctx.selected_tract_ids:
        parts.append(
            f"Tracts selected: {', '.join(ctx.selected_tract_ids)}\n"
            "Full environmental data is still loading. Ask the user to try again in a moment."
        )
    else:
        parts.append(
            "No tract selected yet.\n"
            "Ask the user to click any tract on the map to load its data, then ask their question."
        )

    # Future projections
    if tract_projections:
        projection_lines = []
        for tract_id, proj_list in tract_projections.items():
            formatted = _format_projections(tract_id, proj_list)
            if formatted:
                projection_lines.append(formatted)
        if projection_lines:
            parts.append("\nFUTURE PROJECTIONS (2025-2050):\n" + "\n\n".join(projection_lines))

    # Active simulation scenario
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
