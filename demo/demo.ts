import "../src/index";
import type { HomeAssistant, SaltWatchCardConfig } from "../src/types";
import type { SaltWatchCard } from "../src/saltwatch-card";

const iso = () => new Date().toISOString();
const entity = (entityId: string, state: string, unit = "") => ({
  entity_id: entityId,
  state,
  attributes: unit ? { unit_of_measurement: unit } : {},
  last_changed: iso(),
  last_updated: iso(),
});

const hass: HomeAssistant = {
  states: {
    "sensor.saltwatch_salt_level": entity("sensor.saltwatch_salt_level", "62", "%"),
    "sensor.saltwatch_salt_status": entity("sensor.saltwatch_salt_status", "Good"),
    "number.saltwatch_low_salt_threshold": entity("number.saltwatch_low_salt_threshold", "20", "%"),
  },
};

const config: SaltWatchCardConfig = {
  type: "custom:saltwatch-card",
  entity: "sensor.saltwatch_salt_level",
  show_status: true,
  show_low_marker: true,
  display_mode: "both",
  status_entity: "sensor.saltwatch_salt_status",
  threshold_entity: "number.saltwatch_low_salt_threshold",
};

const card = document.querySelector<SaltWatchCard>("#card");
if (!card) throw new Error("Demo card not found");
const frame = card.parentElement;
if (!frame) throw new Error("Demo frame not found");
let statesSubscriber: ((states: HomeAssistant["states"], unsubscribe: () => void) => void) | undefined;
const unsubscribeStates = () => {
  statesSubscriber = undefined;
};
frame.addEventListener("context-request", (event) => {
  const request = event as CustomEvent & {
    context?: string;
    callback?: typeof statesSubscriber;
  };
  if (request.context !== "states" || !request.callback) return;
  statesSubscriber = request.callback;
  statesSubscriber(hass.states, unsubscribeStates);
});
const notifyStates = () => statesSubscriber?.(hass.states, unsubscribeStates);
card.setConfig(config);
card.remove();
frame.append(card);

const levelInput = document.querySelector<HTMLInputElement>("#level");
const levelValue = document.querySelector<HTMLElement>("#level-value");
const showStatusInput = document.querySelector<HTMLInputElement>("#show-status");
const showLowMarkerInput = document.querySelector<HTMLInputElement>("#show-low-marker");
const displayModeInput = document.querySelector<HTMLSelectElement>("#display-mode");
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
lightThemeInput?.addEventListener("change", () => {
  const lightTheme = lightThemeInput.checked;
  document.documentElement.dataset.theme = lightTheme ? "light" : "dark";
  if (themeName) themeName.textContent = lightTheme ? "Light theme" : "Dark theme";
});
levelInput?.addEventListener("input", () => {
  const value = levelInput.value;
  hass.states[config.entity] = entity(config.entity, value, "%");
  hass.states["sensor.saltwatch_salt_status"] = entity(
    "sensor.saltwatch_salt_status",
    Number(value) <= 20 ? "Low Salt" : "Good",
  );
  if (levelValue) levelValue.textContent = `${value}%`;
  notifyStates();
});

document.querySelectorAll<HTMLButtonElement>("button[data-state]").forEach((button) => {
  button.addEventListener("click", () => {
    const state = button.dataset.state;
    if (state === "fault") {
      hass.states[config.entity] = entity(config.entity, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Sensor Fault");
    } else if (state === "calibration") {
      hass.states[config.entity] = entity(config.entity, "unavailable", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Calibration Required");
    } else if (state === "low") {
      hass.states[config.entity] = entity(config.entity, "14", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Low Salt");
      if (levelInput) levelInput.value = "14";
      if (levelValue) levelValue.textContent = "14%";
    } else {
      hass.states[config.entity] = entity(config.entity, levelInput?.value || "62", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Good");
    }
    notifyStates();
  });
});
