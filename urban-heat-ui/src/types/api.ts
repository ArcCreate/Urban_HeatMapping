import type { FeatureCollection } from 'geojson'

export interface TractProperties {
  tract_id: string
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
}

export interface TractDetail {
  tract_id: string
  mean_afternoon_temp: number | null
  mean_morning_temp: number | null
  mean_evening_temp: number | null
  mean_tree_cov: number | null
  mean_imperv: number | null
  mean_dist_water: number | null
  mean_cvd_rate: number | null
  mean_diabetes: number | null
  mean_life_expectancy: number | null
  mean_svi_overall: number | null
  mean_poverty2x: number | null
  mean_disability: number | null
  mean_limited_english: number | null
  mean_under18: number | null
  mean_severe_cost: number | null
  city_name: string | null
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
}

export interface RankedTract {
  tract_id: string
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
}

export interface CountySummary {
  tract_count: number
  mean_heat_score: number
  p75_heat_score: number
  high_risk_tract_count: number
}

export interface TractScore {
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
}

export interface ActiveScenario {
  tree_canopy_pct?: number
  albedo_delta?: number
  green_space_sqft?: number
}

export interface MapContext {
  selected_tract_ids: string[]
  current_scores: Record<string, TractScore>
  active_scenario?: ActiveScenario
}

export interface ChatRequest {
  message: string
  map_context: MapContext
}

export interface ChatResponse {
  reply: string
  usage: { input_tokens: number; output_tokens: number }
}

export interface WhatIfRequest {
  tract_id: string
  tree_canopy_pct?: number
  albedo_delta?: number
  green_space_sqft?: number
}

export interface SimulationResult {
  tract_id: string
  baseline_risk: number
  simulated_risk: number
  delta_risk: number
  delta_temp_f: number
}

export type TractsGeoJSON = FeatureCollection
