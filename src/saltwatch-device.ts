import type {
  EntityRegistryEntry,
  HomeAssistant,
  SaltWatchCardConfig,
  SaltWatchDataSource,
} from "./types";

export type SaltWatchRole =
  | "level"
  | "status"
  | "threshold"
  | "forecast"
  | "forecastStatus"
  | "forecastDetails";

export type SaltWatchEntities = Record<SaltWatchRole, string>;

export interface SaltWatchEntityMap {
  level: string;
  status?: string;
  threshold?: string;
  forecast?: string;
  forecastStatus?: string;
  forecastDetails?: string;
}

interface RoleDefinition {
  domain: "sensor" | "number";
  originalName: string;
}

export const SALTWATCH_ROLES: Record<SaltWatchRole, RoleDefinition> = {
  level: { domain: "sensor", originalName: "Salt Level" },
  status: { domain: "sensor", originalName: "Salt Status" },
  threshold: { domain: "number", originalName: "Low Salt Threshold" },
  forecast: { domain: "sensor", originalName: "Estimated Days Until Low Salt" },
  forecastStatus: { domain: "sensor", originalName: "Forecast Status" },
  forecastDetails: { domain: "sensor", originalName: "Forecast Details" },
};

export interface SaltWatchResolution {
  deviceId: string;
  entities?: SaltWatchEntities;
  missing: SaltWatchRole[];
  duplicates: SaltWatchRole[];
  disabled: SaltWatchRole[];
}

function configuredEntityId(value: string | undefined): string | undefined {
  const entityId = value?.trim();
  return entityId || undefined;
}

export function saltWatchDataSource(config: SaltWatchCardConfig): SaltWatchDataSource {
  if (config.source === "device" || config.source === "entities") return config.source;
  return configuredEntityId(config.level_entity) ? "entities" : "device";
}

export function configuredSaltWatchEntities(
  config: SaltWatchCardConfig,
): SaltWatchEntityMap | undefined {
  const level = configuredEntityId(config.level_entity);
  if (!level) return undefined;
  return {
    level,
    threshold: configuredEntityId(config.threshold_entity),
    status: configuredEntityId(config.status_entity),
    forecast: configuredEntityId(config.forecast_entity),
    forecastStatus: configuredEntityId(config.forecast_status_entity),
    forecastDetails: configuredEntityId(config.forecast_details_entity),
  };
}

export function saltWatchConfigResolutionKey(config: SaltWatchCardConfig): string {
  const source = saltWatchDataSource(config);
  if (source === "device") return `device|${config.device_id?.trim() ?? ""}`;
  const entities = configuredSaltWatchEntities(config);
  return [
    "entities",
    entities?.level,
    entities?.threshold,
    entities?.status,
    entities?.forecast,
    entities?.forecastStatus,
    entities?.forecastDetails,
  ].map((value) => value ?? "").join("|");
}

export function saltWatchDeviceEntityIds(hass: HomeAssistant, deviceId: string): string[] {
  return Object.values(hass.entities)
    .filter((entry) => entry.device_id === deviceId && entry.platform === "esphome")
    .map((entry) => entry.entity_id)
    .sort();
}

export async function resolveSaltWatchDevice(
  hass: HomeAssistant,
  deviceId: string,
): Promise<SaltWatchResolution> {
  const entityIds = saltWatchDeviceEntityIds(hass, deviceId);
  if (entityIds.length === 0) {
    return { deviceId, missing: Object.keys(SALTWATCH_ROLES) as SaltWatchRole[], duplicates: [], disabled: [] };
  }

  const entriesById = await hass.callWS<Record<string, EntityRegistryEntry>>({
    type: "config/entity_registry/get_entries",
    entity_ids: entityIds,
  });
  return resolveSaltWatchEntries(deviceId, Object.values(entriesById));
}

export function resolveSaltWatchEntries(
  deviceId: string,
  registryEntries: EntityRegistryEntry[],
): SaltWatchResolution {
  const entries = registryEntries.filter(
    (entry) => entry.device_id === deviceId && entry.platform === "esphome",
  );
  const entities = {} as Partial<SaltWatchEntities>;
  const missing: SaltWatchRole[] = [];
  const duplicates: SaltWatchRole[] = [];
  const disabled: SaltWatchRole[] = [];

  for (const [role, definition] of Object.entries(SALTWATCH_ROLES) as Array<[
    SaltWatchRole,
    RoleDefinition,
  ]>) {
    const matches = entries.filter((entry) =>
      entry.entity_id.startsWith(`${definition.domain}.`) &&
      entry.original_name === definition.originalName
    );
    if (matches.length === 0) {
      missing.push(role);
      continue;
    }
    if (matches.length > 1) {
      duplicates.push(role);
      continue;
    }
    const match = matches[0]!;
    entities[role] = match.entity_id;
    if (match.disabled_by !== null) disabled.push(role);
  }

  return {
    deviceId,
    entities: missing.length === 0 && duplicates.length === 0
      ? entities as SaltWatchEntities
      : undefined,
    missing,
    duplicates,
    disabled,
  };
}

export function saltWatchRoleLabel(role: SaltWatchRole): string {
  return SALTWATCH_ROLES[role].originalName;
}
