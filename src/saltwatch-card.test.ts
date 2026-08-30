import { beforeEach, describe, expect, it } from "vitest";
import { SaltWatchCard } from "./saltwatch-card";
import type { HassEntity, HomeAssistant, SaltWatchCardConfig } from "./types";

const makeEntity = (entityId: string, state: string): HassEntity => ({
  entity_id: entityId,
  state,
  attributes: {},
  last_changed: "2026-08-30T08:00:00Z",
  last_updated: "2026-08-30T08:00:00Z",
});

const config: SaltWatchCardConfig = {
  type: "custom:saltwatch-card",
  entity: "sensor.saltwatch_salt_level",
  status_entity: "sensor.saltwatch_salt_status",
  threshold_entity: "number.saltwatch_low_salt_threshold",
  forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
  distance_entity: "sensor.saltwatch_distance_to_salt",
  show_history: true,
};

function makeHass(level = "62", status = "Good"): HomeAssistant {
  return {
    states: {
      "sensor.saltwatch_salt_level": makeEntity("sensor.saltwatch_salt_level", level),
      "sensor.saltwatch_salt_status": makeEntity("sensor.saltwatch_salt_status", status),
      "number.saltwatch_low_salt_threshold": makeEntity("number.saltwatch_low_salt_threshold", "20"),
      "sensor.saltwatch_estimated_days_until_low_salt": makeEntity(
        "sensor.saltwatch_estimated_days_until_low_salt",
        "12",
      ),
      "sensor.saltwatch_distance_to_salt": makeEntity("sensor.saltwatch_distance_to_salt", "34.8"),
    },
    async callWS<T>(): Promise<T> {
      return {
        "sensor.saltwatch_salt_level": [{ s: "80" }, { s: "62" }],
      } as T;
    },
  };
}

describe("SaltWatchCard", () => {
  let card: SaltWatchCard;

  beforeEach(() => {
    if (!customElements.get("saltwatch-card-test")) {
      customElements.define("saltwatch-card-test", SaltWatchCard);
    }
    card = document.createElement("saltwatch-card-test") as SaltWatchCard;
    card.setConfig(config);
  });

  it("renders a dynamic granular level and configured metadata", async () => {
    card.hass = makeHass();
    await Promise.resolve();

    expect(card.shadowRoot?.textContent).toContain("62%");
    expect(card.shadowRoot?.textContent).toContain("Estimated salt level");
    expect(card.shadowRoot?.textContent).toContain("12 days");
    expect(card.shadowRoot?.textContent).toContain("Distance 34.8 cm");
    expect(card.shadowRoot?.querySelector(".salt-highlight")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".salt-fill")?.getAttribute("data-surface-y")).toBe("262.0");
    expect(card.shadowRoot?.querySelector(".threshold")?.getAttribute("data-threshold-y")).toBe("405.6");
    expect(card.shadowRoot?.querySelector(".tank")?.getAttribute("aria-label")).toBe(
      "62 percent estimated salt level",
    );
  });

  it("removes the salt and suppresses stale forecast data when unavailable", async () => {
    card.hass = makeHass("unavailable", "Sensor Fault");
    await Promise.resolve();

    expect(card.shadowRoot?.querySelector(".salt-highlight")).toBeNull();
    expect(card.shadowRoot?.textContent).toContain("Sensor fault");
    expect(card.shadowRoot?.textContent).toContain("Unavailable");
    expect(card.shadowRoot?.textContent).toContain("Distance unavailable");
    expect(card.shadowRoot?.textContent).not.toContain("12 days");
  });

  it("uses the live threshold entity for the low marker and state", async () => {
    const hass = makeHass("25", "Good");
    hass.states["number.saltwatch_low_salt_threshold"] = makeEntity(
      "number.saltwatch_low_salt_threshold",
      "30",
    );
    card.hass = hass;
    await Promise.resolve();

    expect(card.shadowRoot?.textContent).toContain("Low salt");
    expect(card.shadowRoot?.textContent).toContain("30%");
  });
});
