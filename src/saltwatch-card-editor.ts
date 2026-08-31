import type { HomeAssistant, SaltWatchCardConfig } from "./types";

type RelatedKey = "status_entity" | "threshold_entity" | "forecast_entity" | "forecast_status_entity";
type EditorConfig = Omit<SaltWatchCardConfig, "type"> & { type?: string };

const RELATED_ENTITIES: Array<{
  key: RelatedKey;
  domain: string;
  suffix: string;
}> = [
  { key: "status_entity", domain: "sensor", suffix: "salt_status" },
  { key: "threshold_entity", domain: "number", suffix: "low_salt_threshold" },
  { key: "forecast_entity", domain: "sensor", suffix: "estimated_days_until_low_salt" },
  { key: "forecast_status_entity", domain: "sensor", suffix: "forecast_status" },
];
const SUPPORTED_ACTIONS = ["more-info", "toggle", "navigate", "url", "perform-action", "assist", "none"];

function objectId(entityId: string): string {
  return entityId.slice(entityId.indexOf(".") + 1);
}

function sharedPrefixScore(left: string, right: string): number {
  const leftParts = left.split("_");
  const rightParts = right.split("_");
  let score = 0;
  while (score < leftParts.length && leftParts[score] === rightParts[score]) score += 1;
  return score;
}

export function detectRelatedEntities(
  hass: HomeAssistant | undefined,
  levelEntity: string | undefined,
): Partial<Record<RelatedKey, string>> {
  if (!hass || !levelEntity) return {};
  const levelObjectId = objectId(levelEntity);
  const base = levelObjectId.endsWith("_salt_level")
    ? levelObjectId.slice(0, -"salt_level".length)
    : "";
  const ids = Object.keys(hass.states);

  return Object.fromEntries(RELATED_ENTITIES.flatMap(({ key, domain, suffix }) => {
    const exact = base ? `${domain}.${base}${suffix}` : undefined;
    if (exact && hass.states[exact]) return [[key, exact]];
    if (base) return [];

    const candidates = ids
      .filter((id) => id.startsWith(`${domain}.`) && objectId(id).endsWith(suffix))
      .map((id) => ({ id, score: sharedPrefixScore(levelObjectId, objectId(id)) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const best = candidates[0];
    return best && best.score > 0 ? [[key, best.id]] : [];
  })) as Partial<Record<RelatedKey, string>>;
}

const ENGLISH_COPY = {
  liveData: "Live data",
  saltLevel: "Salt level",
  detectedTitle: "SaltWatch entities detected",
  detectedText: "Status, threshold and forecast are connected automatically.",
  missingTitle: "Some SaltWatch entities weren’t found",
  missingText: "Salt level is connected. Choose the missing status, threshold, or forecast entities manually.",
  configure: "Configure",
  cardLayout: "Card layout",
  tankDetails: "Tank + details",
  tankOnly: "Tank only",
  detailsOnly: "Details only",
  sectionOrder: "Section order",
  tankFirst: "Tank first",
  detailsFirst: "Details first",
  values: "Values",
  level: "Salt level",
  forecast: "Forecast",
  both: "Both",
  visible: "Visible elements",
  status: "Status",
  statusHelp: "Show sensor health above the values",
  marker: "Low marker summary",
  markerHelp: "Show the threshold below the values",
  advanced: "Advanced",
  advancedHelp: "Entity overrides and fallback threshold",
  actions: "Actions",
  actionsHelp: "Tap, hold and double-tap",
  statusEntity: "Salt status",
  thresholdEntity: "Low threshold",
  forecastEntity: "Days until low salt",
  forecastStatusEntity: "Forecast status",
  fallback: "Fallback low threshold",
  tap: "Tap action",
  hold: "Hold action",
  doubleTap: "Double-tap action",
} as const;

type EditorCopy = { [Key in keyof typeof ENGLISH_COPY]: string };

const GERMAN_COPY: EditorCopy = {
    liveData: "Live-Daten",
    saltLevel: "Salzstand",
    detectedTitle: "SaltWatch-Entitäten erkannt",
    detectedText: "Status, Grenzwert und Prognose wurden automatisch verbunden.",
    missingTitle: "Einige SaltWatch-Entitäten wurden nicht gefunden",
    missingText: "Der Salzstand ist verbunden. Wähle fehlende Status-, Grenzwert- oder Prognose-Entitäten manuell aus.",
    configure: "Konfigurieren",
    cardLayout: "Kartenlayout",
    tankDetails: "Tank + Details",
    tankOnly: "Nur Tank",
    detailsOnly: "Nur Details",
    sectionOrder: "Reihenfolge",
    tankFirst: "Tank zuerst",
    detailsFirst: "Details zuerst",
    values: "Werte",
    level: "Salzstand",
    forecast: "Prognose",
    both: "Beide",
    visible: "Sichtbare Elemente",
    status: "Status",
    statusHelp: "Sensorzustand über den Werten anzeigen",
    marker: "Niedrig-Markierung",
    markerHelp: "Grenzwert unter den Werten anzeigen",
    advanced: "Erweitert",
    advancedHelp: "Entitäten überschreiben und Ersatz-Grenzwert",
    actions: "Aktionen",
    actionsHelp: "Tippen, halten und doppelt tippen",
    statusEntity: "Salzstatus",
    thresholdEntity: "Niedrig-Grenzwert",
    forecastEntity: "Tage bis Salz niedrig",
    forecastStatusEntity: "Prognosestatus",
    fallback: "Ersatz-Grenzwert",
    tap: "Tippen",
    hold: "Halten",
    doubleTap: "Doppelt tippen",
};

function editorCopy(): EditorCopy {
  return document.documentElement.lang.toLowerCase().startsWith("de")
    ? GERMAN_COPY
    : ENGLISH_COPY;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export class SaltWatchCardEditor extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: EditorConfig;
  private advancedOpen = false;
  private actionsOpen = false;

  public constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public set hass(hass: HomeAssistant) {
    const previousRenderKey = this.hassRenderKey();
    this._hass = hass;
    const configChanged = this.autoConfigureDetected();
    const shouldRender = !this.shadowRoot?.querySelector(".editor") ||
      configChanged ||
      previousRenderKey !== this.hassRenderKey();
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
    this.autoConfigureDetected();
    this.render();
  }

  private autoConfigureDetected(): boolean {
    if (!this._hass || !this._config?.entity) return false;
    const detected = detectRelatedEntities(this._hass, this._config.entity);
    const additions = Object.fromEntries(
      Object.entries(detected).filter(([key]) => !this._config?.[key as RelatedKey]),
    );
    if (Object.keys(additions).length === 0) return false;
    this.updateConfig(additions, false);
    return true;
  }

  private hassRenderKey(): string {
    if (!this._config) return "";
    return [
      this._config.entity,
      ...RELATED_ENTITIES.flatMap(({ key }) => {
        const entityId = this._config?.[key];
        return [entityId ?? "", entityId && this._hass?.states[entityId] ? "present" : "missing"];
      }),
    ].join("|");
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

  private relatedState(): { connected: number; total: number } {
    if (!this._config || !this._hass) return { connected: 0, total: RELATED_ENTITIES.length };
    return {
      connected: RELATED_ENTITIES.filter(({ key }) => {
        const entityId = this._config?.[key];
        return Boolean(entityId && this._hass?.states[entityId]);
      }).length,
      total: RELATED_ENTITIES.length,
    };
  }

  private render(): void {
    if (!this.shadowRoot || !this._config) return;
    const copy = editorCopy();
    const displayMode = this._config.display_mode ?? "both";
    const metricMode = this._config.metric_mode ?? "level";
    const sectionOrder = this._config.section_order ?? "tank-first";
    const showDetailsControls = displayMode !== "tank";
    const related = this.relatedState();
    const complete = related.connected === related.total;
    const config = this._config;

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <div class="editor">
        <section class="section live-data">
          <h3>${copy.liveData}</h3>
          <div id="level-form"></div>
          <div class="notice ${complete ? "success" : "warning"}" role="status">
            <span class="notice-icon">${complete ? "✓" : "!"}</span>
            <span class="notice-copy"><strong>${complete ? copy.detectedTitle : copy.missingTitle}</strong><small>${complete ? copy.detectedText : copy.missingText}</small></span>
            ${complete ? "" : `<button class="configure" type="button">${copy.configure}</button>`}
          </div>
        </section>

        <section class="section">
          <h3>${copy.cardLayout}</h3>
          <div class="layout-options" role="group" aria-label="${copy.cardLayout}">
            ${this.layoutButton("both", copy.tankDetails, displayMode)}
            ${this.layoutButton("tank", copy.tankOnly, displayMode)}
            ${this.layoutButton("details", copy.detailsOnly, displayMode)}
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

        ${showDetailsControls ? `<section class="section compact-section">
          <h3>${copy.values}</h3>
          <div class="segments three" role="group" aria-label="${copy.values}">
            ${this.segmentButton("metric_mode", "level", copy.level, metricMode)}
            ${this.segmentButton("metric_mode", "forecast", copy.forecast, metricMode)}
            ${this.segmentButton("metric_mode", "both", copy.both, metricMode)}
          </div>
        </section>

        <section class="section compact-section">
          <h3>${copy.visible}</h3>
          ${this.toggle("show_status", copy.status, copy.statusHelp, config.show_status !== false)}
          ${this.toggle("show_low_marker", copy.marker, copy.markerHelp, config.show_low_marker !== false)}
        </section>` : ""}

        <details class="fold" id="advanced" ${this.advancedOpen ? "open" : ""}>
          <summary><span><strong>${copy.advanced}</strong><small>${copy.advancedHelp}</small></span><span class="chevron">⌄</span></summary>
          <div class="fold-content" id="advanced-form"></div>
        </details>

        <details class="fold" id="actions" ${this.actionsOpen ? "open" : ""}>
          <summary><span><strong>${copy.actions}</strong><small>${copy.actionsHelp}</small></span><span class="chevron">⌄</span></summary>
          <div class="fold-content" id="actions-form"></div>
        </details>
      </div>`;

    this.setupForm("level-form", [
      { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
    ], { entity: config.entity }, { entity: copy.saltLevel });

    this.setupForm("advanced-form", [
      { name: "status_entity", selector: { entity: {} } },
      { name: "threshold_entity", selector: { entity: {} } },
      { name: "forecast_entity", selector: { entity: { domain: "sensor" } } },
      { name: "forecast_status_entity", selector: { entity: {} } },
      { name: "low_threshold", selector: { number: { min: 0, max: 100, step: 1, mode: "slider" } } },
    ], config, {
      status_entity: copy.statusEntity,
      threshold_entity: copy.thresholdEntity,
      forecast_entity: copy.forecastEntity,
      forecast_status_entity: copy.forecastStatusEntity,
      low_threshold: copy.fallback,
    });

    this.setupForm("actions-form", [
      { name: "tap_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "more-info" } }, context: { entity_id: "entity" } },
      { name: "hold_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "none" } }, context: { entity_id: "entity" } },
      { name: "double_tap_action", selector: { ui_action: { actions: SUPPORTED_ACTIONS, default_action: "none" } }, context: { entity_id: "entity" } },
    ], config, { tap_action: copy.tap, hold_action: copy.hold, double_tap_action: copy.doubleTap });

    this.shadowRoot.querySelectorAll<HTMLButtonElement>("button[data-field]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset.field as "display_mode" | "metric_mode" | "section_order";
        this.updateConfig({ [field]: button.dataset.value } as Partial<EditorConfig>);
      });
    });
    this.shadowRoot.querySelectorAll<HTMLInputElement>("input[data-field]").forEach((input) => {
      input.addEventListener("change", () => this.updateConfig({ [input.dataset.field!]: input.checked }));
    });
    this.shadowRoot.querySelector<HTMLButtonElement>(".configure")?.addEventListener("click", () => {
      this.advancedOpen = true;
      this.render();
      this.shadowRoot?.querySelector("#advanced")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    this.shadowRoot.querySelector<HTMLDetailsElement>("#advanced")?.addEventListener("toggle", (event) => {
      this.advancedOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
    this.shadowRoot.querySelector<HTMLDetailsElement>("#actions")?.addEventListener("toggle", (event) => {
      this.actionsOpen = (event.currentTarget as HTMLDetailsElement).open;
    });
  }

  private setupForm(
    hostId: string,
    schema: Array<Record<string, unknown>>,
    data: Record<string, unknown>,
    labels: Record<string, string>,
  ): void {
    const host = this.shadowRoot?.querySelector<HTMLElement>(`#${hostId}`);
    if (!host) return;
    const form = document.createElement("ha-form") as HTMLElement & Record<string, unknown>;
    form.hass = this._hass;
    form.data = data;
    form.schema = schema;
    form.computeLabel = (item: { name: string }) => labels[item.name] ?? item.name;
    form.addEventListener("value-changed", (event) => {
      const value = (event as CustomEvent<{ value?: Partial<EditorConfig> }>).detail?.value;
      if (!value) return;
      this.updateConfig(value);
      if (hostId === "level-form") {
        this.autoConfigureDetected();
        this.render();
      }
    });
    host.append(form);
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

  private toggle(field: string, label: string, helper: string, checked: boolean): string {
    return `<label class="toggle-row"><span><strong>${escapeAttribute(label)}</strong><small>${escapeAttribute(helper)}</small></span><span class="switch"><input type="checkbox" data-field="${field}" ${checked ? "checked" : ""}><i></i></span></label>`;
  }

  private styles(): string {
    return `
      :host { display:block; color:var(--primary-text-color); --sw-accent:var(--primary-color,#03a9f4); font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif); }
      * { box-sizing:border-box; }
      .editor { display:grid; gap:16px; padding:4px 0 16px; }
      .section,.fold { margin:0; padding:18px; border:1px solid var(--divider-color,#ddd); border-radius:14px; background:var(--card-background-color,var(--ha-card-background,#fff)); }
      h3 { margin:0 0 16px; font-size:16px; font-weight:650; }
      .notice { display:flex; align-items:center; gap:12px; margin-top:14px; padding:13px 14px; border-radius:11px; }
      .notice.success { color:var(--success-color,#43a047); background:color-mix(in srgb,var(--success-color,#43a047) 11%,transparent); }
      .notice.warning { color:var(--warning-color,#ffa000); background:color-mix(in srgb,var(--warning-color,#ffa000) 12%,transparent); }
      .notice-icon { display:grid; place-items:center; flex:0 0 25px; width:25px; height:25px; border:2px solid currentColor; border-radius:50%; font-weight:800; }
      .notice-copy { min-width:0; display:grid; gap:2px; color:var(--primary-text-color); }
      .notice-copy strong { font-size:14px; }
      small { display:block; color:var(--secondary-text-color); font-size:12px; line-height:1.4; font-weight:400; }
      button { font:inherit; }
      .configure { margin-left:auto; padding:7px 10px; border:0; color:var(--sw-accent); background:transparent; cursor:pointer; font-weight:650; }
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
      .segment { min-height:38px; padding:7px; border:0; border-radius:8px; color:var(--secondary-text-color); background:transparent; cursor:pointer; font-size:13px; }
      .segment.selected { color:var(--primary-text-color); background:var(--card-background-color,#fff); box-shadow:0 1px 3px rgba(0,0,0,.16); font-weight:600; }
      .compact-section h3 { margin-bottom:12px; }
      .toggle-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:9px 0; cursor:pointer; }
      .toggle-row+ .toggle-row { border-top:1px solid color-mix(in srgb,var(--divider-color,#ddd) 60%,transparent); }
      .toggle-row>span:first-child { display:grid; gap:2px; }
      .toggle-row strong { font-size:14px; font-weight:500; }
      .switch { position:relative; flex:0 0 40px; width:40px; height:24px; }
      .switch input { position:absolute; opacity:0; inset:0; }
      .switch i { display:block; width:40px; height:24px; border-radius:14px; background:var(--disabled-color,#9e9e9e); transition:.15s; }
      .switch i::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.35); transition:.15s; }
      .switch input:checked+i { background:var(--sw-accent); }.switch input:checked+i::after { transform:translateX(16px); }
      .fold { padding:0; overflow:hidden; }
      summary { min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 16px; cursor:pointer; list-style:none; }
      summary::-webkit-details-marker { display:none; }
      summary>span:first-child { display:grid; gap:2px; }
      summary strong { font-size:14px; }
      .chevron { font-size:20px; transform:rotate(0); transition:.15s; }
      details[open] .chevron { transform:rotate(180deg); }
      .fold-content { padding:2px 16px 16px; border-top:1px solid var(--divider-color,#ddd); }
      ha-form { display:block; }
      @media (max-width:520px) { .layout-options { grid-template-columns:1fr; }.layout-option { grid-template-columns:82px 1fr; align-items:center; justify-items:start; text-align:left; }.selected-mark { top:50%; transform:translateY(-50%); } }
    `;
  }
}
