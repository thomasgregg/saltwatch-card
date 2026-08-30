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

export interface SaltWatchCardConfig {
  type: string;
  entity: string;
  /** @deprecated Retained for configuration compatibility; no title is rendered. */
  name?: string;
  /** @deprecated Retained for configuration compatibility; no title is rendered. */
  show_header?: boolean;
  show_status?: boolean;
  show_low_marker?: boolean;
  display_mode?: SaltWatchDisplayMode;
  status_entity?: string;
  threshold_entity?: string;
  low_threshold?: number;
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
