import { beforeEach, describe, expect, it, vi } from "vitest";
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
};

function makeHass(level = "62", status = "Good"): HomeAssistant {
  return {
    states: {
      "sensor.saltwatch_salt_level": makeEntity("sensor.saltwatch_salt_level", level),
      "sensor.saltwatch_salt_status": makeEntity("sensor.saltwatch_salt_status", status),
      "number.saltwatch_low_salt_threshold": makeEntity("number.saltwatch_low_salt_threshold", "20"),
    },
  };
}

describe("SaltWatchCard", () => {
  let card: SaltWatchCard;
  let host: HTMLElement;
  let pushStates: (hass: HomeAssistant) => void;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.documentElement.lang = "en";
    if (!customElements.get("saltwatch-card-test")) {
      customElements.define("saltwatch-card-test", SaltWatchCard);
    }
    host = document.createElement("div");
    unsubscribe = vi.fn();
    let callback: ((states: HomeAssistant["states"], unsubscribe: () => void) => void) | undefined;
    const initialHass = makeHass();
    host.addEventListener("context-request", (event) => {
      const request = event as CustomEvent & {
        context: string;
        callback: typeof callback;
      };
      if (request.context !== "states" || !request.callback) return;
      callback = request.callback;
      callback(initialHass.states, unsubscribe);
    });
    pushStates = (hass) => callback?.(hass.states, unsubscribe);
    document.body.replaceChildren(host);
    card = document.createElement("saltwatch-card-test") as SaltWatchCard;
    card.setConfig(config);
    host.append(card);
  });

  it("renders a dynamic granular level and configured metadata", () => {
    expect(card.shadowRoot?.textContent).toContain("62%");
    expect(card.shadowRoot?.textContent).toContain("Estimated salt level");
    expect(card.shadowRoot?.textContent).toContain("Low marker");
    expect(card.shadowRoot?.querySelector("header")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".salt-highlight")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".salt-photo")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".threshold-value")).toBeNull();
    expect(card.shadowRoot?.querySelector(".tank-glass")?.hasAttribute("stroke")).toBe(false);
    expect(card.shadowRoot?.querySelector("#glass-sheen")).toBeNull();
    expect(card.shadowRoot?.querySelector(".window-vignette")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".tank ellipse")).toBeNull();
    expect(card.shadowRoot?.querySelectorAll(".ruler path")).toHaveLength(22);
    expect(card.shadowRoot?.querySelector(".salt-fill")?.getAttribute("data-surface-y")).toBe("262.0");
    expect(card.shadowRoot?.querySelector(".threshold")?.getAttribute("data-threshold-y")).toBe("405.6");
    expect(card.shadowRoot?.querySelector(".tank")?.getAttribute("aria-label")).toBe(
      "Estimated salt level: 62%",
    );
  });

  it("inherits Home Assistant surface and accessible semantic theme colors", () => {
    const styles = card.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(styles).toContain("var(--card-background-color");
    expect(styles).toContain("var(--success-color");
    expect(styles).toContain("var(--warning-color");
    expect(styles).toContain("var(--error-color");
    expect(styles).toContain("--sw-panel-divider:");
    expect(styles).toContain("--sw-good-text:color-mix");
  });

  it("uses full-width, intrinsic-height sizing in sections dashboards", () => {
    expect(card.getGridOptions()).toEqual({ columns: "full" });
    expect(card.getGridOptions()).not.toHaveProperty("rows");
    expect(card.getCardSize()).toBe(13);
    card.setConfig({ ...config, display_mode: "tank" });
    expect(card.getCardSize()).toBe(12);
    card.setConfig({ ...config, display_mode: "details" });
    expect(card.getCardSize()).toBe(7);
  });

  it("uses a validated numeric slider with a 20 percent default", () => {
    const form = SaltWatchCard.getConfigForm() as {
      schema: Array<{ name?: string; selector?: { number?: Record<string, unknown> } }>;
    };
    const threshold = form.schema.find((item) => item.name === "low_threshold");
    expect(threshold?.selector?.number).toEqual({
      min: 0,
      max: 100,
      step: 1,
      mode: "slider",
    });
    expect(SaltWatchCard.getStubConfig(makeHass()).low_threshold).toBe(20);
    expect(() => card.setConfig({ ...config, low_threshold: 101 })).toThrow(/between 0 and 100/);
  });

  it("exposes native action selectors in the graphical editor", () => {
    const form = SaltWatchCard.getConfigForm() as {
      schema: Array<{
        type?: string;
        schema?: Array<{ name: string; selector?: { ui_action?: Record<string, unknown> } }>;
      }>;
    };
    const actions = form.schema.find((item) => item.type === "expandable");
    expect(actions?.schema?.map((item) => item.name)).toEqual([
      "tap_action",
      "hold_action",
      "double_tap_action",
    ]);
    expect(actions?.schema?.every((item) => item.selector?.ui_action)).toBe(true);
  });

  it("subscribes to current HA state context and unsubscribes on disconnect", () => {
    expect(unsubscribe).not.toHaveBeenCalled();
    card.remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not rebuild for unrelated Home Assistant state updates", () => {
    const hass = makeHass();
    const initialShell = card.shadowRoot?.querySelector(".card-shell");
    pushStates({
      states: {
        ...hass.states,
        "sensor.unrelated": makeEntity("sensor.unrelated", "changed"),
      },
    });
    expect(card.shadowRoot?.querySelector(".card-shell")).toBe(initialShell);
    pushStates(makeHass("63"));
    expect(card.shadowRoot?.querySelector(".card-shell")).not.toBe(initialShell);
    expect(card.shadowRoot?.textContent).toContain("63%");
  });

  it("does not render an internal title and preserves the status", () => {
    expect(card.shadowRoot?.querySelector("header")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".title")).toBeNull();
    expect(card.shadowRoot?.querySelector(".status")?.textContent).toContain("Good");
    expect(card.shadowRoot?.querySelector(".reading")).not.toBeNull();
    expect(card.shadowRoot?.querySelector("ha-card")?.getAttribute("aria-label")).toContain("SaltWatch");
  });

  it("can hide the status and low-marker summary without changing the tank marker", () => {
    card.setConfig({ ...config, show_status: false, show_low_marker: false });
    expect(card.shadowRoot?.querySelector("header")).toBeNull();
    expect(card.shadowRoot?.querySelector(".status")).toBeNull();
    expect(card.shadowRoot?.querySelector(".threshold")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".threshold-label")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".threshold-summary")).toBeNull();
    expect(card.shadowRoot?.querySelector(".content-panel")?.classList).toContain("without-threshold-summary");
  });

  it("supports tank-only and percentage-only display modes", () => {
    card.setConfig({ ...config, display_mode: "tank" });
    expect(card.shadowRoot?.querySelector(".tank-panel")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".content-panel")).toBeNull();
    card.setConfig({ ...config, display_mode: "details" });
    expect(card.shadowRoot?.querySelector(".tank-panel")).toBeNull();
    expect(card.shadowRoot?.querySelector(".content-panel")).not.toBeNull();
  });

  it("removes the salt and shows an explicit unavailable state", () => {
    pushStates(makeHass("unavailable", "Sensor Fault"));
    expect(card.shadowRoot?.querySelector(".salt-highlight")).toBeNull();
    expect(card.shadowRoot?.textContent).toContain("Sensor fault");
    expect(card.shadowRoot?.querySelector(".salt-fill")).toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".level")).toBeNull();
    expect(card.shadowRoot?.querySelector("ha-card")?.getAttribute("aria-label")).toContain("No current reading");
  });

  it("uses a dedicated symbol when calibration is required", () => {
    pushStates(makeHass("unavailable", "Calibration Required"));
    expect(card.shadowRoot?.querySelector(".calibration-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).toBeNull();
  });

  it("uses the live threshold entity for the low marker and state", () => {
    const hass = makeHass("25", "Good");
    hass.states["number.saltwatch_low_salt_threshold"] = makeEntity("number.saltwatch_low_salt_threshold", "30");
    pushStates(hass);
    expect(card.shadowRoot?.textContent).toContain("Low salt");
    expect(card.shadowRoot?.textContent).toContain("30%");
  });

  it("localizes built-in copy and dispatches native Home Assistant actions", () => {
    document.documentElement.lang = "de";
    card.setConfig({ ...config, tap_action: { action: "navigate", navigation_path: "/test" } });
    expect(card.shadowRoot?.textContent).toContain("Geschätzter Salzstand");
    expect(card.shadowRoot?.textContent).toContain("Niedrig-Markierung");
    const listener = vi.fn();
    card.addEventListener("hass-action", listener);
    card.shadowRoot?.querySelector("ha-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ action: "tap" });
  });
});
