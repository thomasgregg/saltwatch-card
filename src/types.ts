export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
}

export type SaltWatchDisplayMode = "both" | "tank" | "details";
export type SaltWatchMetricMode = "level" | "forecast" | "both";
export type SaltWatchSectionOrder = "tank-first" | "details-first";

export interface LovelaceActionConfig {
  action: string;
  [key: string]: unknown;
}

export interface SaltWatchCardConfig {
  type: string;
  entity: string;
  show_status?: boolean;
  show_low_marker?: boolean;
  display_mode?: SaltWatchDisplayMode;
  metric_mode?: SaltWatchMetricMode;
  section_order?: SaltWatchSectionOrder;
  status_entity?: string;
  threshold_entity?: string;
  forecast_entity?: string;
  forecast_status_entity?: string;
  low_threshold?: number;
  tap_action?: LovelaceActionConfig;
  hold_action?: LovelaceActionConfig;
  double_tap_action?: LovelaceActionConfig;
}

export interface CustomCardRegistration {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
  getEntitySuggestion?: (
    hass: HomeAssistant,
    entityId: string,
  ) => { config: SaltWatchCardConfig } | null;
}

declare global {
  interface Window {
    customCards?: CustomCardRegistration[];
  }
}
