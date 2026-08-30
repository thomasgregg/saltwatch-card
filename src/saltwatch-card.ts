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
    return 8;
  }

  public getGridOptions(): Record<string, number> {
    return { columns: 12, rows: 9, min_columns: 6, min_rows: 7 };
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

    const tankTop = 132;
    const tankBottom = 474;
    const tankHeight = tankBottom - tankTop;
    const saltY = level === undefined ? tankBottom : tankBottom - (level / 100) * tankHeight;
    const thresholdY = tankBottom - (threshold / 100) * tankHeight;
    const moundAmplitude = 8;
    const saltPath = [
      `M96 ${(saltY + 2).toFixed(1)}`,
      `C126 ${(saltY - moundAmplitude).toFixed(1)} 154 ${(saltY - 6).toFixed(1)} 181 ${(saltY - 1).toFixed(1)}`,
      `C211 ${(saltY + 5).toFixed(1)} 240 ${(saltY - 5).toFixed(1)} 270 ${(saltY + 2).toFixed(1)}`,
      `C290 ${(saltY + 5).toFixed(1)} 306 ${(saltY + 3).toFixed(1)} 324 ${(saltY + 1).toFixed(1)}`,
      `L324 ${tankBottom}`,
      `L96 ${tankBottom}`,
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
        const y = 474 - (value / 100) * 342;
        return `<text x="54" y="${y + 5}" text-anchor="end">${value}%</text><path d="M62 ${y}h14"/>`;
      })
      .join("");
    const unavailable = level === undefined;
    const labelY = Math.max(134, Math.min(470, thresholdY));

    return `
      <svg class="tank" viewBox="0 0 400 560" role="img" aria-label="${unavailable ? "No current salt level" : `${Math.round(level)} percent estimated salt level`}">
        <defs>
          <linearGradient id="tank-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#626a70"/><stop offset=".13" stop-color="#2c3338"/><stop offset=".52" stop-color="#12171a"/><stop offset=".82" stop-color="#343b40"/><stop offset="1" stop-color="#171c20"/>
          </linearGradient>
          <linearGradient id="tank-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#20262a"/><stop offset=".18" stop-color="#5d656b"/><stop offset=".35" stop-color="#252b2f"/><stop offset=".8" stop-color="#151a1d"/><stop offset="1" stop-color="#4e565c"/>
          </linearGradient>
          <linearGradient id="lid-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#646c72"/><stop offset=".22" stop-color="#353c41"/><stop offset=".72" stop-color="#151a1d"/><stop offset="1" stop-color="#30373c"/>
          </linearGradient>
          <linearGradient id="tank-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#090d0f"/><stop offset=".13" stop-color="#1d2327"/><stop offset=".52" stop-color="#242a2e"/><stop offset=".88" stop-color="#121719"/><stop offset="1" stop-color="#080b0d"/>
          </linearGradient>
          <linearGradient id="glass-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset=".1" stop-color="#ffffff" stop-opacity=".03"/><stop offset=".48" stop-color="#ffffff" stop-opacity="0"/><stop offset=".86" stop-color="#ffffff" stop-opacity=".045"/><stop offset="1" stop-color="#ffffff" stop-opacity=".14"/>
          </linearGradient>
          <pattern id="pellets" width="34" height="29" patternUnits="userSpaceOnUse" patternTransform="rotate(-2)">
            <rect width="34" height="29" fill="#d9d0bd"/>
            <path d="M1 4Q4 0 9 2l3 3-2 5-7 1-3-3Z" fill="#fffbed"/>
            <path d="m14 1 7 1 2 4-4 5-7-2-1-4Z" fill="#e9e0cd"/>
            <path d="m25 3 6-1 4 4-2 6-7 1-4-5Z" fill="#f8f2e3"/>
            <path d="m5 14 7-2 5 4-2 6-8 1-4-4Z" fill="#eee6d5"/>
            <path d="m19 13 7-1 4 4-1 6-8 2-4-5Z" fill="#fff9e9"/>
            <path d="m31 15 5 3-1 7-6 2-4-5 1-5Z" fill="#d2c7b2"/>
            <path d="m1 24 6-2 5 4-1 4H2Z" fill="#f9f3e4"/>
            <path d="m13 25 6-2 5 3-1 4H14Z" fill="#d8cdb8"/>
            <path d="m25 26 5-3 5 3-1 4h-8Z" fill="#f4eddd"/>
            <g fill="none" stroke="#b8ad98" stroke-opacity=".45" stroke-width=".7"><path d="m3 8 6-3"/><path d="m15 7 6-3"/><path d="m26 9 6-3"/><path d="m7 20 7-4"/><path d="m20 20 7-4"/></g>
          </pattern>
          <pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="13" height="13" fill="#151b1e"/><rect width="4" height="13" fill="#30383d"/>
          </pattern>
          <clipPath id="tank-window"><path d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z"/></clipPath>
          <filter id="frame-shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="13" flood-color="#000" flood-opacity=".55"/></filter>
          <filter id="salt-shadow" x="-10%" y="-12%" width="120%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency=".08 .18" numOctaves="2" seed="13" result="noise"/>
            <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
            <feComposite in="mono" in2="SourceAlpha" operator="in" result="texture"/>
            <feBlend in="SourceGraphic" in2="texture" mode="soft-light" result="grain"/>
            <feDropShadow in="grain" dx="0" dy="-3" stdDeviation="4" flood-color="#fff" flood-opacity=".22"/>
          </filter>
        </defs>
        <g class="ruler">${percentageLabels}</g>
        <ellipse cx="211" cy="510" rx="132" ry="19" fill="#000" opacity=".4"/>
        <g filter="url(#frame-shadow)">
          <path d="M80 104Q80 88 96 82H324Q340 88 340 104V452Q340 486 306 492H114Q80 486 80 452Z" fill="url(#tank-frame)" stroke="#111619" stroke-width="3"/>
          <path d="M80 147V450Q80 483 111 491L94 499Q69 487 69 452V151Z" fill="url(#tank-edge)" opacity=".9"/>
          <path d="M340 147V450Q340 483 309 491L326 499Q351 487 351 452V151Z" fill="url(#tank-edge)" opacity=".9"/>
          <path d="M68 91Q68 68 91 63H329Q352 68 352 91L361 102V119H59V102Z" fill="url(#lid-face)" stroke="#0d1113" stroke-width="3"/>
          <path d="M60 105H360V122Q358 132 348 136H72Q62 132 60 122Z" fill="url(#tank-edge)" stroke="#0b0f11" stroke-width="2"/>
          <path d="M151 63V43Q151 34 161 32H259Q269 34 269 43V63Z" fill="url(#lid-face)" stroke="#161b1e" stroke-width="3"/>
          <path d="M160 43H260" stroke="#7c8489" stroke-opacity=".45" stroke-width="2"/>
          <path d="M99 492H321L310 518H110Z" fill="url(#tank-edge)" stroke="#0b0e10" stroke-width="3"/>
        </g>
        <path d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z" fill="url(#tank-glass)" stroke="#687177" stroke-width="4"/>
        <g clip-path="url(#tank-window)">
          ${unavailable
            ? `<rect x="96" y="110" width="228" height="364" fill="url(#hatch)" opacity=".82"/><text class="no-reading" x="210" y="320" text-anchor="middle">?</text>`
            : `<path class="salt-fill" data-level="${level}" data-surface-y="${saltY.toFixed(1)}" d="${saltPath}" fill="url(#pellets)" filter="url(#salt-shadow)"/><path class="salt-highlight" d="M98 ${(saltY + 2).toFixed(1)} C128 ${(saltY - 8).toFixed(1)} 154 ${(saltY - 6).toFixed(1)} 182 ${(saltY - 1).toFixed(1)} C211 ${(saltY + 5).toFixed(1)} 240 ${(saltY - 5).toFixed(1)} 270 ${(saltY + 2).toFixed(1)} C291 ${(saltY + 5).toFixed(1)} 306 ${(saltY + 3).toFixed(1)} 322 ${(saltY + 1).toFixed(1)}"/>`}
          <rect x="96" y="110" width="228" height="364" fill="url(#glass-sheen)" opacity=".38"/>
        </g>
        <path d="M97 146V443Q97 468 121 473" fill="none" stroke="#ffffff" stroke-opacity=".11" stroke-width="5"/>
        <path class="threshold tone-${tone}" data-threshold="${threshold}" data-threshold-y="${thresholdY.toFixed(1)}" d="M58 ${thresholdY.toFixed(1)}H326"/>
        <g class="threshold-label tone-${tone}" transform="translate(4 ${labelY - 15})">
          <rect width="54" height="30" rx="9"/><text x="27" y="20" text-anchor="middle">LOW</text>
        </g>
        <text class="threshold-value" x="334" y="${labelY + 5}" text-anchor="start">${Math.round(threshold)}%</text>
      </svg>`;
  }

  private styles(): string {
    return `
      :host { display:block; container-type:inline-size; --sw-good:#58c97a; --sw-low:#f05d5e; --sw-warning:#f2ae32; --sw-fault:#8d9aa1; }
      * { box-sizing:border-box; }
      ha-card { display:block; overflow:hidden; color:var(--primary-text-color,#f4f6f7); background:linear-gradient(135deg,color-mix(in srgb,var(--ha-card-background,#181d21) 96%,#253039),color-mix(in srgb,var(--ha-card-background,#181d21) 86%,#050708)); border:1px solid color-mix(in srgb,var(--divider-color,#536069) 64%,transparent); border-radius:var(--ha-card-border-radius,24px); box-shadow:var(--ha-card-box-shadow,0 28px 70px rgba(0,0,0,.32)); cursor:pointer; }
      ha-card:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }
      .loading { padding:32px; color:var(--secondary-text-color,#aab2b7); }
      .card-shell { display:grid; grid-template-columns:minmax(420px,.96fr) minmax(480px,1.14fr); min-height:690px; }
      .tank-panel { display:grid; place-items:center; padding:26px 18px 20px 28px; background:radial-gradient(circle at 46% 43%,rgba(255,255,255,.052),transparent 54%),linear-gradient(90deg,rgba(0,0,0,.11),rgba(255,255,255,.012)); border-right:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
      .tank { width:min(100%,465px); height:auto; overflow:visible; }
      .ruler { fill:var(--secondary-text-color,#b1b8bc); stroke:var(--secondary-text-color,#b1b8bc); stroke-width:1.4; font:15px system-ui,sans-serif; }
      .ruler text { stroke:none; }
      .salt-highlight { fill:none; stroke:#fffaf0; stroke-width:3; opacity:.55; filter:drop-shadow(0 -2px 4px rgba(255,255,255,.18)); }
      .no-reading { fill:#8b969c; font:700 98px system-ui,sans-serif; filter:drop-shadow(0 4px 8px rgba(0,0,0,.4)); }
      .threshold { fill:none; stroke-width:3; filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 35%,transparent)); }
      .threshold.tone-good,.threshold.tone-warning { stroke:var(--sw-warning); }
      .threshold.tone-low { stroke:var(--sw-low); }
      .threshold.tone-fault { stroke:var(--sw-fault); }
      .threshold-label rect { fill:var(--sw-warning); }
      .threshold-label.tone-low rect { fill:var(--sw-low); }
      .threshold-label.tone-fault rect { fill:var(--sw-fault); }
      .threshold-label text { fill:#17130b; font:750 13px system-ui,sans-serif; letter-spacing:.02em; }
      .threshold-value { fill:var(--secondary-text-color,#aeb6bb); font:14px system-ui,sans-serif; }
      .content-panel { min-width:0; display:flex; flex-direction:column; padding:50px 48px 34px; }
      header { display:flex; align-items:center; justify-content:space-between; gap:22px; }
      .title { font-size:clamp(30px,3.6cqw,40px); font-weight:710; letter-spacing:-.04em; }
      .status { display:flex; align-items:center; gap:13px; color:var(--sw-good); font-size:clamp(18px,2.1cqw,23px); font-weight:590; white-space:nowrap; }
      .status-dot { width:17px; height:17px; border-radius:50%; background:currentColor; box-shadow:0 0 22px color-mix(in srgb,currentColor 55%,transparent),inset 0 1px 1px rgba(255,255,255,.28); }
      .tone-low .status { color:var(--sw-low); }.tone-warning .status { color:var(--sw-warning); }.tone-fault .status { color:var(--sw-fault); }
      .reading { margin:66px 0 48px; }
      .level { font-size:clamp(116px,13.5cqw,166px); line-height:.78; font-weight:720; letter-spacing:-.08em; font-variant-numeric:tabular-nums; text-shadow:0 7px 24px rgba(0,0,0,.28); }
      .level-label { margin-top:28px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(22px,2.7cqw,29px); font-weight:430; letter-spacing:-.02em; }
      .forecast { margin-top:auto; display:grid; grid-template-columns:1fr; gap:15px; min-height:230px; padding:30px 32px 24px; border:1px solid color-mix(in srgb,var(--divider-color,#536069) 55%,transparent); border-radius:19px; background:linear-gradient(145deg,rgba(255,255,255,.027),rgba(0,0,0,.07)); box-shadow:inset 0 1px 0 rgba(255,255,255,.018); }
      .forecast.no-history { grid-template-columns:1fr; }
      .forecast-copy { display:flex; flex-direction:column; }
      .forecast-copy strong { font-size:clamp(42px,5.4cqw,58px); line-height:.9; font-weight:670; letter-spacing:-.055em; }
      .forecast-copy span { margin-top:14px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(18px,2.2cqw,23px); }
      .chart { min-width:0; height:112px; margin-top:2px; }
      .chart svg { width:100%; height:100%; overflow:visible; }
      .chart-grid { fill:none; stroke:color-mix(in srgb,var(--divider-color,#536069) 45%,transparent); stroke-width:1; stroke-dasharray:3 4; }
      .chart-line { fill:none; stroke:var(--sw-warning); stroke-width:3.4; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; filter:drop-shadow(0 2px 4px rgba(242,174,50,.14)); }
      .chart-dot { fill:var(--sw-warning); }
      .chart text { fill:var(--secondary-text-color,#aeb6bb); font:15px system-ui,sans-serif; }
      footer { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:28px; padding-top:26px; border-top:1px solid color-mix(in srgb,var(--divider-color,#536069) 48%,transparent); color:var(--secondary-text-color,#aeb6bb); font-size:clamp(16px,1.9cqw,20px); }
      footer div { display:flex; align-items:center; gap:9px; min-width:0; }
      footer div:last-child { justify-content:flex-end; }
      footer svg { width:29px; height:29px; flex:0 0 auto; fill:none; stroke:currentColor; stroke-width:1.75; stroke-linecap:round; stroke-linejoin:round; }
      @container (max-width:880px) {
        .card-shell { grid-template-columns:1fr; }
        .tank-panel { padding:20px 30px 4px; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
        .tank { width:min(78%,400px); }
        .content-panel { padding:34px; }
        .reading { margin:45px 0 38px; text-align:center; }
        .level { font-size:clamp(110px,24cqw,154px); }
        .level-label { font-size:26px; }
        .forecast-copy { align-items:flex-start; }
      }
      @container (max-width:520px) {
        .tank-panel { padding:14px 14px 0; }
        .tank { width:min(92%,340px); }
        .content-panel { padding:28px 24px 25px; }
        header { align-items:flex-start; flex-direction:column; gap:12px; }
        .title { font-size:28px; }
        .status { font-size:18px; }
        .reading { margin:38px 0 32px; }
        .level { font-size:clamp(94px,29cqw,126px); }
        .level-label { margin-top:22px; font-size:21px; }
        .forecast { min-height:225px; padding:26px 24px 22px; }
        .forecast-copy { align-items:center; }
        .forecast-copy strong { font-size:44px; }
        .forecast-copy span { font-size:19px; }
        footer { grid-template-columns:1fr; }
        footer div:last-child { justify-content:flex-start; }
        footer { font-size:16px; }
        footer svg { width:23px; height:23px; }
      }
      @media (prefers-reduced-motion:no-preference) {
        .salt-highlight { animation:salt-settle 500ms ease-out; transform-origin:center; }
        @keyframes salt-settle { from { transform:translateY(-3px); opacity:0; } }
      }
    `;
  }
}
