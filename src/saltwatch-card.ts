import saltTextureUrl from "../assets/salt-tablets.webp?inline";
import {
  formatPercentage,
  localize,
  resolveLocale,
} from "./localize";
import type { SupportedLocale } from "./localize";
import {
  clamp,
  deriveStatus,
  entityNumber,
  escapeHtml,
} from "./model";
import type {
  HassEntity,
  HomeAssistant,
  LovelaceActionConfig,
  SaltWatchCardConfig,
} from "./types";

const DEFAULT_THRESHOLD = 20;
const DEFAULT_TAP_ACTION: LovelaceActionConfig = { action: "more-info" };
const DEFAULT_NO_ACTION: LovelaceActionConfig = { action: "none" };
const HOLD_DELAY = 500;
const DOUBLE_TAP_DELAY = 250;
const ACTIONS = ["more-info", "toggle", "navigate", "url", "perform-action", "assist", "none"];

type HassStates = HomeAssistant["states"];
type ActionType = "tap" | "hold" | "double_tap";
type Unsubscribe = () => void;

interface StatesContextRequestEvent extends CustomEvent {
  context: "states";
  subscribe: true;
  callback: (states: HassStates, unsubscribe: Unsubscribe) => void;
}

function entity(states: HassStates | undefined, entityId: string | undefined): HassEntity | undefined {
  return entityId ? states?.[entityId] : undefined;
}

function validatedThreshold(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Fallback low threshold must be a number between 0 and 100.");
  }
  if (value < 0 || value > 100) {
    throw new Error("Fallback low threshold must be between 0 and 100.");
  }
  return value;
}

function validatedAction(value: unknown, fallback: LovelaceActionConfig): LovelaceActionConfig {
  if (value === undefined) return fallback;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { action?: unknown }).action !== "string" ||
    !ACTIONS.includes((value as { action: string }).action)
  ) {
    throw new Error("Card actions must use a supported Home Assistant action.");
  }
  return value as LovelaceActionConfig;
}

function formatForecastDays(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function forecastStatusLabel(state: string | undefined, locale: SupportedLocale): string {
  const normalized = state?.trim().toLowerCase() ?? "";
  if (normalized.includes("confirming") && normalized.includes("refill")) {
    return localize("forecastConfirmingRefill", locale);
  }
  if (normalized.includes("insufficient")) {
    return localize("forecastInsufficientChange", locale);
  }
  if (normalized.includes("waiting") && normalized.includes("measurement")) {
    return localize("forecastWaitingForMeasurement", locale);
  }
  if (normalized.includes("waiting") && normalized.includes("time")) {
    return localize("forecastWaitingForTime", locale);
  }
  if (normalized.includes("learning")) return localize("forecastLearning", locale);
  if (normalized.includes("initializing")) return localize("forecastInitializing", locale);
  if (normalized.includes("calibration")) return localize("calibrationRequired", locale);
  if (normalized.includes("fault") || normalized.includes("error")) {
    return localize("sensorFault", locale);
  }
  if (normalized.includes("low")) return localize("lowThresholdReached", locale);
  if (!normalized || normalized === "available" || normalized === "unknown" || normalized === "unavailable") {
    return localize("forecastUnavailable", locale);
  }
  return state?.trim() || localize("forecastUnavailable", locale);
}

export class SaltWatchCard extends HTMLElement {
  private config?: SaltWatchCardConfig;
  private states?: HassStates;
  private unsubscribeStates?: Unsubscribe;
  private lastRenderKey?: string;
  private holdTimer?: ReturnType<typeof setTimeout>;
  private tapTimer?: ReturnType<typeof setTimeout>;
  private holdTriggered = false;
  private pointerOrigin?: { x: number; y: number };
  private languageObserver?: MutationObserver;
  private heightObserver?: ResizeObserver;
  private heightFrame?: number;
  private inferredFixedHeight = false;

  public constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public connectedCallback(): void {
    if (!this.languageObserver) {
      this.languageObserver = new MutationObserver(() => {
        this.lastRenderKey = undefined;
        this.render();
      });
      this.languageObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    }
    if (!this.unsubscribeStates) {
      const event = new CustomEvent("context-request", {
        bubbles: true,
        composed: true,
        cancelable: true,
      }) as StatesContextRequestEvent;
      event.context = "states";
      event.subscribe = true;
      event.callback = (states, unsubscribe) => {
        this.unsubscribeStates = unsubscribe;
        this.updateStates(states);
      };
      this.dispatchEvent(event);
    }
    if (!this.heightObserver && typeof ResizeObserver !== "undefined") {
      this.heightObserver = new ResizeObserver(() => this.scheduleHeightModeUpdate());
      this.heightObserver.observe(this);
    }
    this.scheduleHeightModeUpdate();
  }

  public disconnectedCallback(): void {
    this.unsubscribeStates?.();
    this.unsubscribeStates = undefined;
    this.languageObserver?.disconnect();
    this.languageObserver = undefined;
    this.heightObserver?.disconnect();
    this.heightObserver = undefined;
    if (this.heightFrame !== undefined) cancelAnimationFrame(this.heightFrame);
    this.heightFrame = undefined;
    this.clearInteractionTimers();
  }

  public static getConfigForm(): Record<string, unknown> {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { domain: "sensor" } },
        },
        { name: "show_status", selector: { boolean: {} } },
        { name: "show_low_marker", selector: { boolean: {} } },
        {
          name: "display_mode",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "both", label: localize("tankAndPercentage") },
                { value: "tank", label: localize("tankOnly") },
                { value: "details", label: localize("percentageOnly") },
              ],
            },
          },
        },
        {
          name: "metric_mode",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "level", label: localize("saltLevelOnly") },
                { value: "forecast", label: localize("forecastOnly") },
                { value: "both", label: localize("levelAndForecast") },
              ],
            },
          },
        },
        {
          name: "section_order",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "tank-first", label: "Tank first" },
                { value: "details-first", label: "Details first" },
              ],
            },
          },
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "status_entity", selector: { entity: {} } },
            { name: "threshold_entity", selector: { entity: {} } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "forecast_entity", selector: { entity: { domain: "sensor" } } },
            { name: "forecast_status_entity", selector: { entity: {} } },
          ],
        },
        {
          name: "low_threshold",
          selector: { number: { min: 0, max: 100, step: 1, mode: "slider" } },
        },
        {
          type: "expandable",
          name: "actions",
          title: localize("actions"),
          flatten: true,
          schema: [
            {
              name: "tap_action",
              selector: { ui_action: { actions: ACTIONS, default_action: "more-info" } },
              context: { entity_id: "entity" },
            },
            {
              name: "hold_action",
              selector: { ui_action: { actions: ACTIONS, default_action: "none" } },
              context: { entity_id: "entity" },
            },
            {
              name: "double_tap_action",
              selector: { ui_action: { actions: ACTIONS, default_action: "none" } },
              context: { entity_id: "entity" },
            },
          ],
        },
      ],
      computeLabel: (schema: { name: string }) => {
        const labels: Record<string, string> = {
          entity: localize("estimatedLevelEntity"),
          show_status: localize("showStatus"),
          show_low_marker: localize("showLowMarker"),
          display_mode: localize("cardContent"),
          metric_mode: localize("valueDisplay"),
          section_order: "Section order",
          status_entity: localize("statusEntity"),
          threshold_entity: localize("thresholdEntity"),
          forecast_entity: localize("forecastEntity"),
          forecast_status_entity: localize("forecastStatusEntity"),
          low_threshold: localize("fallbackThreshold"),
          tap_action: localize("tapAction"),
          hold_action: localize("holdAction"),
          double_tap_action: localize("doubleTapAction"),
        };
        return labels[schema.name] ?? schema.name;
      },
      assertConfig: (config: Record<string, unknown>) => {
        if (config.low_threshold !== undefined) validatedThreshold(config.low_threshold);
        validatedAction(config.tap_action, DEFAULT_TAP_ACTION);
        validatedAction(config.hold_action, DEFAULT_NO_ACTION);
        validatedAction(config.double_tap_action, DEFAULT_NO_ACTION);
      },
    };
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement("saltwatch-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[] = [],
    entitiesFallback: string[] = [],
  ): Omit<SaltWatchCardConfig, "type"> {
    const candidates = [...entities, ...entitiesFallback, ...Object.keys(hass.states)];
    const unique = [...new Set(candidates)];
    const find = (...needles: string[]) =>
      unique.find((entityId) => needles.every((needle) => entityId.includes(needle)));

    const config: Omit<SaltWatchCardConfig, "type"> = {
      entity: find("saltwatch", "salt_level") ?? find("salt", "level") ?? "sensor.saltwatch_salt_level",
      low_threshold: DEFAULT_THRESHOLD,
      show_status: true,
      show_low_marker: true,
      display_mode: "both",
      metric_mode: "level",
      section_order: "tank-first",
      tap_action: DEFAULT_TAP_ACTION,
    };
    const status = find("saltwatch", "salt_status");
    const threshold = find("saltwatch", "low_salt_threshold");
    const forecast = find("saltwatch", "estimated_days_until_low_salt");
    const forecastStatus = find("saltwatch", "forecast_status");
    if (status) config.status_entity = status;
    if (threshold) config.threshold_entity = threshold;
    if (forecast) config.forecast_entity = forecast;
    if (forecastStatus) config.forecast_status_entity = forecastStatus;
    return config;
  }

  public setConfig(config: SaltWatchCardConfig): void {
    if (!config.entity || typeof config.entity !== "string") {
      throw new Error("SaltWatch Card requires an estimated salt level entity.");
    }

    this.clearInteractionTimers();
    const displayMode = config.display_mode === "tank" || config.display_mode === "details"
      ? config.display_mode
      : "both";
    const metricMode = config.metric_mode === "forecast" || config.metric_mode === "both"
      ? config.metric_mode
      : "level";
    const sectionOrder = config.section_order === "details-first" ? "details-first" : "tank-first";
    const lowThreshold = validatedThreshold(config.low_threshold ?? DEFAULT_THRESHOLD);
    if (config.grid_options?.rows === "auto") this.inferredFixedHeight = false;
    this.config = {
      ...config,
      low_threshold: lowThreshold,
      show_status: config.show_status ?? true,
      show_low_marker: config.show_low_marker ?? true,
      display_mode: displayMode,
      metric_mode: metricMode,
      section_order: sectionOrder,
      tap_action: validatedAction(config.tap_action, DEFAULT_TAP_ACTION),
      hold_action: validatedAction(config.hold_action, DEFAULT_NO_ACTION),
      double_tap_action: validatedAction(config.double_tap_action, DEFAULT_NO_ACTION),
    };
    this.lastRenderKey = undefined;
    this.render();
  }

  public getCardSize(): number {
    const measuredHeight = this.getBoundingClientRect().height;
    if (measuredHeight > 0) return Math.max(1, Math.ceil(measuredHeight / 50));
    if (this.config?.display_mode === "tank") return 12;
    if (this.config?.display_mode === "details") return 7;
    return 13;
  }

  public getGridOptions(): Record<string, string | number> {
    const displayMode = this.config?.display_mode ?? "both";

    if (displayMode === "tank") {
      return {
        columns: 6,
        min_columns: 3,
        rows: "auto",
        min_rows: 3,
      };
    }

    if (displayMode === "details") {
      return {
        columns: 6,
        min_columns: this.config?.metric_mode === "both" ? 6 : 3,
        rows: "auto",
        min_rows: 2,
      };
    }

    return {
      columns: 12,
      min_columns: 6,
      rows: "auto",
      min_rows: 4,
    };
  }

  private updateStates(states: HassStates): void {
    this.states = states;
    if (this.currentRenderKey() !== this.lastRenderKey) this.render();
  }

  private currentRenderKey(): string | undefined {
    if (!this.config || !this.states) return undefined;
    return [
      this.config.entity,
      this.config.status_entity,
      this.config.threshold_entity,
      ...(this.config.metric_mode === "level"
        ? []
        : [this.config.forecast_entity, this.config.forecast_status_entity]),
    ].map((entityId) => `${entityId ?? ""}:${entity(this.states, entityId)?.state ?? "missing"}`).join("|");
  }

  private render(): void {
    if (!this.shadowRoot || !this.config) return;
    if (!this.states) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">${escapeHtml(localize("noCurrentReading"))}</div></ha-card>`;
      return;
    }

    const locale = resolveLocale();
    const levelEntity = entity(this.states, this.config.entity);
    const rawLevel = entityNumber(levelEntity);
    const level = rawLevel === undefined ? undefined : clamp(rawLevel);
    const thresholdEntityValue = entityNumber(entity(this.states, this.config.threshold_entity));
    const threshold = clamp(thresholdEntityValue ?? this.config.low_threshold ?? DEFAULT_THRESHOLD);
    const statusEntity = entity(this.states, this.config.status_entity);
    const status = deriveStatus(statusEntity?.state, level, threshold);
    const statusLabel = status.translationKey
      ? localize(status.translationKey, locale)
      : status.label;
    const displayMode = this.config.display_mode ?? "both";
    const metricMode = this.config.metric_mode ?? "level";
    const showTank = displayMode !== "details";
    const showDetails = displayMode !== "tank";
    const showLowMarkerSummary = this.config.show_low_marker !== false;
    const fixedHeight = typeof this.config.grid_options?.rows === "number";
    const interactive = this.hasAction("tap") || this.hasAction("hold") || this.hasAction("double_tap");
    const title = "SaltWatch";
    const displayLevel = level === undefined ? "—" : formatPercentage(level, locale);
    const accessibleLevel = level === undefined
      ? localize("noCurrentReading", locale)
      : displayLevel;
    const rawForecast = entityNumber(entity(this.states, this.config.forecast_entity));
    const forecastDays = rawForecast === undefined || rawForecast < 0
      ? undefined
      : Math.round(rawForecast);
    const forecastDisplay = forecastDays === undefined
      ? "—"
      : formatForecastDays(forecastDays, locale);
    const forecastState = entity(this.states, this.config.forecast_status_entity)?.state;
    const forecastLabel = forecastDays === undefined
      ? forecastStatusLabel(forecastState, locale)
      : forecastDays === 0
        ? localize("lowThresholdReached", locale)
        : localize(forecastDays === 1 ? "dayUntilLowSalt" : "daysUntilLowSalt", locale);
    const levelMetric = `<div class="metric level-metric">
      <div class="metric-value level">${displayLevel}</div>
      <div class="metric-label level-label">${escapeHtml(metricMode === "both" ? localize("saltLevel", locale) : localize("estimatedLevel", locale))}</div>
    </div>`;
    const forecastMetric = `<div class="metric forecast-metric${forecastDays === undefined ? " unavailable" : ""}">
      <div class="metric-value forecast-value">${forecastDays === undefined ? this.forecastSymbol() : forecastDisplay}</div>
      <div class="metric-label forecast-label">${escapeHtml(forecastLabel)}</div>
    </div>`;
    const metricsMarkup = metricMode === "both"
      ? `${levelMetric}<span class="metric-divider" aria-hidden="true"></span>${forecastMetric}`
      : metricMode === "forecast"
        ? forecastMetric
        : levelMetric;
    const accessibleForecast = forecastDays === undefined
      ? forecastLabel
      : `${forecastDisplay} ${forecastLabel}`;
    const accessibleMetrics = metricMode === "both"
      ? `${accessibleLevel}, ${accessibleForecast}`
      : metricMode === "forecast"
        ? accessibleForecast
        : accessibleLevel;

    const tankTop = 132;
    const tankBottom = 474;
    const tankHeight = tankBottom - tankTop;
    const saltY = level === undefined ? tankBottom : tankBottom - (level / 100) * tankHeight;
    const thresholdY = tankBottom - (threshold / 100) * tankHeight;
    const surfacePath = [
      `M96 ${(saltY + 2).toFixed(1)}`,
      `Q108 ${(saltY - 2).toFixed(1)} 120 ${(saltY - 3).toFixed(1)}`,
      `Q132 ${(saltY - 6).toFixed(1)} 145 ${(saltY - 4).toFixed(1)}`,
      `Q159 ${(saltY - 1).toFixed(1)} 174 ${(saltY - 2).toFixed(1)}`,
      `Q189 ${(saltY - 4).toFixed(1)} 204 ${(saltY - 3).toFixed(1)}`,
      `Q220 ${(saltY + 1).toFixed(1)} 236 ${(saltY - 1).toFixed(1)}`,
      `Q253 ${(saltY - 4).toFixed(1)} 270 ${(saltY - 2).toFixed(1)}`,
      `Q288 ${(saltY + 1).toFixed(1)} 305 ${(saltY - 1).toFixed(1)}`,
      `Q315 ${(saltY - 3).toFixed(1)} 324 ${(saltY + 1).toFixed(1)}`,
    ].join(" ");
    const saltPath = [
      surfacePath,
      `L324 ${tankBottom}`,
      `L96 ${tankBottom}`,
      "Z",
    ].join(" ");

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <ha-card class="tone-${status.tone}${fixedHeight ? " fixed-height" : ""}"${interactive ? ' tabindex="0" role="button"' : ""} aria-label="${title}: ${escapeHtml(accessibleMetrics)}, ${escapeHtml(statusLabel)}">
        <div class="card-shell mode-${displayMode} order-${this.config.section_order ?? "tank-first"}">
          ${showTank ? `<section class="tank-panel" aria-label="${escapeHtml(localize("tankLevelVisualization", locale))}">
            ${this.tankSvg(level, saltPath, surfacePath, saltY, thresholdY, threshold, status.tone, locale)}
          </section>` : ""}
          ${showDetails ? `<section class="content-panel${showLowMarkerSummary ? "" : " without-threshold-summary"}">
            ${this.config.show_status ? `<header>
              <div class="status"><span class="status-dot"></span>${escapeHtml(statusLabel)}</div>
            </header>` : ""}
            <div class="reading metric-mode-${metricMode}${level === undefined ? " state-reading" : ""}">
              ${level === undefined ? this.stateSymbol(status.tone) : `<div class="metrics metrics-${metricMode}">${metricsMarkup}</div>`}
              ${level === undefined && this.config.show_status
                ? ""
                : level === undefined
                  ? `<div class="level-label">${escapeHtml(statusLabel)}</div>`
                  : ""}
            </div>
            ${showLowMarkerSummary ? `<div class="threshold-summary" aria-label="${escapeHtml(localize("lowMarkerAt", locale, { value: formatPercentage(threshold, locale) }))}">
              <span class="marker-line"></span>
              <span>${escapeHtml(localize("lowMarker", locale))}</span>
              <strong>${formatPercentage(threshold, locale)}</strong>
            </div>` : ""}
          </section>` : ""}
        </div>
      </ha-card>`;

    const card = this.shadowRoot.querySelector<HTMLElement>("ha-card");
    if (card) {
      this.configureInteractions(card);
      this.scheduleHeightModeUpdate();
    }
    this.lastRenderKey = this.currentRenderKey();
  }

  private scheduleHeightModeUpdate(): void {
    if (!this.isConnected || typeof requestAnimationFrame === "undefined") return;
    if (this.heightFrame !== undefined) cancelAnimationFrame(this.heightFrame);
    this.heightFrame = requestAnimationFrame(() => {
      this.heightFrame = undefined;
      this.updateHeightMode();
    });
  }

  private updateHeightMode(): void {
    if (!this.shadowRoot || !this.config) return;
    const card = this.shadowRoot.querySelector<HTMLElement>("ha-card");
    if (!card || card.clientHeight === 0) return;

    const configuredRows = this.config.grid_options?.rows;
    if (configuredRows === "auto") {
      this.inferredFixedHeight = false;
      card.classList.remove("fixed-height");
      return;
    }

    const explicitlyFixed = typeof configuredRows === "number";
    const cardBounds = card.getBoundingClientRect();
    const verticallyClipped = [
      ...this.shadowRoot.querySelectorAll<HTMLElement>(
        ".status,.metric-value,.metric-label,.threshold-summary,.tank",
      ),
    ].some((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.height > 0 &&
        (bounds.top < cardBounds.top - 1 || bounds.bottom > cardBounds.bottom + 1);
    });
    const panelsOverflow = [
      ...this.shadowRoot.querySelectorAll<HTMLElement>(".card-shell,.tank-panel,.content-panel,.reading"),
    ].some((element) => element.scrollHeight > element.clientHeight + 1);

    if (verticallyClipped || panelsOverflow) this.inferredFixedHeight = true;
    card.classList.toggle("fixed-height", explicitlyFixed || this.inferredFixedHeight);
  }

  private actionConfig(action: ActionType): LovelaceActionConfig {
    if (!this.config) return DEFAULT_NO_ACTION;
    if (action === "tap") return this.config.tap_action ?? DEFAULT_TAP_ACTION;
    if (action === "hold") return this.config.hold_action ?? DEFAULT_NO_ACTION;
    return this.config.double_tap_action ?? DEFAULT_NO_ACTION;
  }

  private hasAction(action: ActionType): boolean {
    return this.actionConfig(action).action !== "none";
  }

  private fireAction(action: ActionType): void {
    if (!this.config || !this.hasAction(action)) return;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true,
      composed: true,
      detail: { config: this.config, action },
    }));
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== undefined) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
    this.pointerOrigin = undefined;
  }

  private clearInteractionTimers(): void {
    this.clearHoldTimer();
    if (this.tapTimer !== undefined) clearTimeout(this.tapTimer);
    this.tapTimer = undefined;
    this.holdTriggered = false;
  }

  private configureInteractions(card: HTMLElement): void {
    card.addEventListener("click", () => {
      if (this.holdTriggered) {
        this.holdTriggered = false;
        return;
      }
      if (this.hasAction("double_tap")) {
        if (this.tapTimer !== undefined) clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => {
          this.tapTimer = undefined;
          this.fireAction("tap");
        }, DOUBLE_TAP_DELAY);
      } else {
        this.fireAction("tap");
      }
    });
    card.addEventListener("dblclick", (event) => {
      if (!this.hasAction("double_tap")) return;
      event.preventDefault();
      if (this.tapTimer !== undefined) clearTimeout(this.tapTimer);
      this.tapTimer = undefined;
      this.fireAction("double_tap");
    });
    card.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0 || !this.hasAction("hold")) return;
      this.clearHoldTimer();
      this.holdTriggered = false;
      this.pointerOrigin = { x: event.clientX, y: event.clientY };
      this.holdTimer = setTimeout(() => {
        this.holdTimer = undefined;
        this.holdTriggered = true;
        this.fireAction("hold");
      }, HOLD_DELAY);
    });
    card.addEventListener("pointermove", (event) => {
      if (!(event instanceof PointerEvent) || !this.pointerOrigin) return;
      if (Math.hypot(event.clientX - this.pointerOrigin.x, event.clientY - this.pointerOrigin.y) > 10) {
        this.clearHoldTimer();
      }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      card.addEventListener(eventName, () => this.clearHoldTimer());
    });
    card.addEventListener("keydown", (event) => {
      if (event instanceof KeyboardEvent && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.fireAction("tap");
      }
    });
  }

  private stateSymbol(tone: string): string {
    if (tone === "warning") {
      return `<svg class="state-symbol calibration-symbol" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="31"/>
        <circle cx="48" cy="48" r="12"/>
        <path d="M48 5V18M48 78V91M5 48H18M78 48H91"/>
      </svg>`;
    }
    return `<svg class="state-symbol fault-symbol" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="34"/>
      <path d="M48 27V55"/>
      <circle class="symbol-dot" cx="48" cy="68" r="3.8"/>
    </svg>`;
  }

  private forecastSymbol(): string {
    return `<svg class="forecast-symbol" viewBox="0 0 96 96" aria-hidden="true">
      <rect x="10" y="17" width="76" height="68" rx="10"/>
      <path d="M29 9V27M67 9V27M10 36H86"/>
      <circle cx="62" cy="61" r="15"/>
      <path d="M62 52V61L68 65"/>
    </svg>`;
  }

  private tankSvg(
    level: number | undefined,
    saltPath: string,
    surfacePath: string,
    saltY: number,
    thresholdY: number,
    threshold: number,
    tone: string,
    locale: ReturnType<typeof resolveLocale>,
  ): string {
    const rulerMarks = Array.from({ length: 21 }, (_, index) => {
      const value = 100 - index * 5;
      const y = 474 - (value / 100) * 342;
      const major = value % 25 === 0;
      const medium = !major && value % 10 === 0;
      const start = major ? 60 : medium ? 67 : 71;
      const label = major
        ? `<text x="52" y="${y + 5}" text-anchor="end">${value}%</text>`
        : "";
      return `${label}<path class="${major ? "major" : medium ? "medium" : "minor"}" d="M${start} ${y}H78"/>`;
    }).join("");
    const unavailable = level === undefined;
    const labelY = Math.max(134, Math.min(470, thresholdY));
    const lowBadge = localize("lowBadge", locale);
    const lowBadgeWidth = locale === "de" ? 72 : 54;
    const lowBadgeX = 12 - lowBadgeWidth;
    const tankVisualScale = 1.18;
    const tankVisualOffsetX = -60;
    const tankVisualCenterY = 296;
    const scaledLabelY = tankVisualCenterY + (labelY - tankVisualCenterY) * tankVisualScale;
    const tankLabel = unavailable
      ? localize("noCurrentReading", locale)
      : localize("estimatedLevel", locale) + `: ${formatPercentage(level, locale)}`;

    return `
      <svg class="tank" viewBox="-72 30 444 534" role="img" aria-label="${escapeHtml(tankLabel)}">
        <defs>
          <linearGradient id="tank-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fbfbf8"/><stop offset=".1" stop-color="#ecefed"/><stop offset=".34" stop-color="#d9dfe0"/><stop offset=".7" stop-color="#bdc6c9"/><stop offset=".91" stop-color="#f1f3f1"/><stop offset="1" stop-color="#aeb8bc"/>
          </linearGradient>
          <linearGradient id="tank-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#1b2226"/><stop offset=".15" stop-color="#424a4f"/><stop offset=".27" stop-color="#242b2f"/><stop offset=".76" stop-color="#171d21"/><stop offset="1" stop-color="#353d42"/>
          </linearGradient>
          <linearGradient id="lid-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fffefa"/><stop offset=".16" stop-color="#ecefed"/><stop offset=".55" stop-color="#d4dadb"/><stop offset=".82" stop-color="#b7c0c3"/><stop offset="1" stop-color="#e5e8e6"/>
          </linearGradient>
          <radialGradient id="tank-glass" cx="50%" cy="40%" r="74%">
            <stop offset="0" stop-color="#565a5c"/><stop offset=".5" stop-color="#404548"/><stop offset=".82" stop-color="#303538"/><stop offset="1" stop-color="#1e2326"/>
          </radialGradient>
          <linearGradient id="salt-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f4efe4"/><stop offset=".18" stop-color="#e8e0d1"/><stop offset=".72" stop-color="#d7cebd"/><stop offset="1" stop-color="#c8beab"/>
          </linearGradient>
          <linearGradient id="salt-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".52" stop-color="#8d806c" stop-opacity=".04"/><stop offset="1" stop-color="#625744" stop-opacity=".24"/>
          </linearGradient>
          <radialGradient id="window-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="72%" stop-color="#000" stop-opacity="0"/><stop offset="90%" stop-color="#000" stop-opacity=".09"/><stop offset="100%" stop-color="#000" stop-opacity=".3"/>
          </radialGradient>
          <pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="13" height="13" fill="transparent"/><rect width="3" height="13" fill="#d6dde0" fill-opacity=".14"/>
          </pattern>
          <clipPath id="tank-window"><path d="M96 137Q96 115 118 115H302Q324 115 324 137V448Q324 474 298 474H122Q96 474 96 448Z"/></clipPath>
          <clipPath id="salt-shape"><path d="${saltPath}"/></clipPath>
          <filter id="frame-shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#000" flood-opacity=".48"/></filter>
          <filter id="polymer" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="9" result="noise"/>
            <feColorMatrix in="noise" values=".28 0 0 0 0  0 .28 0 0 0  0 0 .28 0 0  0 0 0 .12 0" result="grain"/>
            <feComposite in="grain" in2="SourceAlpha" operator="in" result="masked-grain"/>
            <feBlend in="SourceGraphic" in2="masked-grain" mode="soft-light"/>
          </filter>
          <filter id="inner-shadow" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#000" flood-opacity=".88"/></filter>
          <filter id="salt-shadow" x="-10%" y="-12%" width="120%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency=".08 .18" numOctaves="2" seed="13" result="noise"/>
            <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
            <feComposite in="mono" in2="SourceAlpha" operator="in" result="texture"/>
            <feBlend in="SourceGraphic" in2="texture" mode="soft-light" result="grain"/>
            <feDropShadow in="grain" dx="0" dy="-1" stdDeviation="5" flood-color="#000" flood-opacity=".28"/>
          </filter>
        </defs>
        <g class="tank-visual" transform="translate(${tankVisualOffsetX} 0) translate(210 ${tankVisualCenterY}) scale(${tankVisualScale}) translate(-210 -${tankVisualCenterY})">
        <g class="ruler"><path class="scale-spine" d="M82 132V474"/>${rulerMarks}</g>
        <g filter="url(#frame-shadow)">
          <g filter="url(#polymer)">
            <path d="M80 104Q80 88 96 82H324Q340 88 340 104V452Q340 486 306 492H114Q80 486 80 452Z" fill="url(#tank-frame)" stroke="#7e888d" stroke-width="2.5"/>
            <path d="M74 91L80 82Q83 79 96 77Q210 74 324 77Q337 79 340 82L346 91V104Q346 108 342 108H78Q74 108 74 104Z" fill="url(#lid-face)" stroke="#7e888d" stroke-width="2.5" stroke-linejoin="round"/>
            <path class="tank-base" d="M112 492H308L302 518H275L267 511H153L145 518H118Z" fill="url(#tank-edge)" stroke-width="3"/>
          </g>
          <path d="M84 86Q91 82 101 81Q210 78 319 81Q329 82 336 86" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="2" stroke-linecap="round"/>
          <path d="M76 101H344" stroke="#697378" stroke-opacity=".62" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <path d="M91 134Q91 109 116 109H304Q329 109 329 134V449Q329 479 299 479H121Q91 479 91 449Z" fill="#080c0e" filter="url(#inner-shadow)"/>
        <path class="tank-glass" d="M96 137Q96 115 118 115H302Q324 115 324 137V448Q324 474 298 474H122Q96 474 96 448Z" fill="url(#tank-glass)"/>
        <g clip-path="url(#tank-window)">
          ${unavailable
            ? `<rect class="unavailable-base" x="96" y="115" width="228" height="359" fill="url(#tank-glass)"/><rect class="unavailable-hatch" x="96" y="115" width="228" height="359" fill="url(#hatch)"/><text class="no-reading" x="210" y="320" text-anchor="middle">?</text>`
            : `<path class="salt-fill" data-level="${level}" data-surface-y="${saltY.toFixed(1)}" d="${saltPath}" fill="url(#salt-base)" filter="url(#salt-shadow)"/><image class="salt-photo" href="${saltTextureUrl}" x="78.5" y="82" width="263" height="420" preserveAspectRatio="xMidYMid slice" clip-path="url(#salt-shape)"/><path class="salt-depth" d="${saltPath}" fill="url(#salt-shade)"/><path class="salt-highlight" d="${surfacePath}"/>`}
          <rect class="window-vignette" x="96" y="115" width="228" height="359" fill="url(#window-vignette)"/>
        </g>
        <path class="threshold tone-${tone}" data-threshold="${threshold}" data-threshold-y="${thresholdY.toFixed(1)}" d="M24 ${thresholdY.toFixed(1)}H346"/>
        </g>
        <g class="threshold-label tone-${tone}" transform="translate(${lowBadgeX} ${(scaledLabelY - 15).toFixed(1)})">
          <rect width="${lowBadgeWidth}" height="30" rx="9"/><text x="${lowBadgeWidth / 2}" y="20" text-anchor="middle">${escapeHtml(lowBadge)}</text>
        </g>
      </svg>`;
  }

  private styles(): string {
    return `
      :host { display:block; width:100%; max-width:100%; min-width:0; height:100%; container-type:inline-size; container-name:saltwatch; --sw-card-background:var(--card-background-color,var(--ha-card-background,#181d21)); --sw-panel-divider:color-mix(in srgb,var(--divider-color,#536069) 78%,var(--primary-text-color,#f4f6f7) 22%); --sw-good:var(--success-color); --sw-low:var(--warning-color); --sw-warning:var(--warning-color); --sw-fault:var(--error-color); }
      * { box-sizing:border-box; }
      ha-card { display:block; width:100%; max-width:100%; min-width:0; height:100%; overflow:hidden; color:var(--primary-text-color,#f4f6f7); background:var(--sw-card-background); border-width:var(--ha-card-border-width,1px); border-style:solid; border-color:var(--ha-card-border-color,var(--divider-color,#e0e0e0)); border-radius:var(--ha-card-border-radius,12px); box-shadow:var(--ha-card-box-shadow,none); }
      ha-card.fixed-height { container-type:size; container-name:card; }
      ha-card[role="button"] { cursor:pointer; }
      ha-card:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }
      .loading { padding:32px; color:var(--secondary-text-color,#aab2b7); }
      .card-shell { display:grid; width:100%; min-width:0; height:100%; grid-template-columns:minmax(0,.98fr) minmax(0,1.02fr); grid-template-areas:"tank details"; }
      .card-shell.order-details-first { grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr); grid-template-areas:"details tank"; }
      .card-shell.mode-tank,.card-shell.mode-details { grid-template-columns:1fr; min-height:0; }
      .card-shell.mode-tank { grid-template-areas:"tank"; }.card-shell.mode-details { grid-template-areas:"details"; }
      .mode-tank .tank-panel { padding-block:8px; border:0; }
      .tank-panel { grid-area:tank; min-width:0; display:grid; place-items:center; padding:6px 18px 6px 28px; background:radial-gradient(circle at 46% 43%,rgba(255,255,255,.055),transparent 62%); border-right:1px solid var(--sw-panel-divider); }
      .order-details-first .tank-panel { border-right:0; border-left:1px solid var(--sw-panel-divider); }
      .tank { width:min(100%,582px); height:auto; overflow:visible; }
      .ruler { fill:var(--secondary-text-color,#b1b8bc); stroke:var(--secondary-text-color,#b1b8bc); stroke-width:1.15; font:15px system-ui,sans-serif; }
      .ruler text { stroke:none; }
      .ruler .scale-spine { opacity:.28; stroke-width:.8; }
      .ruler .major { stroke-width:1.8; opacity:.92; }
      .ruler .medium { stroke-width:1.35; opacity:.74; }
      .ruler .minor { stroke-width:1; opacity:.72; }
      .salt-photo { opacity:.98; filter:contrast(1.04) saturate(.15) brightness(1.04); }
      .tank-base { stroke:color-mix(in srgb,var(--primary-text-color,#f4f6f7) 24%,#111619); }
      .salt-depth { opacity:.9; mix-blend-mode:multiply; }
      .salt-highlight { fill:none; stroke:#fff; stroke-width:.8; opacity:.28; }
      .no-reading { fill:#8b969c; font:700 98px system-ui,sans-serif; filter:drop-shadow(0 4px 8px rgba(0,0,0,.4)); }
      .threshold { color:var(--sw-warning); fill:none; stroke:currentColor; stroke-width:3; filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 35%,transparent)); }
      .threshold.tone-low { color:var(--sw-low); }
      .threshold-label rect { fill:var(--sw-warning); }
      .threshold-label.tone-low rect { fill:var(--sw-low); }
      .threshold-label text { fill:var(--text-light-primary-color); font:750 13px system-ui,sans-serif; letter-spacing:.02em; }
      .content-panel { grid-area:details; min-width:0; min-height:0; display:flex; flex-direction:column; padding:48px 48px 38px; container-type:inline-size; container-name:details; }
      header { min-width:0; display:flex; align-items:center; justify-content:flex-end; }
      .status { flex:0 0 auto; display:flex; align-items:center; gap:13px; margin-left:auto; color:var(--sw-good); font-size:clamp(14px,5.1cqw,23px); font-weight:590; white-space:nowrap; }
      .status-dot { width:17px; height:17px; border-radius:50%; background:var(--sw-good); box-shadow:inset 0 1px 0 rgba(255,255,255,.22); }
      .tone-low .status { color:var(--sw-low); }.tone-low .status-dot { background:var(--sw-low); }.tone-warning .status { color:var(--sw-warning); }.tone-warning .status-dot { background:var(--sw-warning); }.tone-fault .status { color:var(--sw-fault); }.tone-fault .status-dot { background:var(--sw-fault); }
      .reading { min-height:0; flex:1 1 auto; display:flex; flex-direction:column; justify-content:center; margin:0; padding:36px 0 34px; }
      .without-threshold-summary .reading { padding-bottom:0; }
      .metrics { display:grid; align-items:center; min-width:0; }
      .metrics-level,.metrics-forecast { grid-template-columns:minmax(0,1fr); }
      .metrics-both { grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr); align-items:start; gap:24px; }
      .metric { min-width:0; overflow:hidden; text-align:center; }
      .metric-value { font-size:clamp(64px,34cqw,158px); line-height:.78; font-weight:720; letter-spacing:-.08em; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .forecast-value { display:flex; justify-content:center; letter-spacing:-.055em; }
      .forecast-symbol { display:block; width:clamp(64px,25cqw,112px); height:auto; fill:none; stroke:currentColor; stroke-width:4.5; stroke-linecap:round; stroke-linejoin:round; }
      .metric-label { margin-top:28px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(16px,6.5cqw,29px); font-weight:430; letter-spacing:-.02em; }
      .metrics-both .metric-value { display:flex; align-items:center; justify-content:center; height:1em; font-size:clamp(40px,19cqw,94px); line-height:.86; }
      .metrics-both .forecast-symbol { width:1em; height:1em; }
      .metrics-both .metric-label { margin-top:18px; font-size:clamp(13px,4.6cqw,20px); }
      .metric-divider { align-self:center; width:1px; height:clamp(58px,21cqw,108px); background:var(--sw-panel-divider); }
      .forecast-metric.unavailable .metric-value { color:var(--primary-text-color); }
      .state-symbol { display:block; width:clamp(64px,25cqw,122px); height:auto; overflow:visible; fill:none; stroke:currentColor; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; }
      .state-symbol .symbol-dot { fill:currentColor; stroke:none; }
      .tone-warning .state-symbol { color:var(--sw-warning); }.tone-fault .state-symbol { color:var(--sw-fault); }
      .state-reading .level-label { margin-top:28px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(16px,6.5cqw,29px); font-weight:430; letter-spacing:-.02em; }
      .tone-warning .level-label { color:var(--sw-warning); }.tone-fault .level-label { color:var(--sw-fault); }
      .threshold-summary { display:flex; align-items:center; gap:12px; margin-top:auto; padding-top:26px; border-top:1px solid color-mix(in srgb,var(--divider-color,#536069) 48%,transparent); color:var(--secondary-text-color,#aeb6bb); font-size:clamp(13px,4.6cqw,20px); }
      .threshold-summary strong { margin-left:auto; color:var(--primary-text-color,#f4f6f7); font-weight:650; font-variant-numeric:tabular-nums; }
      .marker-line { width:34px; height:3px; border-radius:3px; background:var(--sw-warning); box-shadow:0 0 5px color-mix(in srgb,var(--sw-warning) 12%,transparent); }
      .tone-low .marker-line { background:var(--sw-low); box-shadow:0 0 5px color-mix(in srgb,var(--sw-low) 12%,transparent); }
      .fixed-height .card-shell,.fixed-height .tank-panel,.fixed-height .content-panel { min-height:0; }
      .fixed-height .tank-panel,.fixed-height .content-panel { overflow:hidden; }
      .fixed-height .tank-panel { container-type:size; }
      .fixed-height .tank { width:auto; height:calc(100cqh - 12px); max-width:min(100%,582px); max-height:none; }
      @container card (max-height:460px) {
        .fixed-height .card-shell.mode-both { grid-template-columns:1fr 1fr; grid-template-areas:"tank details"; }
        .fixed-height .card-shell.mode-both.order-details-first { grid-template-areas:"details tank"; }
        .fixed-height .card-shell.mode-both .tank-panel { border:0; border-right:1px solid var(--sw-panel-divider); }
        .fixed-height .card-shell.mode-both.order-details-first .tank-panel { border-right:0; border-left:1px solid var(--sw-panel-divider); }
        .fixed-height .content-panel { padding:clamp(10px,4cqh,28px) clamp(12px,5cqh,32px); }
        .fixed-height .status { gap:clamp(6px,2cqh,11px); font-size:clamp(12px,5cqh,20px); }
        .fixed-height .status-dot { width:clamp(10px,4cqh,16px); height:clamp(10px,4cqh,16px); }
        .fixed-height .reading { padding:clamp(5px,3cqh,16px) 0; }
        .fixed-height .metric-value { font-size:clamp(34px,30cqh,112px); }
        .fixed-height .metrics-both .metric-value { font-size:clamp(30px,min(27cqh,18cqw),88px); }
        .fixed-height .metric-label,.fixed-height .state-reading .level-label { margin-top:clamp(4px,3cqh,14px); font-size:clamp(10px,6cqh,18px); }
        .fixed-height .metrics-both .metric-label { margin-top:clamp(3px,2.5cqh,10px); font-size:clamp(9px,5cqh,16px); }
        .fixed-height .metric-divider { height:clamp(34px,28cqh,82px); }
        .fixed-height .state-symbol { width:clamp(38px,28cqh,92px); }
        .fixed-height .threshold-summary { padding-top:clamp(4px,3cqh,13px); font-size:clamp(9px,5cqh,15px); }
        .fixed-height .marker-line { width:clamp(16px,8cqh,28px); }
      }
      @container card (max-height:260px) {
        .fixed-height .content-panel { padding:clamp(5px,4cqh,10px) clamp(8px,6cqh,16px); }
        .fixed-height .status { gap:5px; font-size:clamp(9px,8cqh,13px); }
        .fixed-height .status-dot { width:clamp(8px,7cqh,11px); height:clamp(8px,7cqh,11px); }
        .fixed-height .reading { padding:clamp(2px,2cqh,5px) 0; }
        .fixed-height .metrics-both { grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr); gap:clamp(5px,4cqh,10px); }
        .fixed-height .metric-value,.fixed-height .metrics-both .metric-value { font-size:clamp(24px,min(25cqh,18cqw),56px); }
        .fixed-height .metric-label,.fixed-height .state-reading .level-label,.fixed-height .metrics-both .metric-label { margin-top:clamp(1px,2cqh,4px); font-size:clamp(8px,6cqh,12px); line-height:1.05; }
        .fixed-height .metric-divider { width:1px; height:clamp(28px,30cqh,54px); }
        .fixed-height .threshold-summary { gap:5px; padding-top:clamp(2px,2cqh,5px); font-size:clamp(8px,6cqh,11px); }
        .fixed-height .marker-line { width:clamp(12px,10cqh,20px); height:2px; }
      }
      @container saltwatch (max-width:880px) {
        .card-shell { grid-template-columns:1fr; grid-template-areas:"tank" "details"; min-height:0; }
        .card-shell.order-details-first { grid-template-columns:1fr; grid-template-areas:"details" "tank"; }
        .card-shell.mode-tank { grid-template-areas:"tank"; }.card-shell.mode-details { grid-template-areas:"details"; }
        .fixed-height .card-shell.mode-both { grid-template-rows:minmax(0,1fr) minmax(0,1fr); }
        .fixed-height .card-shell.mode-tank,.fixed-height .card-shell.mode-details { grid-template-rows:minmax(0,1fr); }
        .fixed-height .card-shell.mode-both .tank { height:calc(100cqh - 36px); }
        .tank-panel,.order-details-first .tank-panel { padding:8px 30px; border-right:0; border-left:0; border-bottom:1px solid var(--sw-panel-divider); }
        .order-details-first .tank-panel { border-top:1px solid var(--sw-panel-divider); border-bottom:0; }
        .mode-tank .tank-panel { border:0; }
        .content-panel { padding:28px; }
        .reading { margin:0; padding:24px 0 26px; text-align:center; }
        .state-reading { display:flex; flex-direction:column; align-items:center; }
        .metric-value { font-size:clamp(54px,24cqw,154px); }
        .forecast-symbol { margin-inline:auto; }
        .metric-label,.state-reading .level-label { font-size:clamp(16px,4.5cqw,26px); }
        .metrics-both .metric-value { justify-content:center; font-size:clamp(52px,15cqw,100px); }
        .metrics-both .metric-label { font-size:clamp(15px,3.5cqw,20px); }
        .threshold-summary { padding-top:22px; }
      }
      @container saltwatch (max-width:520px) {
        .tank-panel { padding:7px 14px; }
        .content-panel { padding:clamp(14px,4cqw,20px) clamp(14px,5cqw,24px); }
        header { align-items:center; }
        .status { font-size:clamp(14px,4cqw,18px); }
        .status-dot { width:clamp(12px,3.5cqw,17px); height:clamp(12px,3.5cqw,17px); }
        .reading { margin:0; padding:20px 0; }
        .state-symbol { width:clamp(58px,20cqw,90px); }
        .metric-value { font-size:clamp(48px,29cqw,126px); }
        .metric-label,.state-reading .level-label { margin-top:clamp(12px,4cqw,22px); font-size:clamp(14px,4.8cqw,21px); }
        .metrics-both { gap:14px; }
        .metrics-both .metric-value { font-size:clamp(44px,16cqw,78px); }
        .metrics-both .metric-label { margin-top:clamp(9px,3cqw,14px); font-size:clamp(13px,3.8cqw,17px); }
        .metric-divider { height:clamp(58px,18cqw,92px); }
        .threshold-summary { padding-top:clamp(12px,3.5cqw,18px); font-size:clamp(13px,3.5cqw,16px); }
      }
      @container saltwatch (max-width:400px) {
        .content-panel { padding-inline:clamp(10px,4cqw,16px); }
        .status { gap:clamp(6px,2.5cqw,8px); font-size:clamp(12px,4cqw,15px); }
        .status-dot { width:clamp(10px,3.5cqw,14px); height:clamp(10px,3.5cqw,14px); }
        .reading { padding:clamp(12px,5cqw,20px) 0; }
        .metrics-both { grid-template-columns:1fr; gap:clamp(12px,5cqw,18px); }
        .metrics-both .metric-value { font-size:clamp(40px,25cqw,100px); }
        .metrics-both .metric-label { font-size:clamp(12px,5cqw,17px); }
        .fixed-height .metric-divider { width:100%; height:1px; }
        .threshold-summary { gap:clamp(6px,3cqw,12px); font-size:clamp(11px,4cqw,14px); }
        .marker-line { width:clamp(18px,9cqw,34px); }
      }
      @container card (max-width:400px) and (max-height:260px) {
        .fixed-height .content-panel { padding-inline:clamp(6px,3cqw,10px); }
        .fixed-height .metrics-both { grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr); gap:clamp(4px,2cqw,8px); }
        .fixed-height .metric-divider { width:1px; height:clamp(28px,30cqh,54px); }
      }
      @container card (max-height:460px) {
        .fixed-height .card-shell.mode-both { grid-template-columns:minmax(0,1fr) minmax(0,1fr); grid-template-rows:minmax(0,1fr); grid-template-areas:"tank details"; }
        .fixed-height .card-shell.mode-both.order-details-first { grid-template-areas:"details tank"; }
        .fixed-height .card-shell.mode-both .tank-panel { border:0; border-right:1px solid var(--sw-panel-divider); }
        .fixed-height .card-shell.mode-both.order-details-first .tank-panel { border-right:0; border-left:1px solid var(--sw-panel-divider); }
        .fixed-height .card-shell.mode-both .tank { height:calc(100cqh - 12px); }
      }
      @media (prefers-reduced-motion:no-preference) {
        .salt-highlight { animation:salt-settle 500ms ease-out; transform-origin:center; }
        @keyframes salt-settle { from { transform:translateY(-3px); opacity:0; } }
      }
    `;
  }
}
