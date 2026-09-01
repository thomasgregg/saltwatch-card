import "../src/index";
import type {
  EntityRegistryEntry,
  HomeAssistant,
  HomeAssistantInternationalization,
  SaltWatchCardConfig,
} from "../src/types";
import type { SaltWatchCard } from "../src/saltwatch-card";

const iso = () => new Date().toISOString();
const DEVICE_ID = "saltwatch-demo-device";
const LEVEL_ENTITY_ID = "sensor.saltwatch_salt_level";
const entity = (entityId: string, state: string, unit = "") => ({
  entity_id: entityId,
  state,
  attributes: unit ? { unit_of_measurement: unit } : {},
  last_changed: iso(),
  last_updated: iso(),
});

const roleEntries: EntityRegistryEntry[] = [
  ["sensor.saltwatch_salt_level", "Salt Level"],
  ["sensor.saltwatch_salt_status", "Salt Status"],
  ["number.saltwatch_low_salt_threshold", "Low Salt Threshold"],
  ["sensor.saltwatch_estimated_days_until_low_salt", "Estimated Days Until Low Salt"],
  ["sensor.saltwatch_forecast_status", "Forecast Status"],
  ["sensor.saltwatch_forecast_details", "Forecast Details"],
].map(([entityId, originalName]) => ({
  entity_id: entityId!,
  device_id: DEVICE_ID,
  platform: "esphome",
  id: `registry-${entityId}`,
  original_name: originalName,
  unique_id: `demo-${entityId}`,
  disabled_by: null,
}));

const hass: HomeAssistant = {
  states: {
    "sensor.saltwatch_salt_level": entity("sensor.saltwatch_salt_level", "62", "%"),
    "sensor.saltwatch_salt_status": entity("sensor.saltwatch_salt_status", "Good"),
    "sensor.saltwatch_estimated_days_until_low_salt": entity("sensor.saltwatch_estimated_days_until_low_salt", "18", "d"),
    "sensor.saltwatch_forecast_status": entity("sensor.saltwatch_forecast_status", "Available"),
    "sensor.saltwatch_forecast_details": entity("sensor.saltwatch_forecast_details", "Based on 18 days of data"),
    "number.saltwatch_low_salt_threshold": entity("number.saltwatch_low_salt_threshold", "20", "%"),
  },
  entities: Object.fromEntries(roleEntries.map((entry) => [entry.entity_id, entry])),
  devices: {
    [DEVICE_ID]: { id: DEVICE_ID, name: "SaltWatch Demo" },
  },
  callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
    if (message.type !== "config/entity_registry/get_entries") throw new Error("Unsupported demo request");
    return Object.fromEntries(roleEntries.map((entry) => [entry.entity_id, entry])) as T;
  },
};

const config: SaltWatchCardConfig = {
  type: "custom:saltwatch-card",
  device_id: DEVICE_ID,
  show_status: true,
  show_low_marker: true,
  display_mode: "both",
  metric_mode: "level",
};

const forecastDetailsFor = (state: string, days = "18"): string => ({
  "Initializing": "Starting forecast",
  "Sensor Fault": "Waiting for valid readings",
  "Calibration Required": "Calibration required",
  "Waiting for Measurement": "Waiting for first reading",
  "Waiting for Time": "Waiting for date and time",
  "Learning": "4 of 7 days collected",
  "Confirming Refill": "Checking possible refill",
  "Insufficient Change": "Not enough salt usage yet",
  "Low Salt": "Low threshold reached",
}[state] ?? `Based on ${days} days of data`);

const card = document.querySelector<SaltWatchCard>("#card");
if (!card) throw new Error("Demo card not found");
const frame = card.parentElement;
if (!frame) throw new Error("Demo frame not found");
let statesSubscriber: ((states: HomeAssistant["states"], unsubscribe: () => void) => void) | undefined;
let internationalizationSubscriber: ((
  internationalization: HomeAssistantInternationalization,
  unsubscribe: () => void,
) => void) | undefined;
let internationalization: HomeAssistantInternationalization = {
  language: "en-GB",
  locale: { language: "en-GB" },
};
const unsubscribeStates = () => {
  statesSubscriber = undefined;
};
const unsubscribeInternationalization = () => {
  internationalizationSubscriber = undefined;
};
frame.addEventListener("context-request", (event) => {
  const request = event as CustomEvent & {
    context?: string;
    callback?: (...args: never[]) => void;
  };
  if (!request.callback) return;
  if (request.context === "states") {
    statesSubscriber = request.callback as typeof statesSubscriber;
    statesSubscriber?.(hass.states, unsubscribeStates);
  }
  if (request.context === "hassInternationalization") {
    internationalizationSubscriber = request.callback as typeof internationalizationSubscriber;
    internationalizationSubscriber?.(
      internationalization,
      unsubscribeInternationalization,
    );
  }
});
const notifyStates = () => statesSubscriber?.(hass.states, unsubscribeStates);
const notifyInternationalization = () => internationalizationSubscriber?.(
  internationalization,
  unsubscribeInternationalization,
);
card.setConfig(config);
card.hass = hass;
card.remove();
frame.append(card);

const levelInput = document.querySelector<HTMLInputElement>("#level");
const levelValue = document.querySelector<HTMLElement>("#level-value");
const forecastInput = document.querySelector<HTMLInputElement>("#forecast-days");
const forecastValue = document.querySelector<HTMLElement>("#forecast-value");
const showStatusInput = document.querySelector<HTMLInputElement>("#show-status");
const showLowMarkerInput = document.querySelector<HTMLInputElement>("#show-low-marker");
const displayModeInput = document.querySelector<HTMLSelectElement>("#display-mode");
const metricModeInput = document.querySelector<HTMLSelectElement>("#metric-mode");
const forecastStateInput = document.querySelector<HTMLSelectElement>("#forecast-state");
const languageInput = document.querySelector<HTMLSelectElement>("#language");
const lightThemeInput = document.querySelector<HTMLInputElement>("#light-theme");
const themeName = document.querySelector<HTMLElement>("#theme-name");
const applyConfig = () => {
  card.setConfig(config);
};
showStatusInput?.addEventListener("change", () => {
  config.show_status = showStatusInput.checked;
  applyConfig();
});
showLowMarkerInput?.addEventListener("change", () => {
  config.show_low_marker = showLowMarkerInput.checked;
  applyConfig();
});
displayModeInput?.addEventListener("change", () => {
  config.display_mode = displayModeInput.value as SaltWatchCardConfig["display_mode"];
  applyConfig();
});
metricModeInput?.addEventListener("change", () => {
  config.metric_mode = metricModeInput.value as SaltWatchCardConfig["metric_mode"];
  applyConfig();
});
forecastStateInput?.addEventListener("change", () => {
  const state = forecastStateInput.value;
  hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", state);
  hass.states["sensor.saltwatch_forecast_details"] = entity(
    "sensor.saltwatch_forecast_details",
    forecastDetailsFor(state, forecastInput?.value || "18"),
  );
  hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity(
    "sensor.saltwatch_estimated_days_until_low_salt",
    state === "Available" ? forecastInput?.value || "18" : state === "Low Salt" ? "0" : "unavailable",
    "d",
  );
  notifyStates();
});
languageInput?.addEventListener("change", () => {
  const language = languageInput.value;
  document.documentElement.lang = language;
  internationalization = { language, locale: { language } };
  notifyInternationalization();
});
lightThemeInput?.addEventListener("change", () => {
  const lightTheme = lightThemeInput.checked;
  document.documentElement.dataset.theme = lightTheme ? "light" : "dark";
  if (themeName) themeName.textContent = lightTheme ? "Light theme" : "Dark theme";
});
levelInput?.addEventListener("input", () => {
  const value = levelInput.value;
  hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, value, "%");
  hass.states["sensor.saltwatch_salt_status"] = entity(
    "sensor.saltwatch_salt_status",
    Number(value) <= 20 ? "Low Salt" : "Good",
  );
  if (levelValue) levelValue.textContent = `${value}%`;
  notifyStates();
});
forecastInput?.addEventListener("input", () => {
  const value = forecastInput.value;
  hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity(
    "sensor.saltwatch_estimated_days_until_low_salt",
    value,
    "d",
  );
  hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", value === "0" ? "Low Salt" : "Available");
  hass.states["sensor.saltwatch_forecast_details"] = entity(
    "sensor.saltwatch_forecast_details",
    value === "0" ? "Low threshold reached" : `Based on ${value} days of data`,
  );
  if (forecastStateInput) forecastStateInput.value = "Available";
  if (forecastValue) forecastValue.textContent = `${value} d`;
  notifyStates();
});

document.querySelectorAll<HTMLButtonElement>("button[data-state]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = button.dataset.state;
    if (state === "initializing") {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Initializing");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "unavailable", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Initializing");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", "Starting forecast");
    } else if (state === "unavailable") {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Good");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "unavailable", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Waiting for Measurement");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", "Waiting for first reading");
    } else if (state === "fault") {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Sensor Fault");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "unavailable", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Sensor Fault");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", "Waiting for valid readings");
    } else if (state === "calibration") {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Calibration Required");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "unavailable", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Calibration Required");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", "Calibration required");
    } else if (state === "low") {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, "14", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Low Salt");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "0", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Low Salt");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", "Low threshold reached");
      if (levelInput) levelInput.value = "14";
      if (levelValue) levelValue.textContent = "14%";
      if (forecastInput) forecastInput.value = "0";
      if (forecastValue) forecastValue.textContent = "0 d";
    } else {
      hass.states[LEVEL_ENTITY_ID] = entity(LEVEL_ENTITY_ID, levelInput?.value || "62", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Good");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", forecastInput?.value || "18", "d");
      hass.states["sensor.saltwatch_forecast_status"] = entity("sensor.saltwatch_forecast_status", "Available");
      hass.states["sensor.saltwatch_forecast_details"] = entity("sensor.saltwatch_forecast_details", `Based on ${forecastInput?.value || "18"} days of data`);
    }
    if (forecastStateInput) {
      if (state === "good") forecastStateInput.value = "Available";
      if (state === "low") forecastStateInput.value = "Low Salt";
      if (state === "initializing") forecastStateInput.value = "Initializing";
      if (state === "unavailable") forecastStateInput.value = "Waiting for Measurement";
      if (state === "fault") forecastStateInput.value = "Sensor Fault";
      if (state === "calibration") forecastStateInput.value = "Calibration Required";
    }
    notifyStates();
  });
});
