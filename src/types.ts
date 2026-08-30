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

export interface SaltWatchCardConfig {
  type: string;
  entity: string;
  name?: string;
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
