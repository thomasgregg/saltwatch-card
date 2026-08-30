import "../src/index";
import type { HomeAssistant, SaltWatchCardConfig } from "../src/types";
import type { SaltWatchCard } from "../src/saltwatch-card";

const now = new Date();
const iso = () => new Date().toISOString();
const entity = (entityId: string, state: string, unit = "") => ({
  entity_id: entityId,
  state,
  attributes: unit ? { unit_of_measurement: unit } : {},
  last_changed: iso(),
  last_updated: iso(),
});

const history = [88, 84, 79, 76, 71, 68, 64, 61, 57, 53, 49, 92, 87, 82, 75, 69, 62];
const hass: HomeAssistant = {
  states: {
    "sensor.saltwatch_salt_level": entity("sensor.saltwatch_salt_level", "62", "%"),
    "sensor.saltwatch_salt_status": entity("sensor.saltwatch_salt_status", "Good"),
    "number.saltwatch_low_salt_threshold": entity("number.saltwatch_low_salt_threshold", "20", "%"),
    "sensor.saltwatch_estimated_days_until_low_salt": entity("sensor.saltwatch_estimated_days_until_low_salt", "12", "d"),
    "sensor.saltwatch_distance_to_salt": entity("sensor.saltwatch_distance_to_salt", "34.8", "cm"),
  },
  async callWS<T>(): Promise<T> {
    return {
      "sensor.saltwatch_salt_level": history.map((state, index) => ({
        s: String(state),
        lu: Math.floor((now.getTime() - (history.length - index) * 12 * 60 * 60 * 1000) / 1000),
      })),
    } as T;
  },
};

const config: SaltWatchCardConfig = {
  type: "custom:saltwatch-card",
  entity: "sensor.saltwatch_salt_level",
  status_entity: "sensor.saltwatch_salt_status",
  threshold_entity: "number.saltwatch_low_salt_threshold",
  forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
  distance_entity: "sensor.saltwatch_distance_to_salt",
  show_history: true,
  history_hours: 336,
};

const card = document.querySelector<SaltWatchCard>("#card");
if (!card) throw new Error("Demo card not found");
card.setConfig(config);
card.hass = hass;

const levelInput = document.querySelector<HTMLInputElement>("#level");
const levelValue = document.querySelector<HTMLElement>("#level-value");
levelInput?.addEventListener("input", () => {
  const value = levelInput.value;
  hass.states[config.entity] = entity(config.entity, value, "%");
  hass.states["sensor.saltwatch_salt_status"] = entity(
    "sensor.saltwatch_salt_status",
    Number(value) <= 20 ? "Low Salt" : "Good",
  );
  if (levelValue) levelValue.textContent = `${value}%`;
  card.hass = hass;
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
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "0", "d");
      if (levelInput) levelInput.value = "14";
      if (levelValue) levelValue.textContent = "14%";
    } else {
      hass.states[config.entity] = entity(config.entity, levelInput?.value || "62", "%");
      hass.states["sensor.saltwatch_salt_status"] = entity("sensor.saltwatch_salt_status", "Good");
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = entity("sensor.saltwatch_estimated_days_until_low_salt", "12", "d");
    }
    card.hass = hass;
  });
});
