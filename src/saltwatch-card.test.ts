import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaltWatchCard } from "./saltwatch-card";
import { detectRelatedEntities, SaltWatchCardEditor } from "./saltwatch-card-editor";
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
      "sensor.saltwatch_estimated_days_until_low_salt": makeEntity("sensor.saltwatch_estimated_days_until_low_salt", "18"),
      "sensor.saltwatch_forecast_status": makeEntity("sensor.saltwatch_forecast_status", "Available"),
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

  it("inherits Home Assistant surface and state theme colors", () => {
    const styles = card.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(styles).toContain("var(--card-background-color");
    expect(styles).toContain("--sw-panel-divider:");
    expect(styles).toContain("--sw-good:var(--success-color);");
    expect(styles).toContain("--sw-warning:var(--warning-color);");
    expect(styles).toContain("--sw-low:var(--warning-color);");
    expect(styles).toContain("--sw-fault:var(--error-color);");
    expect(styles).not.toMatch(/--sw-(?:good|low|warning|fault):var\([^;]+,/);
  });

  it("advertises responsive, auto-height sizing in sections dashboards", () => {
    expect(card.getGridOptions()).toEqual({
      columns: 12,
      min_columns: 3,
      rows: "auto",
    });
    expect(card.getCardSize()).toBe(13);
    card.setConfig({ ...config, display_mode: "tank" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 3,
      rows: "auto",
    });
    expect(card.getCardSize()).toBe(12);
    card.setConfig({ ...config, display_mode: "details" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 3,
      rows: "auto",
    });
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

  it("discovers forecast entities and exposes all value layouts in the editor", () => {
    const stub = SaltWatchCard.getStubConfig(makeHass());
    expect(stub.metric_mode).toBe("level");
    expect(stub.forecast_entity).toBe("sensor.saltwatch_estimated_days_until_low_salt");
    expect(stub.forecast_status_entity).toBe("sensor.saltwatch_forecast_status");

    const form = SaltWatchCard.getConfigForm() as {
      schema: Array<{
        name?: string;
        selector?: { select?: { options?: Array<{ value: string }> } };
        schema?: Array<{ name: string }>;
      }>;
    };
    const metricMode = form.schema.find((item) => item.name === "metric_mode");
    expect(metricMode?.selector?.select?.options?.map((option) => option.value)).toEqual([
      "level",
      "forecast",
      "both",
    ]);
    expect(form.schema.some((item) => item.schema?.some((field) => field.name === "forecast_entity"))).toBe(true);
    expect(form.schema.some((item) => item.schema?.some((field) => field.name === "forecast_status_entity"))).toBe(true);
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

  it("supports level, forecast, and dual value layouts", () => {
    expect(card.shadowRoot?.querySelector(".metrics-level .level")?.textContent).toBe("62%");
    expect(card.shadowRoot?.querySelector(".forecast-metric")).toBeNull();

    card.setConfig({
      ...config,
      metric_mode: "forecast",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
    });
    expect(card.shadowRoot?.querySelector(".metrics-forecast .forecast-value")?.textContent).toBe("18");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Days until low salt");
    expect(card.shadowRoot?.querySelector(".level-metric")).toBeNull();

    card.setConfig({
      ...config,
      metric_mode: "both",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
    });
    expect(card.shadowRoot?.querySelector(".metrics-both .level")?.textContent).toBe("62%");
    expect(card.shadowRoot?.querySelector(".metrics-both .forecast-value")?.textContent).toBe("18");
    expect(card.shadowRoot?.querySelector(".metric-divider")).not.toBeNull();
    expect(card.shadowRoot?.querySelector("ha-card")?.getAttribute("aria-label")).toContain("18 Days until low salt");
  });

  it("shows forecast progress instead of a stale value", () => {
    card.setConfig({
      ...config,
      metric_mode: "forecast",
      forecast_entity: "sensor.saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.saltwatch_forecast_status",
    });
    const hass = makeHass();
    hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = makeEntity(
      "sensor.saltwatch_estimated_days_until_low_salt",
      "unavailable",
    );
    hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
      "sensor.saltwatch_forecast_status",
      "Learning",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".forecast-value")?.textContent).not.toContain("—");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Forecast learning");
    expect(card.shadowRoot?.querySelector(".forecast-metric")?.classList).toContain("unavailable");

    hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
      "sensor.saltwatch_forecast_status",
      "Insufficient Change",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("No clear usage trend");
  });

  it("uses a centered base aligned with the tank body", () => {
    expect(card.shadowRoot?.querySelector(".tank-base")?.getAttribute("d"))
      .toBe("M112 492H308L302 518H275L267 511H153L145 518H118Z");
  });

  it("uses HA warning colors for low states and danger only for faults", () => {
    const styles = card.shadowRoot?.querySelector("style")?.textContent;
    expect(styles).toContain(".threshold { color:var(--sw-warning); fill:none; stroke:currentColor;");
    expect(styles).toContain(".threshold.tone-low { color:var(--sw-low); }");
    expect(styles).toContain(".threshold-label rect { fill:var(--sw-warning); }");
    expect(styles).toContain(".threshold-label.tone-low rect { fill:var(--sw-low); }");
    expect(styles).toContain(".threshold-label text { fill:var(--text-light-primary-color);");
    expect(styles).toContain(".tone-low .status { color:var(--sw-low); }");
    expect(styles).toContain(".tone-warning .status-dot { background:var(--sw-warning); }");
    expect(styles).toContain(".tone-warning .state-symbol { color:var(--sw-warning); }");
    expect(styles).toContain(".tone-fault .status-dot { background:var(--sw-fault); }");
    expect(styles).toContain(".tone-fault .state-symbol { color:var(--sw-fault); }");
    expect(styles).toContain(".marker-line { width:34px; height:3px; border-radius:3px; background:var(--sw-warning);");
    expect(styles).toContain(".forecast-symbol { display:block;");
    expect(styles).toContain("stroke:currentColor;");
    expect(styles).toContain("background:color-mix(in srgb,var(--divider-color) 52%,transparent);");
    expect(styles).toContain(".forecast-metric.unavailable .metric-value { color:var(--primary-text-color); }");
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

  it("can place details before the tank in complete mode", () => {
    card.setConfig({ ...config, display_mode: "both", section_order: "details-first" });
    expect(card.shadowRoot?.querySelector(".card-shell")?.classList).toContain("order-details-first");
    expect(card.shadowRoot?.querySelector(".tank-panel")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".content-panel")).not.toBeNull();

    card.setConfig({ ...config, display_mode: "both", section_order: "tank-first" });
    expect(card.shadowRoot?.querySelector(".card-shell")?.classList).toContain("order-tank-first");
  });

  it("marks numeric grid-row layouts for height-aware scaling", () => {
    card.setConfig({ ...config, display_mode: "details", grid_options: { columns: 12, rows: 2 } });
    expect(card.shadowRoot?.querySelector("ha-card")?.classList).toContain("fixed-height");

    card.setConfig({ ...config, display_mode: "details", grid_options: { columns: 12, rows: "auto" } });
    expect(card.shadowRoot?.querySelector("ha-card")?.classList).not.toContain("fixed-height");
  });

  it("detects related SaltWatch entities belonging to the selected level sensor", () => {
    const hass = makeHass();
    hass.states["sensor.guest_saltwatch_salt_level"] = makeEntity("sensor.guest_saltwatch_salt_level", "45");
    hass.states["sensor.guest_saltwatch_salt_status"] = makeEntity("sensor.guest_saltwatch_salt_status", "Good");
    hass.states["number.guest_saltwatch_low_salt_threshold"] = makeEntity("number.guest_saltwatch_low_salt_threshold", "18");
    hass.states["sensor.guest_saltwatch_estimated_days_until_low_salt"] = makeEntity("sensor.guest_saltwatch_estimated_days_until_low_salt", "12");
    hass.states["sensor.guest_saltwatch_forecast_status"] = makeEntity("sensor.guest_saltwatch_forecast_status", "Available");

    expect(detectRelatedEntities(hass, "sensor.guest_saltwatch_salt_level")).toEqual({
      status_entity: "sensor.guest_saltwatch_salt_status",
      threshold_entity: "number.guest_saltwatch_low_salt_threshold",
      forecast_entity: "sensor.guest_saltwatch_estimated_days_until_low_salt",
      forecast_status_entity: "sensor.guest_saltwatch_forecast_status",
    });
  });

  it("shows a configure warning when related entities cannot all be detected", () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    editor.setConfig({ entity: "sensor.saltwatch_salt_level" });
    editor.hass = {
      states: {
        "sensor.saltwatch_salt_level": makeEntity("sensor.saltwatch_salt_level", "50"),
      },
    };
    expect(editor.shadowRoot?.querySelector(".notice.warning")?.textContent).toContain(
      "Some SaltWatch entities weren’t found",
    );
    const configure = editor.shadowRoot?.querySelector<HTMLButtonElement>(".configure");
    expect(configure).not.toBeNull();
    configure?.click();
    expect(editor.shadowRoot?.querySelector<HTMLDetailsElement>("#advanced")?.open).toBe(true);
  });

  it("keeps editor controls mounted across routine Home Assistant state updates", () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    const hass = makeHass();
    editor.hass = hass;
    editor.setConfig({ entity: "sensor.saltwatch_salt_level" });
    const layoutButton = editor.shadowRoot?.querySelector(".layout-option");
    const levelForm = editor.shadowRoot?.querySelector("#level-form ha-form");

    editor.hass = {
      states: {
        ...hass.states,
        "sensor.unrelated": makeEntity("sensor.unrelated", "updated"),
      },
    };

    expect(editor.shadowRoot?.querySelector(".layout-option")).toBe(layoutButton);
    expect(editor.shadowRoot?.querySelector("#level-form ha-form")).toBe(levelForm);
  });

  it("removes the salt and shows an explicit unavailable state", () => {
    pushStates(makeHass("unavailable", "Sensor Fault"));
    expect(card.shadowRoot?.querySelector(".salt-highlight")).toBeNull();
    expect(card.shadowRoot?.textContent?.match(/Sensor fault/g)).toHaveLength(1);
    expect(card.shadowRoot?.querySelector(".salt-fill")).toBeNull();
    expect(card.shadowRoot?.querySelector(".unavailable-base")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".unavailable-hatch")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".level")).toBeNull();
    expect(card.shadowRoot?.querySelector(".level-label")).toBeNull();
    expect(card.shadowRoot?.querySelector("ha-card")?.getAttribute("aria-label")).toContain("No current reading");
  });

  it("uses a dedicated symbol when calibration is required", () => {
    pushStates(makeHass("unavailable", "Calibration Required"));
    expect(card.shadowRoot?.querySelector(".calibration-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).toBeNull();
    expect(card.shadowRoot?.textContent?.match(/Calibration required/g)).toHaveLength(1);
    expect(card.shadowRoot?.querySelector(".level-label")).toBeNull();
  });

  it("keeps the exceptional-state label when the top status is hidden", () => {
    card.setConfig({ ...config, show_status: false });
    pushStates(makeHass("unavailable", "Sensor Fault"));
    expect(card.shadowRoot?.querySelector("header")).toBeNull();
    expect(card.shadowRoot?.querySelector(".level-label")?.textContent).toContain("Sensor fault");
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
