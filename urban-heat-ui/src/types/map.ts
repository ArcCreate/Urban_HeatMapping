export interface PopupInfo {
  longitude: number
  latitude: number
  tractId: string
  xgb_heat_score: number
  xgb_risk_score: number
  tf_risk_score: number
}

export interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
}
