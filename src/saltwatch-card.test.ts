import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaltWatchCard } from "./saltwatch-card";
import { SaltWatchCardEditor } from "./saltwatch-card-editor";
import { resolveSaltWatchDevice } from "./saltwatch-device";
import type { EntityRegistryEntry, HassEntity, HomeAssistant, SaltWatchCardConfig } from "./types";

const DEVICE_ID = "saltwatch-device";

const makeEntity = (entityId: string, state: string): HassEntity => ({
  entity_id: entityId,
  state,
  attributes: {},
  last_changed: "2026-08-30T08:00:00Z",
  last_updated: "2026-08-30T08:00:00Z",
});

const config: SaltWatchCardConfig = {
  type: "custom:saltwatch-card",
  device_id: DEVICE_ID,
};

function makeHass(level = "62", status = "Good"): HomeAssistant {
  const states = {
      "sensor.saltwatch_salt_level": makeEntity("sensor.saltwatch_salt_level", level),
      "sensor.saltwatch_salt_status": makeEntity("sensor.saltwatch_salt_status", status),
      "sensor.saltwatch_estimated_days_until_low_salt": makeEntity("sensor.saltwatch_estimated_days_until_low_salt", "18"),
      "sensor.saltwatch_forecast_status": makeEntity("sensor.saltwatch_forecast_status", "Available"),
      "sensor.saltwatch_forecast_details": makeEntity("sensor.saltwatch_forecast_details", "Based on 18 days of data"),
      "number.saltwatch_low_salt_threshold": makeEntity("number.saltwatch_low_salt_threshold", "20"),
  };
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
    unique_id: `test-${entityId}`,
    disabled_by: null,
  }));
  const hass = {
    states,
    entities: Object.fromEntries(roleEntries.map((entry) => [entry.entity_id, entry])),
    devices: { [DEVICE_ID]: { id: DEVICE_ID, name: "SaltWatch" } },
    callWS: async <T>(message: Record<string, unknown>): Promise<T> => {
      const requested = new Set(message.entity_ids as string[] | undefined);
      return Object.fromEntries(Object.entries(hass.entities).filter(([entityId]) =>
        requested.size === 0 || requested.has(entityId)
      )) as T;
    },
  } satisfies HomeAssistant;
  return hass;
}

function makeEmptyHass(): HomeAssistant {
  return {
    states: {},
    entities: {},
    devices: {},
    callWS: async <T>(): Promise<T> => ({}) as T,
  };
}

describe("SaltWatchCard", () => {
  let card: SaltWatchCard;
  let host: HTMLElement;
  let pushStates: (hass: HomeAssistant) => void;
  let pushLanguage: (language: string) => void;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    document.documentElement.lang = "en";
    if (!customElements.get("saltwatch-card-test")) {
      customElements.define("saltwatch-card-test", SaltWatchCard);
    }
    host = document.createElement("div");
    unsubscribe = vi.fn();
    let callback: ((states: HomeAssistant["states"], unsubscribe: () => void) => void) | undefined;
    const languageSubscribers = new Set<(
      internationalization: { language: string; locale: { language: string } },
      unsubscribe: () => void,
    ) => void>();
    const initialHass = makeHass();
    host.addEventListener("context-request", (event) => {
      const request = event as CustomEvent & {
        context: string;
        callback?: (...args: never[]) => void;
      };
      if (!request.callback) return;
      if (request.context === "states") {
        callback = request.callback as typeof callback;
        callback?.(initialHass.states, unsubscribe);
      }
      if (request.context === "hassInternationalization") {
        const subscriber = request.callback as unknown as (
          internationalization: { language: string; locale: { language: string } },
          unsubscribe: () => void,
        ) => void;
        languageSubscribers.add(subscriber);
        subscriber({ language: "en", locale: { language: "en" } }, () => {
          languageSubscribers.delete(subscriber);
        });
      }
    });
    pushStates = (hass) => callback?.(hass.states, unsubscribe);
    pushLanguage = (language) => languageSubscribers.forEach((subscriber) => {
      subscriber({ language, locale: { language } }, () => {
        languageSubscribers.delete(subscriber);
      });
    });
    document.body.replaceChildren(host);
    card = document.createElement("saltwatch-card-test") as SaltWatchCard;
    card.setConfig(config);
    card.hass = initialHass;
    host.append(card);
    await vi.waitFor(() => expect(card.shadowRoot?.querySelector(".card-shell")).not.toBeNull());
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

  it("advertises readable mode-specific sizing in sections dashboards", () => {
    expect(card.getGridOptions()).toEqual({
      columns: 12,
      min_columns: 6,
      rows: "auto",
      min_rows: 4,
    });
    expect(card.getCardSize()).toBe(13);
    card.setConfig({ ...config, display_mode: "tank" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 3,
      rows: "auto",
      min_rows: 3,
    });
    expect(card.getCardSize()).toBe(12);
    card.setConfig({ ...config, display_mode: "details" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 3,
      rows: "auto",
      min_rows: 2,
    });
    expect(card.getCardSize()).toBe(7);
    card.setConfig({ ...config, display_mode: "details", metric_mode: "forecast" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 3,
      rows: "auto",
      min_rows: 2,
    });
    card.setConfig({ ...config, display_mode: "details", metric_mode: "both" });
    expect(card.getGridOptions()).toEqual({
      columns: 6,
      min_columns: 6,
      rows: "auto",
      min_rows: 2,
    });
  });

  it("requires a SaltWatch device before saving and removes manual entity overrides", () => {
    const form = SaltWatchCard.getConfigForm() as {
      schema: Array<{ name?: string; selector?: { device?: Record<string, unknown> }; schema?: Array<{ name: string }> }>;
      assertConfig: (config: Record<string, unknown>) => void;
    };
    expect(form.schema.find((item) => item.name === "device_id")?.selector?.device).toBeDefined();
    expect(form.schema.some((item) => item.name === "low_threshold")).toBe(false);
    expect(form.schema.some((item) => item.schema?.some((field) => field.name.endsWith("_entity")))).toBe(false);
    card.setConfig({ ...config, device_id: "" });
    expect(card.shadowRoot?.querySelector(".configuration-empty")).not.toBeNull();
    expect(card.shadowRoot?.textContent).toContain("SaltWatch device required");
    expect(card.shadowRoot?.querySelector("style")?.textContent).toContain(".configuration-empty");
    expect(() => form.assertConfig({ device_id: "" })).toThrow(/requires a SaltWatch device/);
  });

  it("leaves device discovery to the strict editor and exposes all value layouts", () => {
    const stub = SaltWatchCard.getStubConfig(makeHass(), ["sensor.saltwatch_salt_level"]);
    expect(stub.metric_mode).toBe("level");
    expect(stub.device_id).toBe("");

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
    expect(form.schema.some((item) => item.schema?.some((field) => field.name === "forecast_entity"))).toBe(false);
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
    pushStates({ ...hass,
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
    });
    expect(card.shadowRoot?.querySelector(".metrics-forecast .forecast-value")?.textContent).toBe("18");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Days until low salt");
    expect(card.shadowRoot?.querySelector(".level-metric")).toBeNull();

    card.setConfig({
      ...config,
      metric_mode: "both",
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
    hass.states["sensor.saltwatch_forecast_details"] = makeEntity(
      "sensor.saltwatch_forecast_details",
      "4 of 7 days collected",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-placeholder")?.textContent).toBe("—");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Forecast");
    expect(card.shadowRoot?.querySelector(".forecast-detail")?.textContent).toBe("4 of 7 days collected");
    expect(card.shadowRoot?.querySelector(".forecast-metric")?.classList).toContain("unavailable");

    hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
      "sensor.saltwatch_forecast_status",
      "Insufficient Change",
    );
    hass.states["sensor.saltwatch_forecast_details"] = makeEntity(
      "sensor.saltwatch_forecast_details",
      "Readings are too inconsistent",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-detail")?.textContent).toBe("Readings are too inconsistent");
  });

  it("explains every unavailable forecast state while keeping a valid tank", () => {
    card.setConfig({
      ...config,
      metric_mode: "forecast",
    });
    const cases = [
      ["Initializing", "Starting forecast"],
      ["Sensor Fault", "Waiting for valid readings"],
      ["Calibration Required", "Calibration required"],
      ["Waiting for Measurement", "Waiting for first reading"],
      ["Waiting for Time", "Waiting for date and time"],
      ["Learning", "4 of 7 days collected"],
      ["Confirming Refill", "Checking possible refill"],
      ["Insufficient Change", "Not enough salt usage yet"],
      ["Available", "Forecast unavailable"],
    ] as const;

    for (const [forecastStatus, expectedDetail] of cases) {
      const hass = makeHass();
      hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = makeEntity(
        "sensor.saltwatch_estimated_days_until_low_salt",
        "unavailable",
      );
      hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
        "sensor.saltwatch_forecast_status",
        forecastStatus,
      );
      hass.states["sensor.saltwatch_forecast_details"] = makeEntity(
        "sensor.saltwatch_forecast_details",
        expectedDetail,
      );
      pushStates(hass);
      expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Forecast");
      expect(card.shadowRoot?.querySelector(".forecast-detail")?.textContent).toBe(expectedDetail);
      expect(card.shadowRoot?.querySelector(".forecast-placeholder")?.textContent).toBe("—");
      expect(card.shadowRoot?.querySelector(".salt-photo")).not.toBeNull();
    }
  });

  it("translates forecast details without showing them for a valid forecast", () => {
    card.setConfig({
      ...config,
      metric_mode: "forecast",
    });
    const hass = makeHass();
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-detail")).toBeNull();

    hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = makeEntity(
      "sensor.saltwatch_estimated_days_until_low_salt",
      "unavailable",
    );
    hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
      "sensor.saltwatch_forecast_status",
      "Learning",
    );
    hass.states["sensor.saltwatch_forecast_details"] = makeEntity(
      "sensor.saltwatch_forecast_details",
      "4 of 7 days collected",
    );
    pushLanguage("de-DE");
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Prognose");
    expect(card.shadowRoot?.querySelector(".forecast-detail")?.textContent).toBe("4 von 7 Tagen erfasst");
  });

  it("uses the numeric forecast before its explanatory status catches up", () => {
    card.setConfig({
      ...config,
      metric_mode: "forecast",
    });
    const hass = makeHass();
    hass.states["sensor.saltwatch_forecast_status"] = makeEntity(
      "sensor.saltwatch_forecast_status",
      "Learning",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector(".forecast-value")?.textContent).toBe("18");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Days until low salt");
    expect(card.shadowRoot?.querySelector(".forecast-symbol")).toBeNull();
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
    expect(styles).toContain(".tone-neutral .status { color:var(--sw-neutral); }");
    expect(styles).toContain(".tone-neutral .status-dot { background:var(--sw-neutral); }");
    expect(styles).toContain(".tone-neutral .state-symbol { color:var(--sw-neutral); }");
    expect(styles).toContain(".tone-warning .status-dot { background:var(--sw-warning); }");
    expect(styles).toContain(".tone-warning .state-symbol { color:var(--sw-warning); }");
    expect(styles).toContain(".tone-fault .status-dot { background:var(--sw-fault); }");
    expect(styles).toContain(".tone-fault .state-symbol { color:var(--sw-fault); }");
    expect(styles).toContain(".marker-line { width:34px; height:3px; border-radius:3px; background:var(--sw-warning);");
    expect(styles).toContain(".forecast-placeholder { display:block;");
    expect(styles).toContain(".forecast-detail { max-width:30ch;");
    expect(styles).toContain(".metric-divider { align-self:center;");
    expect(styles).toContain("background:var(--sw-panel-divider);");
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

  it("resolves renamed entities from their device and immutable original names", async () => {
    const hass = makeHass();
    const renamedEntries = Object.values(hass.entities).map((entry, index) => ({
      ...entry,
      entity_id: `${entry.entity_id.split(".")[0]}.user_name_${index}`,
    } as EntityRegistryEntry));
    const oldStates = Object.values(hass.states);
    hass.entities = Object.fromEntries(renamedEntries.map((entry) => [entry.entity_id, entry]));
    hass.states = Object.fromEntries(renamedEntries.map((entry, index) => [
      entry.entity_id,
      { ...oldStates[index]!, entity_id: entry.entity_id },
    ]));

    const resolution = await resolveSaltWatchDevice(hass, DEVICE_ID);
    expect(resolution.missing).toEqual([]);
    expect(resolution.duplicates).toEqual([]);
    expect(resolution.entities).toEqual({
      level: "sensor.user_name_0",
      status: "sensor.user_name_1",
      threshold: "number.user_name_2",
      forecast: "sensor.user_name_3",
      forecastStatus: "sensor.user_name_4",
      forecastDetails: "sensor.user_name_5",
    });
  });

  it("never mixes entities from two identically named SaltWatch devices", async () => {
    const hass = makeHass();
    const secondDeviceId = "second-saltwatch-device";
    const secondEntries = Object.values(hass.entities).map((entry) => {
      const entityId = entry.entity_id.replace("saltwatch", "utility_room");
      return {
        ...entry,
        id: `second-${entry.entity_id}`,
        entity_id: entityId,
        device_id: secondDeviceId,
        unique_id: `second-${entry.entity_id}`,
      } as EntityRegistryEntry;
    });
    for (const entry of secondEntries) {
      hass.entities[entry.entity_id] = entry;
      const firstId = entry.entity_id.replace("utility_room", "saltwatch");
      hass.states[entry.entity_id] = { ...hass.states[firstId]!, entity_id: entry.entity_id };
    }
    hass.devices[secondDeviceId] = { id: secondDeviceId, name: "SaltWatch" };

    const resolution = await resolveSaltWatchDevice(hass, secondDeviceId);
    expect(Object.values(resolution.entities ?? {})).toHaveLength(6);
    expect(Object.values(resolution.entities ?? {}).every((entityId) => entityId.includes("utility_room"))).toBe(true);
  });

  it("fails closed for duplicate roles and reports disabled required entities", async () => {
    const hass = makeHass();
    const duplicate = {
      ...(hass.entities["sensor.saltwatch_salt_level"] as EntityRegistryEntry),
      id: "duplicate-level",
      entity_id: "sensor.duplicate_level",
      unique_id: "duplicate-level",
    };
    hass.entities[duplicate.entity_id] = duplicate;
    hass.states[duplicate.entity_id] = makeEntity(duplicate.entity_id, "50");
    const forecastDetails = hass.entities["sensor.saltwatch_forecast_details"] as EntityRegistryEntry;
    forecastDetails.disabled_by = "user";
    delete hass.states[forecastDetails.entity_id];

    const resolution = await resolveSaltWatchDevice(hass, DEVICE_ID);
    expect(resolution.entities).toBeUndefined();
    expect(resolution.duplicates).toEqual(["level"]);
    expect(resolution.disabled).toEqual(["forecastDetails"]);
  });

  it("shows a registry error instead of guessing from entity IDs", async () => {
    const hass = makeHass();
    hass.callWS = async () => { throw new Error("Registry unavailable"); };
    const isolated = document.createElement("saltwatch-card-test") as SaltWatchCard;
    isolated.setConfig(config);
    isolated.hass = hass;
    host.append(isolated);
    await vi.waitFor(() => expect(isolated.shadowRoot?.querySelector(".configuration-error")?.textContent)
      .toContain("Registry unavailable"));
    expect(isolated.shadowRoot?.querySelector(".card-shell")).toBeNull();
  });

  it("does not invent a fallback threshold while the device threshold is unavailable", async () => {
    const hass = makeHass();
    hass.states["number.saltwatch_low_salt_threshold"] = makeEntity(
      "number.saltwatch_low_salt_threshold",
      "unavailable",
    );
    const isolated = document.createElement("saltwatch-card-test") as SaltWatchCard;
    isolated.setConfig(config);
    isolated.hass = hass;
    host.append(isolated);
    await vi.waitFor(() => expect(isolated.shadowRoot?.querySelector(".loading")?.textContent)
      .toContain("No current reading"));
    expect(isolated.shadowRoot?.textContent).not.toContain("20%");
  });

  it("auto-selects the only complete SaltWatch device in the editor", async () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    const listener = vi.fn();
    editor.addEventListener("config-changed", listener);
    editor.setConfig({ device_id: "" });
    editor.hass = makeHass();
    host.append(editor);

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect((listener.mock.calls.at(-1)?.[0] as CustomEvent).detail.config.device_id).toBe(DEVICE_ID);
    expect(editor.shadowRoot?.querySelector(".notice.success")).not.toBeNull();
  });

  it("shows a warning when a selected SaltWatch device is incomplete", async () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    const hass = makeHass();
    delete hass.states["sensor.saltwatch_forecast_details"];
    delete hass.entities["sensor.saltwatch_forecast_details"];
    editor.setConfig({ device_id: DEVICE_ID });
    editor.hass = hass;
    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".notice.warning")?.textContent).toContain(
      "Forecast Details",
    ));
    expect(editor.shadowRoot?.textContent).not.toContain("Card layout");
    expect(editor.shadowRoot?.querySelector("#advanced")).toBeNull();
  });

  it("uses a neutral device-selection step before revealing dependent settings", async () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    editor.setConfig({ device_id: "" });
    editor.hass = makeEmptyHass();
    host.append(editor);

    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector(".notice.info")?.textContent).toContain(
      "No SaltWatch devices found",
    ));
    expect(editor.shadowRoot?.textContent).toContain("SaltWatch device");
    expect(editor.shadowRoot?.textContent).not.toContain("Card layout");
    expect(editor.shadowRoot?.querySelector("#actions")).toBeNull();
  });

  it("keeps editor controls mounted across routine Home Assistant state updates", async () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    const hass = makeHass();
    editor.hass = hass;
    editor.setConfig({ device_id: DEVICE_ID });
    await vi.waitFor(() => expect(editor.shadowRoot?.querySelector("#device-form ha-form")).not.toBeNull());
    const layoutButton = editor.shadowRoot?.querySelector(".layout-option");
    const deviceForm = editor.shadowRoot?.querySelector("#device-form ha-form");

    editor.hass = { ...hass, states: {
      ...hass.states,
      "sensor.unrelated": makeEntity("sensor.unrelated", "updated"),
    } };

    expect(editor.shadowRoot?.querySelector(".layout-option")).toBe(layoutButton);
    expect(editor.shadowRoot?.querySelector("#device-form ha-form")).toBe(deviceForm);
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

  it("shows initialization as neutral while preserving the unavailable tank", () => {
    pushStates(makeHass("unavailable", "Initializing"));
    expect(card.shadowRoot?.querySelector("ha-card")?.classList).toContain("tone-neutral");
    expect(card.shadowRoot?.querySelector(".unavailable-hatch")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".initializing-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).toBeNull();
    expect(card.shadowRoot?.textContent?.match(/Initializing/g)).toHaveLength(1);
    expect(card.shadowRoot?.querySelector(".threshold")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".threshold-label")).not.toBeNull();
  });

  it("shows a neutral unknown state when no level exists without a reported fault", () => {
    pushStates(makeHass("unavailable", "Good"));
    expect(card.shadowRoot?.querySelector("ha-card")?.classList).toContain("tone-neutral");
    expect(card.shadowRoot?.querySelector(".unavailable-hatch")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".unavailable-symbol")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".fault-symbol")).toBeNull();
    expect(card.shadowRoot?.textContent?.match(/No current reading/g)).toHaveLength(1);
  });

  it("restores a fresh numeric level before a stale fault status catches up", () => {
    pushStates(makeHass("62", "Sensor Fault"));
    expect(card.shadowRoot?.querySelector(".salt-photo")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".unavailable-hatch")).toBeNull();
    expect(card.shadowRoot?.querySelector(".metrics")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".state-symbol")).toBeNull();
    expect(card.shadowRoot?.querySelector(".status")?.textContent).toContain("Sensor fault");
  });

  it("preserves the legitimate low-status hysteresis combination", () => {
    card.setConfig({
      ...config,
      metric_mode: "both",
    });
    const hass = makeHass("22", "Low Salt");
    hass.states["sensor.saltwatch_estimated_days_until_low_salt"] = makeEntity(
      "sensor.saltwatch_estimated_days_until_low_salt",
      "2",
    );
    pushStates(hass);
    expect(card.shadowRoot?.querySelector("ha-card")?.classList).toContain("tone-low");
    expect(card.shadowRoot?.querySelector(".salt-photo")).not.toBeNull();
    expect(card.shadowRoot?.querySelector(".level")?.textContent).toBe("22%");
    expect(card.shadowRoot?.querySelector(".forecast-value")?.textContent).toBe("2");
    expect(card.shadowRoot?.querySelector(".forecast-label")?.textContent).toBe("Days until low salt");
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

  it("localizes built-in copy from the Home Assistant language context", () => {
    pushLanguage("de-AT");
    card.setConfig({ ...config, tap_action: { action: "navigate", navigation_path: "/test" } });
    expect(card.shadowRoot?.textContent).toContain("Geschätzter Salzstand");
    expect(card.shadowRoot?.textContent).toContain("Niedrig-Markierung");
    const listener = vi.fn();
    card.addEventListener("hass-action", listener);
    card.shadowRoot?.querySelector("ha-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({ action: "tap" });
  });

  it("updates the graphical editor when the Home Assistant language changes", async () => {
    if (!customElements.get("saltwatch-card-editor-test")) {
      customElements.define("saltwatch-card-editor-test", SaltWatchCardEditor);
    }
    const editor = document.createElement("saltwatch-card-editor-test") as SaltWatchCardEditor;
    editor.hass = makeHass();
    editor.setConfig({ device_id: DEVICE_ID });
    host.append(editor);

    expect(editor.shadowRoot?.textContent).toContain("SaltWatch device");
    pushLanguage("de-DE");
    expect(editor.shadowRoot?.textContent).toContain("SaltWatch-Gerät");
    await vi.waitFor(() => expect(editor.shadowRoot?.textContent).toContain("Reihenfolge"));
  });
});
