export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
}

export interface HistoryState {
  s: string;
  lu?: number;
  lc?: number;
}

export type HistoryResponse = Record<string, HistoryState[]>;

export interface SaltWatchCardConfig {
  type: string;
  entity: string;
  name?: string;
  status_entity?: string;
  threshold_entity?: string;
  forecast_entity?: string;
  distance_entity?: string;
  low_threshold?: number;
  history_hours?: number;
  show_history?: boolean;
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
