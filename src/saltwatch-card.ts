import saltTextureUrl from "../assets/salt-tablets.jpg?inline";
import {
  clamp,
  deriveStatus,
  entityNumber,
  escapeHtml,
} from "./model";
import type {
  HassEntity,
  HomeAssistant,
  SaltWatchCardConfig,
} from "./types";

const DEFAULT_THRESHOLD = 20;

function entity(hass: HomeAssistant | undefined, entityId: string | undefined): HassEntity | undefined {
  return entityId ? hass?.states[entityId] : undefined;
}

export class SaltWatchCard extends HTMLElement {
  private config?: SaltWatchCardConfig;
  private _hass?: HomeAssistant;

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
        { name: "show_status", selector: { boolean: {} } },
        { name: "show_low_marker", selector: { boolean: {} } },
        {
          name: "display_mode",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "both", label: "Tank and percentage" },
                { value: "tank", label: "Tank only" },
                { value: "details", label: "Percentage only" },
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
          name: "low_threshold",
          selector: { number: { min: 0, max: 100, step: 1, mode: "box" } },
        },
      ],
      computeLabel: (schema: { name: string }) => {
        const labels: Record<string, string> = {
          entity: "Estimated salt level entity",
          show_status: "Show status",
          show_low_marker: "Show low marker below percentage",
          display_mode: "Card content",
          status_entity: "Salt status entity",
          threshold_entity: "Low threshold entity",
          low_threshold: "Fallback low threshold",
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
      show_status: true,
      show_low_marker: true,
      display_mode: "both",
    };
    const status = find("saltwatch", "salt_status");
    const threshold = find("saltwatch", "low_salt_threshold");
    if (status) config.status_entity = status;
    if (threshold) config.threshold_entity = threshold;
    return config;
  }

  public setConfig(config: SaltWatchCardConfig): void {
    if (!config.entity || typeof config.entity !== "string") {
      throw new Error("SaltWatch Card requires an estimated salt level entity.");
    }

    const displayMode = config.display_mode === "tank" || config.display_mode === "details"
      ? config.display_mode
      : "both";
    this.config = {
      ...config,
      low_threshold: config.low_threshold ?? DEFAULT_THRESHOLD,
      show_status: config.show_status ?? true,
      show_low_marker: config.show_low_marker ?? true,
      display_mode: displayMode,
    };
    this.render();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.render();
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions(): Record<string, number> {
    return { columns: 12, rows: 7, min_columns: 6, min_rows: 6 };
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
    const displayMode = this.config.display_mode ?? "both";
    const showTank = displayMode !== "details";
    const showDetails = displayMode !== "tank";
    const showLowMarkerSummary = this.config.show_low_marker !== false;
    const title = escapeHtml(this.config.name || "SaltWatch");
    const displayLevel = level === undefined ? "—" : `${Math.round(level)}%`;
    const accessibleLevel = level === undefined ? "No current reading" : displayLevel;

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
      <ha-card class="tone-${status.tone}" tabindex="0" role="button" aria-label="${title}: ${escapeHtml(accessibleLevel)}, ${escapeHtml(status.label)}">
        <div class="card-shell mode-${displayMode}">
          ${showTank ? `<section class="tank-panel" aria-label="Tank level visualization">
            ${this.tankSvg(level, saltPath, surfacePath, saltY, thresholdY, threshold, status.tone)}
          </section>` : ""}
          ${showDetails ? `<section class="content-panel${showLowMarkerSummary ? "" : " without-threshold-summary"}">
            ${this.config.show_status ? `<header>
              <div class="status"><span class="status-dot"></span>${escapeHtml(status.label)}</div>
            </header>` : ""}
            <div class="reading${level === undefined ? " state-reading" : ""}">
              ${level === undefined ? this.stateSymbol(status.tone) : `<div class="level">${displayLevel}</div>`}
              <div class="level-label">${level === undefined ? escapeHtml(status.label) : "Estimated salt level"}</div>
            </div>
            ${showLowMarkerSummary ? `<div class="threshold-summary" aria-label="Low salt marker at ${Math.round(threshold)} percent">
              <span class="marker-line"></span>
              <span>Low marker</span>
              <strong>${Math.round(threshold)}%</strong>
            </div>` : ""}
          </section>` : ""}
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

  private tankSvg(
    level: number | undefined,
    saltPath: string,
    surfacePath: string,
    saltY: number,
    thresholdY: number,
    threshold: number,
    tone: string,
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

    return `
      <svg class="tank" viewBox="0 0 400 560" role="img" aria-label="${unavailable ? "No current salt level" : `${Math.round(level)} percent estimated salt level`}">
        <defs>
          <linearGradient id="tank-frame" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fbfbf8"/><stop offset=".1" stop-color="#ecefed"/><stop offset=".34" stop-color="#d9dfe0"/><stop offset=".7" stop-color="#bdc6c9"/><stop offset=".91" stop-color="#f1f3f1"/><stop offset="1" stop-color="#aeb8bc"/>
          </linearGradient>
          <linearGradient id="tank-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#0d1114"/><stop offset=".15" stop-color="#30373b"/><stop offset=".27" stop-color="#171d21"/><stop offset=".76" stop-color="#0b0f12"/><stop offset="1" stop-color="#242a2e"/>
          </linearGradient>
          <linearGradient id="lid-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#dce0df"/><stop offset=".24" stop-color="#c1c9ca"/><stop offset=".72" stop-color="#9ba7ab"/><stop offset="1" stop-color="#c9cfcf"/>
          </linearGradient>
          <linearGradient id="lid-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fffefa"/><stop offset=".16" stop-color="#ecefed"/><stop offset=".55" stop-color="#d4dadb"/><stop offset=".82" stop-color="#b7c0c3"/><stop offset="1" stop-color="#e5e8e6"/>
          </linearGradient>
          <linearGradient id="handle-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#e8eae8"/><stop offset=".18" stop-color="#cfd5d5"/><stop offset=".62" stop-color="#aeb8bb"/><stop offset="1" stop-color="#d9dddb"/>
          </linearGradient>
          <linearGradient id="tank-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#d8dcda"/><stop offset=".48" stop-color="#cbd1cf"/><stop offset="1" stop-color="#bbc4c2"/>
          </linearGradient>
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
            <rect width="13" height="13" fill="#151b1e"/><rect width="4" height="13" fill="#30383d"/>
          </pattern>
          <clipPath id="tank-window"><path d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z"/></clipPath>
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
        <g class="ruler"><path class="scale-spine" d="M82 132V474"/>${rulerMarks}</g>
        <ellipse cx="211" cy="510" rx="132" ry="19" fill="#000" opacity=".4"/>
        <g filter="url(#frame-shadow)">
          <g filter="url(#polymer)">
            <path d="M80 104Q80 88 96 82H324Q340 88 340 104V452Q340 486 306 492H114Q80 486 80 452Z" fill="url(#tank-frame)" stroke="#7e888d" stroke-width="2.5"/>
            <path d="M68 91Q68 70 91 63Q137 54 210 56Q283 54 329 63Q352 70 352 91L361 102V119H59V102Z" fill="url(#lid-face)" stroke="#7e888d" stroke-width="2.5"/>
            <path d="M60 105H360V122Q358 135 347 140H73Q62 135 60 122Z" fill="url(#lid-edge)" stroke="#748086" stroke-width="2"/>
            <path d="M151 63V43Q151 34 161 32H259Q269 34 269 43V63Z" fill="url(#handle-face)" stroke="#748086" stroke-width="2.5"/>
            <path d="M99 492H321L314 518H282L274 511H147L139 518H106Z" fill="url(#tank-edge)" stroke="#090d0f" stroke-width="3"/>
          </g>
          <path d="M76 91Q113 72 210 74Q307 72 344 91" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="2"/>
          <path d="M65 105H355" stroke="#fff" stroke-opacity=".72" stroke-width="1.4"/>
          <path d="M64 113H356" stroke="#5f696e" stroke-opacity=".72" stroke-width="2"/>
          <path d="M159 42H261M160 48H260" stroke="#888f93" stroke-opacity=".34" stroke-width="1.3"/>
        </g>
        <path d="M91 130Q91 105 116 105H304Q329 105 329 130V449Q329 479 299 479H121Q91 479 91 449Z" fill="#080c0e" filter="url(#inner-shadow)"/>
        <path class="tank-glass" d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z" fill="url(#tank-glass)"/>
        <g clip-path="url(#tank-window)">
          ${unavailable
            ? `<rect x="96" y="110" width="228" height="364" fill="url(#hatch)" opacity=".82"/><text class="no-reading" x="210" y="320" text-anchor="middle">?</text>`
            : `<path class="salt-fill" data-level="${level}" data-surface-y="${saltY.toFixed(1)}" d="${saltPath}" fill="url(#salt-base)" filter="url(#salt-shadow)"/><image class="salt-photo" href="${saltTextureUrl}" x="78.5" y="82" width="263" height="420" preserveAspectRatio="xMidYMid slice" clip-path="url(#salt-shape)"/><path class="salt-depth" d="${saltPath}" fill="url(#salt-shade)"/><path class="salt-highlight" d="${surfacePath}"/>`}
          <rect class="window-vignette" x="96" y="110" width="228" height="364" fill="url(#window-vignette)"/>
        </g>
        <path class="threshold tone-${tone}" data-threshold="${threshold}" data-threshold-y="${thresholdY.toFixed(1)}" d="M12 ${thresholdY.toFixed(1)}H326"/>
        <g class="threshold-label tone-${tone}" transform="translate(-42 ${labelY - 15})">
          <rect width="54" height="30" rx="9"/><text x="27" y="20" text-anchor="middle">LOW</text>
        </g>
      </svg>`;
  }

  private styles(): string {
    return `
      :host { display:block; container-type:inline-size; --sw-card-background:var(--card-background-color,var(--ha-card-background,#181d21)); --sw-good:var(--success-color,#58c97a); --sw-low:var(--error-color,#f05d5e); --sw-warning:var(--warning-color,#f2ae32); --sw-fault:var(--error-color,#ff5c64); }
      * { box-sizing:border-box; }
      ha-card { display:block; overflow:hidden; color:var(--primary-text-color,#f4f6f7); background:var(--sw-card-background); border-width:var(--ha-card-border-width,1px); border-style:solid; border-color:var(--ha-card-border-color,var(--divider-color,#e0e0e0)); border-radius:var(--ha-card-border-radius,12px); box-shadow:var(--ha-card-box-shadow,none); cursor:pointer; }
      ha-card:focus-visible { outline:2px solid var(--primary-color,#03a9f4); outline-offset:2px; }
      .loading { padding:32px; color:var(--secondary-text-color,#aab2b7); }
      .card-shell { display:grid; grid-template-columns:minmax(390px,.98fr) minmax(380px,1.02fr); min-height:560px; }
      .card-shell.mode-tank,.card-shell.mode-details { grid-template-columns:1fr; min-height:0; }
      .mode-tank .tank-panel { padding-block:8px; border-right:0; }
      .tank-panel { display:grid; place-items:center; padding:10px 18px 6px 28px; background:radial-gradient(circle at 46% 43%,rgba(255,255,255,.055),transparent 62%); border-right:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
      .tank { width:min(100%,425px); height:auto; overflow:visible; }
      .ruler { fill:var(--secondary-text-color,#b1b8bc); stroke:var(--secondary-text-color,#b1b8bc); stroke-width:1.15; font:15px system-ui,sans-serif; }
      .ruler text { stroke:none; }
      .ruler .scale-spine { opacity:.28; stroke-width:.8; }
      .ruler .major { stroke-width:1.8; opacity:.92; }
      .ruler .medium { stroke-width:1.35; opacity:.74; }
      .ruler .minor { stroke-width:1; opacity:.72; }
      .salt-photo { opacity:.98; filter:contrast(1.04) saturate(.15) brightness(1.04); }
      .salt-depth { opacity:.9; mix-blend-mode:multiply; }
      .salt-highlight { fill:none; stroke:#fff; stroke-width:.8; opacity:.28; }
      .no-reading { fill:#8b969c; font:700 98px system-ui,sans-serif; filter:drop-shadow(0 4px 8px rgba(0,0,0,.4)); }
      .threshold { fill:none; stroke:var(--sw-warning); stroke-width:3; filter:drop-shadow(0 0 5px color-mix(in srgb,currentColor 35%,transparent)); }
      .threshold.tone-low { stroke:var(--sw-low); }
      .threshold-label rect { fill:var(--sw-warning); }
      .threshold-label.tone-low rect { fill:var(--sw-low); }
      .threshold-label text { fill:#17130b; font:750 13px system-ui,sans-serif; letter-spacing:.02em; }
      .content-panel { min-width:0; display:flex; flex-direction:column; padding:48px 48px 38px; }
      header { min-width:0; display:flex; align-items:center; justify-content:flex-end; }
      .status { flex:0 0 auto; display:flex; align-items:center; gap:13px; margin-left:auto; color:var(--sw-good); font-size:clamp(18px,2.1cqw,23px); font-weight:590; white-space:nowrap; }
      .status-dot { width:17px; height:17px; border-radius:50%; background:currentColor; box-shadow:inset 0 1px 0 rgba(255,255,255,.22); }
      .tone-low .status { color:var(--sw-low); }.tone-warning .status { color:var(--sw-warning); }.tone-fault .status { color:var(--sw-fault); }
      .reading { margin:0; padding:36px 0 34px; }
      .without-threshold-summary .reading { padding-bottom:0; }
      .level { font-size:clamp(112px,13cqw,158px); line-height:.78; font-weight:720; letter-spacing:-.08em; font-variant-numeric:tabular-nums; }
      .state-symbol { display:block; width:clamp(92px,10cqw,122px); height:auto; overflow:visible; fill:none; stroke:currentColor; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; }
      .state-symbol .symbol-dot { fill:currentColor; stroke:none; }
      .tone-warning .state-symbol { color:var(--sw-warning); }.tone-fault .state-symbol { color:var(--sw-fault); }
      .level-label { margin-top:28px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(22px,2.7cqw,29px); font-weight:430; letter-spacing:-.02em; }
      .tone-warning .level-label { color:var(--sw-warning); }.tone-fault .level-label { color:var(--sw-fault); }
      .threshold-summary { display:flex; align-items:center; gap:12px; margin-top:auto; padding-top:26px; border-top:1px solid color-mix(in srgb,var(--divider-color,#536069) 48%,transparent); color:var(--secondary-text-color,#aeb6bb); font-size:clamp(16px,1.9cqw,20px); }
      .threshold-summary strong { margin-left:auto; color:var(--primary-text-color,#f4f6f7); font-weight:650; font-variant-numeric:tabular-nums; }
      .marker-line { width:34px; height:3px; border-radius:3px; background:var(--sw-warning); box-shadow:0 0 5px color-mix(in srgb,var(--sw-warning) 12%,transparent); }
      .tone-low .marker-line { background:var(--sw-low); box-shadow:0 0 5px color-mix(in srgb,var(--sw-low) 12%,transparent); }
      @container (max-width:880px) {
        .card-shell { grid-template-columns:1fr; min-height:0; }
        .tank-panel { padding:20px 30px 4px; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
        .mode-tank .tank-panel { border-bottom:0; }
        .tank { width:min(74%,370px); }
        .content-panel { padding:28px; }
        .reading { margin:0; padding:24px 0 26px; text-align:center; }
        .state-reading { display:flex; flex-direction:column; align-items:center; }
        .level { font-size:clamp(110px,24cqw,154px); }
        .level-label { font-size:26px; }
        .threshold-summary { padding-top:22px; }
      }
      @container (max-width:520px) {
        .tank-panel { padding:14px 14px 0; }
        .tank { width:min(76%,320px); }
        .content-panel { padding:20px 24px; }
        header { align-items:center; }
        .status { font-size:18px; }
        .reading { margin:0; padding:20px 0; }
        .state-symbol { width:90px; }
        .level { font-size:clamp(94px,29cqw,126px); }
        .level-label { margin-top:22px; font-size:21px; }
        .threshold-summary { padding-top:18px; font-size:16px; }
      }
      @container (max-width:400px) {
        .content-panel { padding-inline:16px; }
        .status { gap:8px; font-size:15px; }
        .status-dot { width:14px; height:14px; }
      }
      @media (prefers-reduced-motion:no-preference) {
        .salt-highlight { animation:salt-settle 500ms ease-out; transform-origin:center; }
        @keyframes salt-settle { from { transform:translateY(-3px); opacity:0; } }
      }
    `;
  }
}
