export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistantInternationalization {
  language: string;
  locale: {
    language: string;
    number_format?: string;
    time_format?: string;
    date_format?: string;
    first_weekday?: string;
    time_zone?: string;
  };
}

export interface EntityRegistryDisplayEntry {
  entity_id: string;
  device_id?: string;
  platform?: string;
  name?: string;
  area_id?: string;
  hidden?: boolean;
}

export interface EntityRegistryEntry extends EntityRegistryDisplayEntry {
  id: string;
  original_name?: string;
  unique_id: string;
  disabled_by: "user" | "device" | "integration" | "config_entry" | null;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string;
  name_by_user?: string | null;
  area_id?: string | null;
  disabled_by?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities: Record<string, EntityRegistryDisplayEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  language?: string;
  locale?: HomeAssistantInternationalization["locale"];
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
  device_id: string;
  grid_options?: {
    columns?: number | "full";
    rows?: number | "auto";
  };
  show_status?: boolean;
  show_low_marker?: boolean;
  display_mode?: SaltWatchDisplayMode;
  metric_mode?: SaltWatchMetricMode;
  section_order?: SaltWatchSectionOrder;
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
}

declare global {
  interface Window {
    customCards?: CustomCardRegistration[];
  }
}
