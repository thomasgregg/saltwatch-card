import type { NumberLocale } from "./localize";
import { formatPercentage, getTranslations, resolveLanguage, resolveLocale } from "./localize";
import {
  hasChromiumLink,
  normalizeWebInterfaceUrl,
  resolveSaltWatchEntries,
  saltWatchDataSource,
  saltWatchRoleLabel,
} from "./saltwatch-device";
import type { SaltWatchResolution } from "./saltwatch-device";
import type {
  EntityRegistryEntry,
  HomeAssistant,
  HomeAssistantInternationalization,
  SaltWatchCardConfig,
  SaltWatchDataSource,
} from "./types";

type EditorConfig = Omit<SaltWatchCardConfig, "type"> & { type?: string };
type EditorForm = HTMLElement & Record<string, unknown>;
interface FormOptions {
  helpers?: Record<string, string>;
  onChange?: (value: Partial<EditorConfig>, form: EditorForm) => void;
}
const SUPPORTED_ACTIONS = ["more-info", "toggle", "navigate", "url", "perform-action", "assist", "none"];

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export class SaltWatchCardEditor extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: EditorConfig;
  private internationalization?: HomeAssistantInternationalization;
  private formattingLocale?: NumberLocale;
  private unsubscribeInternationalization?: () => void;
  private languageObserver?: MutationObserver;
  private actionsOpen = false;
  private forecastMappingOpen = false;
  private registryReference?: HomeAssistant["entities"];
  private registryEntries: EntityRegistryEntry[] = [];
  private deviceResolutions = new Map<string, SaltWatchResolution>();
  private registryLoading = false;
  private registryError?: string;
  private registryRequest = 0;

  public constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public connectedCallback(): void {
    if (!this.languageObserver) {
      this.languageObserver = new MutationObserver(() => {
        if (!this.internationalization) this.render();
      });
      this.languageObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }
    if (!this.unsubscribeInternationalization) {
      const event = new CustomEvent("context-request", {
        bubbles: true,
        composed: true,
        cancelable: true,
      }) as CustomEvent & {
        context: string;
        subscribe: true;
        callback: (
          value: HomeAssistantInternationalization,
          unsubscribe: () => void,
        ) => void;
      };
      event.context = "hassInternationalization";
      event.subscribe = true;
      event.callback = (value, unsubscribe) => {
        const previousLocale = JSON.stringify(this.activeLocale());
        this.internationalization = value;
        this.formattingLocale = value.locale;
        this.unsubscribeInternationalization = unsubscribe;
        if (JSON.stringify(this.activeLocale()) !== previousLocale) this.render();
      };
      this.dispatchEvent(event);
    }
  }

  public disconnectedCallback(): void {
    this.unsubscribeInternationalization?.();
    this.unsubscribeInternationalization = undefined;
    this.languageObserver?.disconnect();
    this.languageObserver = undefined;
  }

  public set hass(hass: HomeAssistant) {
    const previousRenderKey = this.hassRenderKey();
    const registryChanged = this.registryReference !== hass.entities;
    const previousLocale = JSON.stringify(this.activeLocale());
    this._hass = hass;
    if (hass.locale || hass.language) {
      this.formattingLocale = hass.locale ?? { language: resolveLanguage(hass.language) };
    }
    this.registryReference = hass.entities;
    if (registryChanged) {
      void this.loadSaltWatchDevices();
      return;
    }
    this.refreshResolutions();
    const shouldRender = previousLocale !== JSON.stringify(this.activeLocale()) || !this.shadowRoot?.querySelector(".editor") || previousRenderKey !== this.hassRenderKey();
    if (shouldRender) {
      this.render();
    } else {
      this.updateFormHass();
    }
  }

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  public setConfig(config: EditorConfig): void {
    this._config = { ...config };
    this.render();
    if (this._hass && this.registryEntries.length === 0) void this.loadSaltWatchDevices();
  }

  private async loadSaltWatchDevices(): Promise<void> {
    if (!this._hass) return;
    const hass = this._hass;
    const request = ++this.registryRequest;
    this.registryLoading = true;
    this.registryError = undefined;
    this.render();
    try {
      const entityIds = Object.values(hass.entities)
        .filter((entry) => entry.platform === "esphome" && entry.device_id)
        .map((entry) => entry.entity_id);
      const entriesById = entityIds.length === 0
        ? {}
        : await hass.callWS<Record<string, EntityRegistryEntry>>({
          type: "config/entity_registry/get_entries",
          entity_ids: entityIds,
        });
      if (request !== this.registryRequest) return;
      this.registryEntries = Object.values(entriesById);
      this.refreshResolutions();
      const completeDevices = [...this.deviceResolutions.values()].filter(
        (resolution) => resolution.entities && resolution.disabled.length === 0,
      );
      if (
        this._config &&
        saltWatchDataSource(this._config as SaltWatchCardConfig) === "device" &&
        !this._config.device_id &&
        completeDevices.length === 1
      ) {
        this.updateConfig({ device_id: completeDevices[0]!.deviceId }, false);
      }
    } catch (error) {
      if (request !== this.registryRequest) return;
      this.registryEntries = [];
      this.deviceResolutions.clear();
      this.registryError = error instanceof Error ? error.message : String(error);
    }
    this.registryLoading = false;
    this.render();
  }

  private refreshResolutions(): void {
    if (!this._hass) return;
    const deviceIds = [...new Set(this.registryEntries.map((entry) => entry.device_id).filter(
      (deviceId): deviceId is string => Boolean(deviceId),
    ))];
    const resolutions: Array<[string, SaltWatchResolution]> = deviceIds.map((deviceId) => [
      deviceId,
      resolveSaltWatchEntries(deviceId, this.registryEntries),
    ]);
    this.deviceResolutions = new Map(resolutions.filter(([, resolution]) =>
      // A SaltWatch candidate has at least one exact SaltWatch role.
      resolution.missing.length < 6 || resolution.duplicates.length > 0
    ));
  }

  private hassRenderKey(): string {
    if (!this._config) return "";
    const source = saltWatchDataSource(this._config as SaltWatchCardConfig);
    const openWithAvailable = this._config.show_web_interface === true && hasChromiumLink(this._hass);
    if (source === "entities") {
      const configuredIds = [
        this._config.level_entity,
        this._config.threshold_entity,
        this._config.status_entity,
        this._config.forecast_entity,
        this._config.forecast_status_entity,
        this._config.forecast_details_entity,
      ];
      return [
        source,
        JSON.stringify(this.activeLocale()),
        openWithAvailable,
        ...configuredIds.map((entityId) => `${entityId ?? ""}:${Boolean(entityId && this._hass?.states[entityId])}`),
      ].join("|");
    }
    const resolution = this._config.device_id
      ? this.deviceResolutions.get(this._config.device_id)
      : undefined;
    return `${JSON.stringify(this.activeLocale())}|${source}|${openWithAvailable}|${this._config.device_id ?? ""}|${this.registryLoading}|${this.registryError ?? ""}|${resolution?.missing.join(",") ?? ""}|${resolution?.duplicates.join(",") ?? ""}|${resolution?.disabled.join(",") ?? ""}`;
  }

  private updateFormHass(): void {
    this.shadowRoot?.querySelectorAll<HTMLElement & Record<string, unknown>>("ha-form")
      .forEach((form) => { form.hass = this._hass; });
  }

  private updateConfig(changes: Partial<EditorConfig>, rerender = true): void {
    if (!this._config) return;
    this._config = { ...this._config, ...changes };
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true,
      composed: true,
      detail: { config: this._config },
    }));
    if (rerender) this.render();
  }

  private activeLocale(): NumberLocale {
    return this.formattingLocale ?? { language: resolveLanguage() };
  }

  private activeLanguage(): string {
    return resolveLanguage(this.activeLocale().language);
  }

  private render(): void {
    if (!this.shadowRoot || !this._config) return;
    const copy = getTranslations(resolveLocale(this.activeLanguage()));
    const displayMode = this._config.display_mode ?? "both";
    const configuredMetricMode = this._config.metric_mode ?? "level";
    const sectionOrder = this._config.section_order ?? "tank-first";
    const showDetailsControls = displayMode !== "tank";
    const config = this._config;
    const source = saltWatchDataSource(config as SaltWatchCardConfig);
    const automaticSource = source === "device";
    const webInterfaceEnabled = config.show_web_interface === true;
    const showOpenWith = webInterfaceEnabled && hasChromiumLink(this._hass);
    const chromiumHelp = showOpenWith && config.web_interface_open_with === "chromium_link";
    const addressHelp = automaticSource ? copy.webInterfaceAutomaticHelp : copy.webInterfaceManualHelp;
    const resolution = automaticSource && config.device_id
      ? this.deviceResolutions.get(config.device_id)
      : undefined;
    const automaticComplete = Boolean(resolution?.entities && resolution.disabled.length === 0);
    const levelEntityId = config.level_entity?.trim();
    const customComplete = Boolean(levelEntityId);
    const customLevelMissing = Boolean(
      levelEntityId && this._hass && !this._hass.states[levelEntityId],
    );
    const complete = automaticSource ? automaticComplete : customComplete && !customLevelMissing;
    const hasForecast = automaticSource || Boolean(config.forecast_entity?.trim());
    const metricMode = hasForecast ? configuredMetricMode : "level";
    const problems = resolution ? [
      ...resolution.missing.map(saltWatchRoleLabel),
      ...resolution.duplicates.map((role) => `${saltWatchRoleLabel(role)} (${copy.duplicate})`),
      ...resolution.disabled.map((role) => `${saltWatchRoleLabel(role)} (${copy.disabled})`),
    ] : [];
    const deviceOptions = [...this.deviceResolutions.keys()].map((deviceId) => ({
      value: deviceId,
      label: this.deviceLabel(deviceId),
    })).sort((left, right) => left.label.localeCompare(right.label));
    const hasSelection = Boolean(config.device_id);
    const automaticNotice = this.registryLoading
      ? { tone: "info", icon: "i", title: copy.selectDeviceTitle, text: copy.loadingDevices }
      : this.registryError
        ? { tone: "error", icon: "!", title: copy.registryError, text: this.registryError }
        : !hasSelection
          ? {
              tone: "info",
              icon: "i",
              title: deviceOptions.length === 0 ? copy.noDevicesTitle : copy.selectDeviceTitle,
              text: deviceOptions.length === 0 ? copy.noDevicesFound : copy.selectDeviceHelp,
            }
          : automaticComplete
            ? { tone: "success", icon: "✓", title: copy.detectedTitle, text: copy.detectedText }
            : resolution
              ? {
                  tone: "warning",
                  icon: "!",
                  title: copy.incompleteDevice,
                  text: problems.length > 0 ? problems.join(", ") : copy.incompleteDeviceHelp,
                }
              : {
                  tone: "error",
                  icon: "!",
                  title: copy.deviceUnavailableTitle,
                  text: copy.deviceUnavailableHelp,
                };
    const customNotice = !levelEntityId
      ? {
          tone: "info",
          icon: "i",
          title: copy.levelEntityRequiredTitle,
          text: copy.levelEntityRequiredHelp,
        }
      : customLevelMissing
        ? {
            tone: "error",
            icon: "!",
            title: copy.entityNotFound,
            text: levelEntityId,
          }
        : {
            tone: "success",
            icon: "✓",
            title: copy.customEntityReadyTitle,
            text: copy.customEntityReadyText,
          };
    const notice = automaticSource ? automaticNotice : customNotice;
    const entitySchema: Array<Record<string, unknown>> = [
      { name: "level_entity", required: true, selector: { entity: {} } },
      { name: "threshold_entity", selector: { entity: {} } },
      ...(!config.threshold_entity?.trim() ? [{
        name: "low_threshold",
        selector: {
          number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" },
        },
      }] : []),
      { name: "status_entity", selector: { entity: {} } },
      { name: "forecast_entity", selector: { entity: {} } },
    ];

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <div class="editor">
        <section class="section device-section">
          <h3>${copy.dataSource}</h3>
          <div class="segments source-segments" role="group" aria-label="${copy.dataSource}">
            ${this.segmentButton("source", "device", copy.saltWatchDevice, source)}
            ${this.segmentButton("source", "entities", copy.otherDevice, source)}
          </div>
          ${automaticSource ? `
            <div class="source-fields" id="device-form"></div>
          ` : `
            <small class="source-copy">${escapeAttribute(copy.customEntityHelp)}</small>
            <div class="source-fields" id="entity-form"></div>
            ${hasForecast ? `<details class="mapping-fold" id="forecast-mapping" ${this.forecastMappingOpen ? "open" : ""}>
              <summary><span><strong>${copy.forecastMapping}</strong><small>${copy.forecastMappingHelp}</small></span><span class="chevron">⌄</span></summary>
              <div class="mapping-content" id="forecast-form"></div>
            </details>` : ""}
          `}
          <div class="notice ${notice.tone}" role="status" aria-live="polite">
            <span class="notice-icon" aria-hidden="true">${notice.icon}</span>
            <span class="notice-copy"><strong>${escapeAttribute(notice.title)}</strong><small>${escapeAttribute(notice.text)}</small></span>
          </div>
        </section>

        ${complete ? `<section class="section">
          <h3>${copy.cardLayout}</h3>
          <div class="layout-options" role="group" aria-label="${copy.cardLayout}">
            ${this.layoutButton("both", copy.tankDetails, displayMode)}
            ${this.layoutButton("tank", copy.tankOnly, displayMode)}
            ${this.layoutButton("details", copy.percentageOnly, displayMode)}
          </div>
          ${displayMode === "both" ? `
            <div class="sub-control">
              <label>${copy.sectionOrder}</label>
              <div class="segments" role="group" aria-label="${copy.sectionOrder}">
                ${this.segmentButton("section_order", "tank-first", copy.tankFirst, sectionOrder)}
                ${this.segmentButton("section_order", "details-first", copy.detailsFirst, sectionOrder)}
              </div>
            </div>` : ""}
        </section>

        ${showDetailsControls ? `<section class="section compact-section values-section">
          <h3>${copy.values}</h3>
          ${hasForecast ? `<div class="segments three" role="group" aria-label="${copy.values}">
            ${this.segmentButton("metric_mode", "level", copy.level, metricMode)}
            ${this.segmentButton("metric_mode", "forecast", copy.forecast, metricMode)}
            ${this.segmentButton("metric_mode", "both", copy.both, metricMode)}
          </div>` : ""}
          ${metricMode === "level" ? '<div id="precision-form"></div>' : metricMode === "both" ? `<ha-input-helper-text>${escapeAttribute(copy.combinedPrecisionHelp)}</ha-input-helper-text>` : ""}
        </section>` : ""}

        ${showDetailsControls ? `<section class="section compact-section">
          <h3>${copy.visible}</h3>
          <div id="visible-elements-form"></div>
        </section>` : ""}

        <section class="section web-interface-settings">
          <h3>${copy.webInterface}</h3>
          <div id="web-interface-toggle"></div>
          ${showOpenWith ? `<div class="web-interface-field"${chromiumHelp ? ' role="group" aria-describedby="web-interface-chromium-help"' : ""}>
            <div id="web-interface-options"></div>
            ${chromiumHelp ? `<ha-input-helper-text id="web-interface-chromium-help">${escapeAttribute(copy.webInterfaceChromiumHelp)}</ha-input-helper-text>` : ""}
          </div>` : ""}
          ${webInterfaceEnabled ? `<div class="web-interface-field" role="group" aria-describedby="web-interface-address-help">
            <div id="web-interface-address"></div>
            <ha-input-helper-text id="web-interface-address-help">${escapeAttribute(addressHelp)}</ha-input-helper-text>
          </div>` : ""}
        </section>

        <details class="fold" id="actions" ${this.actionsOpen ? "open" : ""}>
          <summary><span><strong>${copy.actions}</strong><small>${copy.actionsHelp}</small></span><span class="chevron">⌄</span></summary>
          <div class="fold-content" id="actions-form"></div>
        </details>` : ""}
      </div>`;

    if (automaticSource) {
      this.setupForm("device-form", [
        { name: "device_id", required: true, selector: { select: { mode: "dropdown", options: deviceOptions } } },
      ], { device_id: config.device_id }, { device_id: copy.saltWatchDevice });
    } else {
      this.setupForm("entity-form", entitySchema, {
        level_entity: config.level_entity,
        threshold_entity: config.threshold_entity,
        low_threshold: config.low_threshold ?? 20,
        status_entity: config.status_entity,
        forecast_entity: config.forecast_entity,
      }, {
        level_entity: copy.levelEntity,
        threshold_entity: `${copy.thresholdEntity} (${copy.optional})`,
        low_threshold: copy.fixedLowThreshold,
        status_entity: `${copy.statusEntity} (${copy.optional})`,
        forecast_entity: `${copy.forecastEntity} (${copy.optional})`,
      });
      this.setupForm("forecast-form", [
        { name: "forecast_status_entity", selector: { entity: {} } },
        { name: "forecast_details_entity", selector: { entity: {} } },
      ], config, {
        forecast_status_entity: `${copy.forecastStatusEntity} (${copy.optional})`,
        forecast_details_entity: `${copy.forecastDetailsEntity} (${copy.optional})`,
      });
    }

    this.setupForm("precision-form", [{
      name: "decimals",
      required: true,
      selector: { select: { mode: "dropdown", options: [0, 1, 2].map((decimals) => ({
        value: String(decimals),
        label: `${decimals} — ${formatPercentage(25.4, this.activeLocale(), decimals)}`,
      })) } },
    }], { decimals: String(config.decimals ?? 0) }, { decimals: copy.decimalPlaces }, {
      helpers: { decimals: copy.decimalPlacesHelp },
      onChange: (value) => {
        const decimals = Number(value.decimals);
        if (decimals === 0 || decimals === 1 || decimals === 2) this.updateConfig({ decimals });
      },
    });

    this.setupForm("visible-elements-form", [
      { name: "show_status", selector: { boolean: {} } },
      { name: "show_low_marker", selector: { boolean: {} } },
    ], {
      show_status: config.show_status !== false,
      show_low_marker: config.show_low_marker !== false,
    }, {
      show_status: copy.status,
      show_low_marker: copy.marker,
    }, {
      helpers: { show_status: copy.statusHelp, show_low_marker: copy.markerHelp },
    });

    this.setupForm("actions-form", [
      { name: "tap_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "more-info" } } },
      { name: "hold_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "none" } } },
      { name: "double_tap_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "none" } } },
    ], config, { tap_action: copy.tap, hold_action: copy.hold, double_tap_action: copy.doubleTap });

    this.setupForm("web-interface-toggle", [
      { name: "show_web_interface", selector: { boolean: {} } },
    ], { show_web_interface: webInterfaceEnabled }, {
      show_web_interface: copy.showWebInterface,
    }, { helpers: { show_web_interface: copy.showWebInterfaceHelp } });

    this.setupForm("web-interface-options", [{
      name: "web_interface_open_with",
      required: true,
      selector: { select: { mode: "dropdown", options: [
        { value: "browser", label: copy.webInterfaceBrowser },
        { value: "chromium_link", label: "Chromium Link" },
      ] } },
    }], { web_interface_open_with: config.web_interface_open_with ?? "browser" }, {
      web_interface_open_with: copy.webInterfaceOpenWith,
    });
    this.setupForm("web-interface-address", [
      { name: "web_interface_url", selector: { text: { type: "url" } } },
    ], { web_interface_url: config.web_interface_url }, {
      web_interface_url: copy.webInterfaceUrl,
    }, {
      onChange: (value, form) => {
        const url = value.web_interface_url?.trim();
        if (url && !normalizeWebInterfaceUrl(url)) {
          form.error = { web_interface_url: copy.invalidWebInterfaceUrl };
          return;
        }
        form.error = undefined;
        if ((url || undefined) !== this._config?.web_interface_url) {
          this.updateConfig({ web_interface_url: url || undefined }, false);
        }
      },
    });

    this.shadowRoot.querySelectorAll<HTMLButtonElement>("button[data-field]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset.field as
          | "display_mode"
          | "metric_mode"
          | "section_order"
          | "source";
        const value = field === "source"
          ? button.dataset.value as SaltWatchDataSource
          : button.dataset.value;
        this.updateConfig({ [field]: value } as Partial<EditorConfig>);
      });
    });
    this.shadowRoot.querySelector<HTMLDetailsElement>("#actions")?.addEventListener("toggle", (event) => {
      this.actionsOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
    this.shadowRoot.querySelector<HTMLDetailsElement>("#forecast-mapping")?.addEventListener("toggle", (event) => {
      this.forecastMappingOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
  }

  private setupForm(
    hostId: string,
    schema: Array<Record<string, unknown>>,
    data: Record<string, unknown>,
    labels: Record<string, string>,
    options: FormOptions = {},
  ): void {
    const host = this.shadowRoot?.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    const form = document.createElement("ha-form") as EditorForm;
    form.hass = this._hass;
    form.data = data;
    form.schema = schema;
    form.computeLabel = (item: { name: string }) => labels[item.name] ?? item.name;
    if (options.helpers) {
      form.computeHelper = (item: { name: string }) => options.helpers?.[item.name];
    }
    form.addEventListener("value-changed", (event) => {
      const value = (event as CustomEvent<{ value?: Partial<EditorConfig> }>).detail?.value;
      if (!value) return;
      if (options.onChange) options.onChange(value, form);
      else this.updateConfig(value);
    });
    host.append(form);
  }

  private deviceLabel(deviceId: string): string {
    const device = this._hass?.devices[deviceId];
    const base = device?.name_by_user || device?.name || "SaltWatch";
    const duplicateName = Object.keys(this._hass?.devices ?? {}).filter((id) => {
      const candidate = this._hass?.devices[id];
      return (candidate?.name_by_user || candidate?.name) === base && this.deviceResolutions.has(id);
    }).length > 1;
    return duplicateName ? `${base} · ${deviceId.slice(-6)}` : base;
  }

  private layoutButton(value: string, label: string, selected: string): string {
    const active = value === selected;
    return `<button type="button" class="layout-option${active ? " selected" : ""}" data-field="display_mode" data-value="${value}" aria-pressed="${active}">
      <span class="layout-preview layout-${value}" aria-hidden="true"><i></i><b></b></span>
      <span>${escapeAttribute(label)}</span>
      ${active ? '<span class="selected-mark">✓</span>' : ""}
    </button>`;
  }

  private segmentButton(field: string, value: string, label: string, selected: string): string {
    const active = value === selected;
    return `<button type="button" class="segment${active ? " selected" : ""}" data-field="${field}" data-value="${value}" aria-pressed="${active}">${escapeAttribute(label)}</button>`;
  }

  private styles(): string {
    return `
      :host { display:block; color:var(--primary-text-color); --sw-accent:var(--primary-color,#03a9f4); font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif); }
      * { box-sizing:border-box; }
      .editor { display:grid; gap:16px; padding:4px 0 16px; }
      .section,.fold { margin:0; padding:18px; border:1px solid var(--divider-color,#ddd); border-radius:14px; background:var(--card-background-color,var(--ha-card-background,#fff)); }
      h3 { margin:0 0 16px; font-size:16px; font-weight:650; }
      .notice { display:flex; align-items:center; gap:12px; margin-top:14px; padding:13px 14px; border-radius:11px; }
      .notice.info { color:var(--primary-color,#03a9f4); background:color-mix(in srgb,var(--primary-color,#03a9f4) 9%,transparent); }
      .notice.success { color:var(--success-color,#43a047); background:color-mix(in srgb,var(--success-color,#43a047) 11%,transparent); }
      .notice.warning { color:var(--warning-color,#ffa000); background:color-mix(in srgb,var(--warning-color,#ffa000) 12%,transparent); }
      .notice.error { color:var(--error-color,#db4437); background:color-mix(in srgb,var(--error-color,#db4437) 11%,transparent); }
      .notice-icon { display:grid; place-items:center; flex:0 0 25px; width:25px; height:25px; border:2px solid currentColor; border-radius:50%; font-weight:800; }
      .notice-copy { min-width:0; display:grid; gap:2px; color:var(--primary-text-color); }
      .notice-copy strong { font-size:14px; }
      small { display:block; color:var(--secondary-text-color); font-size:12px; line-height:1.4; font-weight:400; }
      button { font:inherit; }
      .layout-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .layout-option { position:relative; min-width:0; display:grid; justify-items:center; gap:9px; padding:13px 7px 11px; border:1px solid var(--divider-color,#ddd); border-radius:11px; color:var(--primary-text-color); background:transparent; cursor:pointer; font-size:12px; }
      .layout-option.selected { border:2px solid var(--sw-accent); padding:12px 6px 10px; background:color-mix(in srgb,var(--sw-accent) 7%,transparent); }
      .selected-mark { position:absolute; top:6px; right:7px; display:grid; place-items:center; width:17px; height:17px; border-radius:50%; color:var(--text-primary-color,#fff); background:var(--sw-accent); font-size:11px; }
      .layout-preview { width:70px; height:46px; display:grid; gap:3px; padding:5px; border:1px solid var(--divider-color,#bbb); border-radius:6px; background:var(--primary-background-color,#fafafa); }
      .layout-preview i,.layout-preview b { display:block; border-radius:3px; }
      .layout-preview i { background:linear-gradient(180deg,#cfd7d8,#657077); }
      .layout-preview b { background:var(--secondary-text-color,#777); opacity:.55; }
      .layout-both { grid-template-columns:1fr 1fr; }.layout-both i,.layout-both b { height:34px; }
      .layout-tank { grid-template-columns:1fr; }.layout-tank i { height:34px; }.layout-tank b { display:none; }
      .layout-details { grid-template-columns:1fr; }.layout-details i { display:none; }.layout-details b { height:34px; }
      .sub-control { display:grid; gap:8px; margin-top:16px; }
      .sub-control>label { color:var(--secondary-text-color); font-size:13px; }
      .segments { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); padding:3px; border-radius:10px; background:var(--secondary-background-color,#eee); }
      .segments.three { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .source-segments { margin-bottom:12px; }
      .source-copy { margin:0 2px 12px; }
      .source-fields { min-width:0; }
      .segment { min-height:38px; padding:7px; border:0; border-radius:8px; color:var(--secondary-text-color); background:transparent; cursor:pointer; font-size:13px; }
      .segment.selected { color:var(--primary-text-color); background:var(--card-background-color,#fff); box-shadow:0 1px 3px rgba(0,0,0,.16); font-weight:600; }
      .compact-section h3 { margin-bottom:12px; }
      .fold { padding:0; overflow:hidden; }
      summary { min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 16px; cursor:pointer; list-style:none; }
      summary::-webkit-details-marker { display:none; }
      summary>span:first-child { display:grid; gap:2px; }
      summary strong { font-size:14px; }
      .chevron { font-size:20px; transform:rotate(0); transition:.15s; }
      details[open] .chevron { transform:rotate(180deg); }
      .fold-content { display:grid; gap:16px; padding:16px; border-top:1px solid var(--divider-color,#ddd); }
      .values-section { display:grid; gap:var(--ha-space-3,12px); }
      .values-section h3 { margin:0; }
      .web-interface-settings { display:grid; gap:var(--ha-space-3,12px); }
      .web-interface-settings h3 { margin:0; }
      .web-interface-field ha-input-helper-text { display:block; margin-block-start:var(--ha-space-2,8px); }
      #web-interface-address { --ha-input-padding-bottom:0; }
      .mapping-fold { margin-top:10px; border-top:1px solid var(--divider-color,#ddd); }
      .mapping-fold summary { min-height:54px; padding:11px 2px; }
      .mapping-content { padding:2px 0 0; }
      ha-form { display:block; }
      @media (max-width:520px) { .layout-options { grid-template-columns:1fr; }.layout-option { grid-template-columns:82px 1fr; align-items:center; justify-items:start; text-align:left; }.selected-mark { top:50%; transform:translateY(-50%); } }
    `;
  }
}
