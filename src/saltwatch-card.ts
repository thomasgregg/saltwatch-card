import {
  buildSparklinePath,
  clamp,
  deriveStatus,
  entityNumber,
  escapeHtml,
  historyValues,
  relativeUpdated,
} from "./model";
import type {
  HassEntity,
  HistoryResponse,
  HomeAssistant,
  SaltWatchCardConfig,
} from "./types";

const DEFAULT_THRESHOLD = 20;
const DEFAULT_HISTORY_HOURS = 24 * 14;
const HISTORY_REFRESH_MS = 15 * 60 * 1000;

function entity(hass: HomeAssistant | undefined, entityId: string | undefined): HassEntity | undefined {
  return entityId ? hass?.states[entityId] : undefined;
}

function iconRuler(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 16.5 4 20 7.5 7.5 20 4 16.5Zm4.2-.7 1.4 1.4m1.1-4.1 1.4 1.4m1.1-4.1 1.4 1.4"/></svg>`;
}

function iconClock(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>`;
}

export class SaltWatchCard extends HTMLElement {
  private config?: SaltWatchCardConfig;
  private _hass?: HomeAssistant;
  private history: number[] = [];
  private historyRequestKey = "";
  private historyRequestedAt = 0;
  private historyGeneration = 0;

  public constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public static getConfigForm(): Record<string, unknown> {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { domain: "sensor" } },
        },
        { name: "name", selector: { text: {} } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "status_entity", selector: { entity: {} } },
            { name: "threshold_entity", selector: { entity: {} } },
            { name: "forecast_entity", selector: { entity: { domain: "sensor" } } },
            { name: "distance_entity", selector: { entity: { domain: "sensor" } } },
          ],
        },
        {
          type: "grid",
          name: "",
          schema: [
            {
              name: "low_threshold",
              selector: { number: { min: 0, max: 100, step: 1, mode: "box" } },
            },
            {
              name: "history_hours",
              selector: { number: { min: 24, max: 720, step: 24, mode: "box" } },
            },
          ],
        },
        { name: "show_history", selector: { boolean: {} } },
      ],
      computeLabel: (schema: { name: string }) => {
        const labels: Record<string, string> = {
          entity: "Estimated salt level entity",
          name: "Card title",
          status_entity: "Salt status entity",
          threshold_entity: "Low threshold entity",
          forecast_entity: "Days until low entity",
          distance_entity: "Distance to salt entity",
          low_threshold: "Fallback low threshold",
          history_hours: "History window in hours",
          show_history: "Show level history",
        };
        return labels[schema.name] ?? schema.name;
      },
    };
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
      history_hours: DEFAULT_HISTORY_HOURS,
      show_history: true,
    };
    const status = find("saltwatch", "salt_status");
    const threshold = find("saltwatch", "low_salt_threshold");
    const forecast = find("saltwatch", "estimated_days_until_low_salt");
    const distance = find("saltwatch", "distance_to_salt");
    if (status) config.status_entity = status;
    if (threshold) config.threshold_entity = threshold;
    if (forecast) config.forecast_entity = forecast;
    if (distance) config.distance_entity = distance;
    return config;
  }

  public setConfig(config: SaltWatchCardConfig): void {
    if (!config.entity || typeof config.entity !== "string") {
      throw new Error("SaltWatch Card requires an estimated salt level entity.");
    }

    this.config = {
      ...config,
      low_threshold: config.low_threshold ?? DEFAULT_THRESHOLD,
      history_hours: config.history_hours ?? DEFAULT_HISTORY_HOURS,
      show_history: config.show_history ?? true,
    };
    this.history = [];
    this.historyRequestKey = "";
    this.historyGeneration += 1;
    this.render();
    void this.loadHistoryIfNeeded();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.render();
    void this.loadHistoryIfNeeded();
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): Record<string, number> {
    return { columns: 12, rows: 6, min_columns: 6, min_rows: 5 };
  }

  private async loadHistoryIfNeeded(): Promise<void> {
    if (!this._hass || !this.config?.show_history) return;

    const hours = clamp(this.config.history_hours ?? DEFAULT_HISTORY_HOURS, 24, 720);
    const requestKey = `${this.config.entity}:${hours}`;
    const fresh = requestKey === this.historyRequestKey &&
      Date.now() - this.historyRequestedAt < HISTORY_REFRESH_MS;
    if (fresh) return;

    this.historyRequestKey = requestKey;
    this.historyRequestedAt = Date.now();
    const generation = ++this.historyGeneration;
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

    try {
      const response = await this._hass.callWS<HistoryResponse>({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [this.config.entity],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      if (generation !== this.historyGeneration) return;
      this.history = historyValues(response[this.config.entity]);
      this.render();
    } catch {
      if (generation !== this.historyGeneration) return;
      this.history = [];
      this.render();
    }
  }

  private openMoreInfo(): void {
    if (!this.config) return;
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    Object.assign(event, { detail: { entityId: this.config.entity } });
    this.dispatchEvent(event);
  }

  private render(): void {
    if (!this.shadowRoot || !this.config) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">Waiting for Home Assistant…</div></ha-card>`;
      return;
    }

    const levelEntity = entity(this._hass, this.config.entity);
    const rawLevel = entityNumber(levelEntity);
    const level = rawLevel === undefined ? undefined : clamp(rawLevel);
    const thresholdEntityValue = entityNumber(entity(this._hass, this.config.threshold_entity));
    const threshold = clamp(thresholdEntityValue ?? this.config.low_threshold ?? DEFAULT_THRESHOLD);
    const statusEntity = entity(this._hass, this.config.status_entity);
    const status = deriveStatus(statusEntity?.state, level, threshold);
    const forecast = entityNumber(entity(this._hass, this.config.forecast_entity));
    const distanceEntity = entity(this._hass, this.config.distance_entity);
    const distance = level === undefined ? undefined : entityNumber(distanceEntity);
    const title = escapeHtml(this.config.name || "SaltWatch");
    const displayLevel = level === undefined ? "—" : `${Math.round(level)}%`;
    const updated = relativeUpdated(levelEntity?.last_updated);

    const tankTop = 48;
    const tankBottom = 274;
    const tankHeight = tankBottom - tankTop;
    const saltY = level === undefined ? tankBottom : tankBottom - (level / 100) * tankHeight;
    const thresholdY = tankBottom - (threshold / 100) * tankHeight;
    const moundAmplitude = 4.5;
    const saltPath = [
      `M52 ${saltY.toFixed(1)}`,
      `C78 ${(saltY - moundAmplitude).toFixed(1)} 102 ${(saltY + 2).toFixed(1)} 128 ${(saltY - 1).toFixed(1)}`,
      `C153 ${(saltY - 4).toFixed(1)} 179 ${(saltY + 3).toFixed(1)} 208 ${saltY.toFixed(1)}`,
      `L208 ${tankBottom}`,
      `L52 ${tankBottom}`,
      "Z",
    ].join(" ");

    const showHistory = this.config.show_history !== false;
    const historyWithCurrent = showHistory ? [...this.history] : [];
    if (level !== undefined && historyWithCurrent.at(-1) !== level) historyWithCurrent.push(level);
    const sparkline = buildSparklinePath(historyWithCurrent, 360, 92, 5);
    const forecastPrimary = level === undefined
      ? "Unavailable"
      : status.tone === "low"
        ? "0 days"
        : forecast === undefined
          ? "Learning"
          : `${Math.max(0, Math.round(forecast))} days`;
    const forecastSecondary = level === undefined
      ? "measurement unavailable"
      : forecast === undefined && status.tone !== "low"
        ? "forecast not ready"
        : "until low salt";

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <ha-card class="tone-${status.tone}" tabindex="0" role="button" aria-label="${title}: ${escapeHtml(displayLevel)}, ${escapeHtml(status.label)}">
        <div class="card-shell">
          <section class="tank-panel" aria-label="Tank level visualization">
            ${this.tankSvg(level, saltPath, saltY, thresholdY, threshold, status.tone)}
          </section>
          <section class="content-panel">
            <header>
              <div class="title">${title}</div>
              <div class="status"><span class="status-dot"></span>${escapeHtml(status.label)}</div>
            </header>
            <div class="reading">
              <div class="level">${displayLevel}</div>
              <div class="level-label">${level === undefined ? escapeHtml(status.label) : "Estimated salt level"}</div>
            </div>
            <div class="forecast${showHistory ? "" : " no-history"}">
              <div class="forecast-copy">
                <strong>${escapeHtml(forecastPrimary)}</strong>
                <span>${escapeHtml(forecastSecondary)}</span>
              </div>
              ${showHistory ? `<div class="chart" aria-label="Salt level history">
                <svg viewBox="0 0 360 92" preserveAspectRatio="none" role="img">
                  <path class="chart-grid" d="M5 23 H355 M5 69 H355" />
                  ${level !== undefined && sparkline
                    ? `<path class="chart-line" d="${sparkline}"/><circle class="chart-dot" cx="355" cy="${this.sparklineLastY(level)}" r="3.5"/>`
                    : `<text x="180" y="50" text-anchor="middle">${level === undefined ? "Measurement unavailable" : "History is learning"}</text>`}
                </svg>
              </div>` : ""}
            </div>
            <footer>
              <div>${iconRuler()}<span>${distance === undefined ? "Distance unavailable" : `Distance ${distance.toFixed(1)} cm`}</span></div>
              <div>${iconClock()}<span>${escapeHtml(updated)}</span></div>
            </footer>
          </section>
        </div>
      </ha-card>`;

    const card = this.shadowRoot.querySelector("ha-card");
    card?.addEventListener("click", () => this.openMoreInfo());
    card?.addEventListener("keydown", (event) => {
      if (event instanceof KeyboardEvent && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.openMoreInfo();
      }
    });
  }

  private sparklineLastY(level: number | undefined): string {
    if (level === undefined) return "46";
    return (5 + ((100 - level) / 100) * 82).toFixed(1);
  }

  private tankSvg(
    level: number | undefined,
    saltPath: string,
    saltY: number,
    thresholdY: number,
    threshold: number,
    tone: string,
  ): string {
    const percentageLabels = [100, 75, 50, 25, 0]
      .map((value) => {
        const y = 274 - (value / 100) * 226;
        return `<text x="24" y="${y + 4}" text-anchor="end">${value}%</text><path d="M29 ${y}h10"/>`;
      })
      .join("");
    const unavailable = level === undefined;
    const labelY = Math.max(52, Math.min(266, thresholdY));

    return `
      <svg class="tank" viewBox="0 0 250 320" role="img" aria-label="${unavailable ? "No current salt level" : `${Math.round(level)} percent estimated salt level`}">
        <defs>
          <linearGradient id="tank-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#4b5258"/><stop offset="0.48" stop-color="#171c20"/><stop offset="1" stop-color="#353c41"/>
          </linearGradient>
          <linearGradient id="tank-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#10161a"/><stop offset="0.5" stop-color="#20262a"/><stop offset="1" stop-color="#0f1518"/>
          </linearGradient>
          <linearGradient id="glass-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".25"/><stop offset=".28" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity=".08"/>
          </linearGradient>
          <pattern id="pellets" width="14" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-3)">
            <rect width="14" height="12" fill="#e9e2d0"/>
            <ellipse cx="3" cy="3" rx="2.8" ry="1.7" fill="#fffdf4" transform="rotate(22 3 3)"/>
            <ellipse cx="10" cy="5" rx="3.1" ry="1.8" fill="#d8cfba" transform="rotate(-18 10 5)"/>
            <ellipse cx="5" cy="10" rx="3" ry="1.7" fill="#f6f0df" transform="rotate(9 5 10)"/>
            <circle cx="13" cy="11" r="1.3" fill="#c7bda8"/>
          </pattern>
          <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="#181e22"/><rect width="3" height="10" fill="#30383d"/>
          </pattern>
          <clipPath id="tank-window"><rect x="48" y="44" width="164" height="234" rx="18"/></clipPath>
          <filter id="salt-shadow" x="-10%" y="-20%" width="120%" height="140%"><feDropShadow dx="0" dy="-2" stdDeviation="3" flood-color="#fff" flood-opacity=".18"/></filter>
        </defs>
        <g class="ruler">${percentageLabels}</g>
        <rect x="40" y="20" width="180" height="276" rx="28" fill="url(#tank-frame)"/>
        <path d="M34 34 Q34 20 50 16 H210 Q226 20 226 34 V48 H34Z" fill="url(#tank-frame)" stroke="#646b70" stroke-width="1"/>
        <rect x="48" y="44" width="164" height="234" rx="18" fill="url(#tank-glass)" stroke="#5c6469" stroke-width="2"/>
        <g clip-path="url(#tank-window)">
          ${unavailable
            ? `<rect x="48" y="44" width="164" height="234" fill="url(#hatch)" opacity=".76"/><text class="no-reading" x="130" y="166" text-anchor="middle">?</text>`
            : `<path d="${saltPath}" fill="url(#pellets)" filter="url(#salt-shadow)"/><path class="salt-highlight" d="M54 ${saltY.toFixed(1)} C82 ${(saltY - 4).toFixed(1)} 103 ${(saltY + 2).toFixed(1)} 130 ${(saltY - 1).toFixed(1)} C154 ${(saltY - 4).toFixed(1)} 180 ${(saltY + 3).toFixed(1)} 206 ${saltY.toFixed(1)}"/>`}
          <rect x="48" y="44" width="164" height="234" fill="url(#glass-sheen)" opacity=".08"/>
        </g>
        <path class="threshold tone-${tone}" d="M40 ${thresholdY.toFixed(1)}H214"/>
        <g class="threshold-label tone-${tone}" transform="translate(2 ${labelY - 11})">
          <rect width="38" height="22" rx="7"/><text x="19" y="15" text-anchor="middle">LOW</text>
        </g>
        <text class="threshold-value" x="218" y="${labelY + 4}" text-anchor="start">${Math.round(threshold)}%</text>
        <path d="M56 287h148l-10 17H66Z" fill="#111619"/>
      </svg>`;
  }

  private styles(): string {
    return `
      :host { display:block; --sw-good:#57c878; --sw-low:#f05d5e; --sw-warning:#f4ad32; --sw-fault:#8d9aa1; }
      * { box-sizing:border-box; }
      ha-card { display:block; overflow:hidden; color:var(--primary-text-color,#f4f6f7); background:linear-gradient(145deg,var(--ha-card-background,#181d21),color-mix(in srgb,var(--ha-card-background,#181d21) 82%,#050708)); border:1px solid color-mix(in srgb,var(--divider-color,#536069) 58%,transparent); border-radius:var(--ha-card-border-radius,20px); box-shadow:var(--ha-card-box-shadow,0 18px 45px rgba(0,0,0,.24)); cursor:pointer; }
      ha-card:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }
      .loading { padding:32px; color:var(--secondary-text-color,#aab2b7); }
      .card-shell { display:grid; grid-template-columns:minmax(245px,.95fr) minmax(310px,1.15fr); min-height:440px; }
      .tank-panel { display:grid; place-items:center; padding:22px 12px 18px 18px; background:radial-gradient(circle at 42% 42%,rgba(255,255,255,.035),transparent 58%),linear-gradient(90deg,rgba(0,0,0,.08),transparent); border-right:1px solid color-mix(in srgb,var(--divider-color,#536069) 25%,transparent); }
      .tank { width:min(100%,330px); height:auto; overflow:visible; }
      .ruler { fill:var(--secondary-text-color,#aeb6bb); stroke:var(--secondary-text-color,#aeb6bb); stroke-width:1; font:11px system-ui,sans-serif; }
      .ruler text { stroke:none; }
      .salt-highlight { fill:none; stroke:#fff9e8; stroke-width:2; opacity:.5; }
      .no-reading { fill:#7f8a90; font:700 72px system-ui,sans-serif; }
      .threshold { fill:none; stroke-width:2; }
      .threshold.tone-good,.threshold.tone-warning { stroke:var(--sw-warning); }
      .threshold.tone-low { stroke:var(--sw-low); }
      .threshold.tone-fault { stroke:var(--sw-fault); }
      .threshold-label rect { fill:var(--sw-warning); }
      .threshold-label.tone-low rect { fill:var(--sw-low); }
      .threshold-label.tone-fault rect { fill:var(--sw-fault); }
      .threshold-label text { fill:#18140b; font:700 10px system-ui,sans-serif; }
      .threshold-value { fill:var(--secondary-text-color,#aeb6bb); font:10px system-ui,sans-serif; }
      .content-panel { min-width:0; display:flex; flex-direction:column; padding:30px clamp(24px,4vw,38px) 24px; }
      header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
      .title { font-size:clamp(22px,3vw,30px); font-weight:700; letter-spacing:-.035em; }
      .status { display:flex; align-items:center; gap:9px; color:var(--sw-good); font-weight:650; white-space:nowrap; }
      .status-dot { width:12px; height:12px; border-radius:50%; background:currentColor; box-shadow:0 0 18px color-mix(in srgb,currentColor 50%,transparent); }
      .tone-low .status { color:var(--sw-low); }.tone-warning .status { color:var(--sw-warning); }.tone-fault .status { color:var(--sw-fault); }
      .reading { margin:30px 0 26px; }
      .level { font-size:clamp(72px,10vw,112px); line-height:.86; font-weight:740; letter-spacing:-.075em; font-variant-numeric:tabular-nums; }
      .level-label { margin-top:18px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(17px,2.2vw,24px); }
      .forecast { margin-top:auto; display:grid; grid-template-columns:minmax(120px,.7fr) minmax(170px,1.3fr); align-items:center; gap:20px; padding:22px; border:1px solid color-mix(in srgb,var(--divider-color,#536069) 48%,transparent); border-radius:17px; background:rgba(255,255,255,.018); }
      .forecast.no-history { grid-template-columns:1fr; }
      .forecast-copy { display:flex; flex-direction:column; }
      .forecast-copy strong { font-size:clamp(26px,4vw,42px); line-height:1; letter-spacing:-.045em; }
      .forecast-copy span { margin-top:8px; color:var(--secondary-text-color,#aeb6bb); font-size:15px; }
      .chart { min-width:0; height:92px; }
      .chart svg { width:100%; height:100%; overflow:visible; }
      .chart-grid { fill:none; stroke:color-mix(in srgb,var(--divider-color,#536069) 45%,transparent); stroke-width:1; stroke-dasharray:3 4; }
      .chart-line { fill:none; stroke:var(--sw-warning); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
      .chart-dot { fill:var(--sw-warning); }
      .chart text { fill:var(--secondary-text-color,#aeb6bb); font:13px system-ui,sans-serif; }
      footer { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:20px; padding-top:18px; border-top:1px solid color-mix(in srgb,var(--divider-color,#536069) 42%,transparent); color:var(--secondary-text-color,#aeb6bb); font-size:14px; }
      footer div { display:flex; align-items:center; gap:9px; min-width:0; }
      footer div:last-child { justify-content:flex-end; }
      footer svg { width:20px; height:20px; flex:0 0 auto; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      @media (max-width:700px) {
        .card-shell { grid-template-columns:1fr; }
        .tank-panel { padding:12px 22px 0; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--divider-color,#536069) 25%,transparent); }
        .tank { width:min(72%,280px); }
        .content-panel { padding:24px; }
        .reading { margin:24px 0; text-align:center; }
        .forecast { grid-template-columns:1fr; }
        .forecast-copy { align-items:center; }
      }
      @media (max-width:420px) {
        header { align-items:flex-start; flex-direction:column; gap:8px; }
        footer { grid-template-columns:1fr; }
        footer div:last-child { justify-content:flex-start; }
      }
      @media (prefers-reduced-motion:no-preference) {
        .salt-highlight { animation:salt-settle 500ms ease-out; transform-origin:center; }
        @keyframes salt-settle { from { transform:translateY(-3px); opacity:0; } }
      }
    `;
  }
}
