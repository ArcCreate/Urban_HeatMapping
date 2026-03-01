export interface PopupInfo {
  longitude: number
  latitude: number
  tractId: string
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
  display_risk: number
  composite_risk?: number      // ADD — the formula-based baseline risk
  projectionYear?: number      // ADD — set to the active projection year (null/undefined = baseline 2025)
}

export interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
}
