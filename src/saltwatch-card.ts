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
        { name: "name", selector: { text: {} } },
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
          name: "Card title",
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

    this.config = {
      ...config,
      low_threshold: config.low_threshold ?? DEFAULT_THRESHOLD,
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
    const title = escapeHtml(this.config.name || "SaltWatch");
    const displayLevel = level === undefined ? "—" : `${Math.round(level)}%`;

    const tankTop = 132;
    const tankBottom = 474;
    const tankHeight = tankBottom - tankTop;
    const saltY = level === undefined ? tankBottom : tankBottom - (level / 100) * tankHeight;
    const thresholdY = tankBottom - (threshold / 100) * tankHeight;
    const moundAmplitude = 12;
    const saltPath = [
      `M96 ${(saltY + 3).toFixed(1)}`,
      `C111 ${(saltY - 2).toFixed(1)} 121 ${(saltY - moundAmplitude).toFixed(1)} 138 ${(saltY - 10).toFixed(1)}`,
      `C155 ${(saltY - 8).toFixed(1)} 168 ${(saltY - 1).toFixed(1)} 184 ${(saltY + 1).toFixed(1)}`,
      `C201 ${(saltY + 5).toFixed(1)} 216 ${(saltY - 7).toFixed(1)} 235 ${(saltY - 4).toFixed(1)}`,
      `C251 ${(saltY - 3).toFixed(1)} 263 ${(saltY + 6).toFixed(1)} 280 ${(saltY + 4).toFixed(1)}`,
      `C296 ${(saltY + 2).toFixed(1)} 308 ${(saltY - 3).toFixed(1)} 324 ${(saltY + 2).toFixed(1)}`,
      `L324 ${tankBottom}`,
      `L96 ${tankBottom}`,
      "Z",
    ].join(" ");

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
            <div class="threshold-summary" aria-label="Low salt marker at ${Math.round(threshold)} percent">
              <span class="marker-line"></span>
              <span>Low marker</span>
              <strong>${Math.round(threshold)}%</strong>
            </div>
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

  private tankSvg(
    level: number | undefined,
    saltPath: string,
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
            <stop offset="0" stop-color="#747b80"/><stop offset=".09" stop-color="#343b40"/><stop offset=".32" stop-color="#171c1f"/><stop offset=".7" stop-color="#0e1316"/><stop offset=".91" stop-color="#3b4247"/><stop offset="1" stop-color="#171c20"/>
          </linearGradient>
          <linearGradient id="tank-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#111619"/><stop offset=".15" stop-color="#626a6f"/><stop offset=".27" stop-color="#282f33"/><stop offset=".76" stop-color="#111619"/><stop offset="1" stop-color="#555d62"/>
          </linearGradient>
          <linearGradient id="lid-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#697176"/><stop offset=".13" stop-color="#41484d"/><stop offset=".52" stop-color="#181d20"/><stop offset=".8" stop-color="#101518"/><stop offset="1" stop-color="#343b40"/>
          </linearGradient>
          <linearGradient id="tank-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#090d0f"/><stop offset=".13" stop-color="#1d2327"/><stop offset=".52" stop-color="#242a2e"/><stop offset=".88" stop-color="#121719"/><stop offset="1" stop-color="#080b0d"/>
          </linearGradient>
          <linearGradient id="glass-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset=".1" stop-color="#ffffff" stop-opacity=".03"/><stop offset=".48" stop-color="#ffffff" stop-opacity="0"/><stop offset=".86" stop-color="#ffffff" stop-opacity=".045"/><stop offset="1" stop-color="#ffffff" stop-opacity=".14"/>
          </linearGradient>
          <linearGradient id="salt-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f4efe4"/><stop offset=".18" stop-color="#e8e0d1"/><stop offset=".72" stop-color="#d7cebd"/><stop offset="1" stop-color="#c8beab"/>
          </linearGradient>
          <linearGradient id="salt-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".52" stop-color="#8d806c" stop-opacity=".04"/><stop offset="1" stop-color="#625744" stop-opacity=".24"/>
          </linearGradient>
          <linearGradient id="crystal-light" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fffdf5"/><stop offset=".45" stop-color="#eee7d8"/><stop offset="1" stop-color="#beb39f"/>
          </linearGradient>
          <linearGradient id="crystal-warm" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#eee7d8"/><stop offset=".55" stop-color="#d8cebc"/><stop offset="1" stop-color="#a99e8b"/>
          </linearGradient>
          <pattern id="pellets" width="19" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(-1) scale(.8)">
            <g stroke="#9f9584" stroke-width=".38" stroke-linejoin="round">
              <path d="M-1 1 3-.5 6 1.8 4.7 5 1 5.6-1 3.5Z" fill="url(#crystal-light)"/>
              <path d="m7 .5 4-1 3.2 2.4-.9 3.3-4.4.5-2.5-2.3Z" fill="url(#crystal-warm)"/>
              <path d="m15 1 3.2-1.2 2.5 2.5-1.1 3.5-4.2-.2-1.7-2.3Z" fill="url(#crystal-light)"/>
              <path d="m2 6.2 4.2-.8 2.5 2.8-1.5 3.4-4.4.1L.7 9Z" fill="url(#crystal-warm)"/>
              <path d="m10 6 4.5-.2 2.1 3.2-2 3.1-4.1-.7-1.8-2.5Z" fill="url(#crystal-light)"/>
              <path d="m17 6.4 3.2 1.5-.4 4.2-3.7 1-2-3.3Z" fill="url(#crystal-warm)"/>
              <path d="m-1 12 3.7-.9 2.9 2.5-1.3 3.7H.2l-2-2.4Z" fill="url(#crystal-light)"/>
              <path d="m6.4 12.4 4.1-.7 2.7 2.6-1.4 3.5-4.4.1-2.2-2.8Z" fill="url(#crystal-light)"/>
              <path d="m14 12.7 3.6-1.1 2.8 2.8-1.6 3.5h-4.2l-1.8-2.9Z" fill="url(#crystal-warm)"/>
            </g>
            <g fill="none" stroke="#fffdf7" stroke-opacity=".7" stroke-width=".42"><path d="m1 2 3-.8"/><path d="m8.8 1.5 3-.5"/><path d="m3 7.4 3-.7"/><path d="m11 7.1 3-.2"/><path d="m7.5 13.4 3-.5"/></g>
          </pattern>
          <pattern id="salt-facets" width="37" height="31" patternUnits="userSpaceOnUse" patternTransform="rotate(4) scale(.86)">
            <g fill="none" stroke="#766d60" stroke-opacity=".23" stroke-width=".65"><path d="m2 7 5 2 3-5"/><path d="m15 4 4 3 5-3"/><path d="m28 8 4-4 4 3"/><path d="m5 20 5-3 4 4"/><path d="m21 18 4-3 5 4"/><path d="m30 27 4-4 4 3"/></g>
          </pattern>
          <pattern id="pellet-variation" width="43" height="37" patternUnits="userSpaceOnUse" patternTransform="rotate(-7)">
            <g stroke-linejoin="round">
              <path d="m3 8 3-2 3 1-1 4-4 1Z" fill="#887d6c" opacity=".2"/>
              <path d="m16 3 4-1 2 3-3 3-4-2Z" fill="#fffef7" opacity=".28"/>
              <path d="m31 8 3-2 4 2-2 4-4-1Z" fill="#918571" opacity=".23"/>
              <path d="m10 23 4-2 3 3-2 4-5-1Z" fill="#fffdf4" opacity=".23"/>
              <path d="m25 18 3-3 4 2-1 5-4 1Z" fill="#7f7463" opacity=".2"/>
              <path d="m36 29 4-1 2 3-3 4-4-2Z" fill="#fffef9" opacity=".26"/>
              <path d="m4 34 4-3 3 2-1 4H6Z" fill="#817563" opacity=".18"/>
            </g>
          </pattern>
          <pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="13" height="13" fill="#151b1e"/><rect width="4" height="13" fill="#30383d"/>
          </pattern>
          <clipPath id="tank-window"><path d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z"/></clipPath>
          <filter id="frame-shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="13" flood-color="#000" flood-opacity=".62"/></filter>
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
            <feDropShadow in="grain" dx="0" dy="-3" stdDeviation="4" flood-color="#fff" flood-opacity=".22"/>
          </filter>
        </defs>
        <g class="ruler"><path class="scale-spine" d="M82 132V474"/>${rulerMarks}</g>
        <ellipse cx="211" cy="510" rx="132" ry="19" fill="#000" opacity=".4"/>
        <g filter="url(#frame-shadow)">
          <g filter="url(#polymer)">
            <path d="M80 104Q80 88 96 82H324Q340 88 340 104V452Q340 486 306 492H114Q80 486 80 452Z" fill="url(#tank-frame)" stroke="#0a0e10" stroke-width="3"/>
            <path d="M80 147V450Q80 483 111 491L94 499Q69 487 69 452V151Z" fill="url(#tank-edge)"/>
            <path d="M340 147V450Q340 483 309 491L326 499Q351 487 351 452V151Z" fill="url(#tank-edge)"/>
            <path d="M68 91Q68 70 91 63Q137 54 210 56Q283 54 329 63Q352 70 352 91L361 102V119H59V102Z" fill="url(#lid-face)" stroke="#090d0f" stroke-width="3"/>
            <path d="M60 105H360V122Q358 135 347 140H73Q62 135 60 122Z" fill="url(#tank-edge)" stroke="#090d0f" stroke-width="2.5"/>
            <path d="M151 63V43Q151 34 161 32H259Q269 34 269 43V63Z" fill="url(#lid-face)" stroke="#101518" stroke-width="3"/>
            <path d="M99 492H321L314 518H282L274 511H147L139 518H106Z" fill="url(#tank-edge)" stroke="#090d0f" stroke-width="3"/>
          </g>
          <path d="M76 91Q113 72 210 74Q307 72 344 91" fill="none" stroke="#8b9296" stroke-opacity=".34" stroke-width="2"/>
          <path d="M65 105H355" stroke="#7d858a" stroke-opacity=".42" stroke-width="1.4"/>
          <path d="M64 113H356" stroke="#070a0c" stroke-opacity=".9" stroke-width="3"/>
          <path d="M159 42H261M160 48H260" stroke="#888f93" stroke-opacity=".34" stroke-width="1.3"/>
          <path d="M77 148V446Q77 473 96 486" fill="none" stroke="#8f979c" stroke-opacity=".22" stroke-width="2"/>
          <path d="M343 148V446Q343 473 324 486" fill="none" stroke="#06090b" stroke-opacity=".72" stroke-width="3"/>
        </g>
        <path d="M91 130Q91 105 116 105H304Q329 105 329 130V449Q329 479 299 479H121Q91 479 91 449Z" fill="#080c0e" filter="url(#inner-shadow)"/>
        <path d="M96 132Q96 110 118 110H302Q324 110 324 132V448Q324 474 298 474H122Q96 474 96 448Z" fill="url(#tank-glass)" stroke="#70797f" stroke-width="4"/>
        <g clip-path="url(#tank-window)">
          ${unavailable
            ? `<rect x="96" y="110" width="228" height="364" fill="url(#hatch)" opacity=".82"/><text class="no-reading" x="210" y="320" text-anchor="middle">?</text>`
            : `<path class="salt-fill" data-level="${level}" data-surface-y="${saltY.toFixed(1)}" d="${saltPath}" fill="url(#salt-base)" filter="url(#salt-shadow)"/><path class="salt-grains" d="${saltPath}" fill="url(#pellets)"/><path class="salt-variation" d="${saltPath}" fill="url(#pellet-variation)"/><path class="salt-facets" d="${saltPath}" fill="url(#salt-facets)"/><path class="salt-depth" d="${saltPath}" fill="url(#salt-shade)"/><path class="salt-highlight" d="M97 ${(saltY + 3).toFixed(1)} C112 ${(saltY - 2).toFixed(1)} 122 ${(saltY - 12).toFixed(1)} 138 ${(saltY - 10).toFixed(1)} C155 ${(saltY - 8).toFixed(1)} 168 ${(saltY - 1).toFixed(1)} 184 ${(saltY + 1).toFixed(1)} C201 ${(saltY + 5).toFixed(1)} 216 ${(saltY - 7).toFixed(1)} 235 ${(saltY - 4).toFixed(1)} C251 ${(saltY - 3).toFixed(1)} 263 ${(saltY + 6).toFixed(1)} 280 ${(saltY + 4).toFixed(1)} C296 ${(saltY + 2).toFixed(1)} 308 ${(saltY - 3).toFixed(1)} 323 ${(saltY + 2).toFixed(1)}"/>`}
          <rect x="96" y="110" width="228" height="364" fill="url(#glass-sheen)" opacity=".38"/>
        </g>
        <path d="M97 146V443Q97 468 121 473" fill="none" stroke="#ffffff" stroke-opacity=".15" stroke-width="4"/>
        <path d="M322 145V443Q322 466 300 472" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="5"/>
        <path d="M108 119Q100 126 100 144" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
        <path class="threshold tone-${tone}" data-threshold="${threshold}" data-threshold-y="${thresholdY.toFixed(1)}" d="M12 ${thresholdY.toFixed(1)}H326"/>
        <g class="threshold-label tone-${tone}" transform="translate(-42 ${labelY - 15})">
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
      .card-shell { display:grid; grid-template-columns:minmax(390px,.98fr) minmax(380px,1.02fr); min-height:560px; }
      .tank-panel { display:grid; place-items:center; padding:10px 18px 6px 28px; background:radial-gradient(circle at 46% 43%,rgba(255,255,255,.052),transparent 54%),linear-gradient(90deg,rgba(0,0,0,.11),rgba(255,255,255,.012)); border-right:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
      .tank { width:min(100%,425px); height:auto; overflow:visible; }
      .ruler { fill:var(--secondary-text-color,#b1b8bc); stroke:var(--secondary-text-color,#b1b8bc); stroke-width:1.15; font:15px system-ui,sans-serif; }
      .ruler text { stroke:none; }
      .ruler .scale-spine { opacity:.28; stroke-width:.8; }
      .ruler .major { stroke-width:1.8; opacity:.92; }
      .ruler .medium { stroke-width:1.35; opacity:.74; }
      .ruler .minor { stroke-width:1; opacity:.72; }
      .salt-grains { opacity:.98; filter:drop-shadow(0 .5px .35px rgba(73,64,51,.38)); }
      .salt-variation { opacity:.9; mix-blend-mode:multiply; }
      .salt-facets { opacity:.72; mix-blend-mode:multiply; }
      .salt-depth { opacity:.9; mix-blend-mode:multiply; }
      .salt-highlight { fill:none; stroke:#fffdf5; stroke-width:2.2; opacity:.72; filter:drop-shadow(0 -2px 4px rgba(255,255,255,.24)); }
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
      .content-panel { min-width:0; display:flex; flex-direction:column; padding:48px 48px 38px; }
      header { display:flex; align-items:center; justify-content:space-between; gap:22px; }
      .title { font-size:clamp(30px,3.6cqw,40px); font-weight:710; letter-spacing:-.04em; }
      .status { display:flex; align-items:center; gap:13px; color:var(--sw-good); font-size:clamp(18px,2.1cqw,23px); font-weight:590; white-space:nowrap; }
      .status-dot { width:17px; height:17px; border-radius:50%; background:currentColor; box-shadow:0 0 22px color-mix(in srgb,currentColor 55%,transparent),inset 0 1px 1px rgba(255,255,255,.28); }
      .tone-low .status { color:var(--sw-low); }.tone-warning .status { color:var(--sw-warning); }.tone-fault .status { color:var(--sw-fault); }
      .reading { margin:auto 0; padding:54px 0 48px; }
      .level { font-size:clamp(112px,13cqw,158px); line-height:.78; font-weight:720; letter-spacing:-.08em; font-variant-numeric:tabular-nums; text-shadow:0 7px 24px rgba(0,0,0,.28); }
      .level-label { margin-top:28px; color:var(--secondary-text-color,#aeb6bb); font-size:clamp(22px,2.7cqw,29px); font-weight:430; letter-spacing:-.02em; }
      .threshold-summary { display:flex; align-items:center; gap:12px; padding-top:26px; border-top:1px solid color-mix(in srgb,var(--divider-color,#536069) 48%,transparent); color:var(--secondary-text-color,#aeb6bb); font-size:clamp(16px,1.9cqw,20px); }
      .threshold-summary strong { margin-left:auto; color:var(--primary-text-color,#f4f6f7); font-weight:650; font-variant-numeric:tabular-nums; }
      .marker-line { width:34px; height:3px; border-radius:3px; background:var(--sw-warning); box-shadow:0 0 7px rgba(242,174,50,.24); }
      .tone-low .marker-line { background:var(--sw-low); }.tone-fault .marker-line { background:var(--sw-fault); }
      @container (max-width:880px) {
        .card-shell { grid-template-columns:1fr; }
        .tank-panel { padding:20px 30px 4px; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--divider-color,#536069) 28%,transparent); }
        .tank { width:min(78%,390px); }
        .content-panel { padding:34px; }
        .reading { margin:0; padding:45px 0 38px; text-align:center; }
        .level { font-size:clamp(110px,24cqw,154px); }
        .level-label { font-size:26px; }
      }
      @container (max-width:520px) {
        .tank-panel { padding:14px 14px 0; }
        .tank { width:min(92%,340px); }
        .content-panel { padding:28px 24px 25px; }
        header { align-items:flex-start; flex-direction:column; gap:12px; }
        .title { font-size:28px; }
        .status { font-size:18px; }
        .reading { margin:0; padding:38px 0 32px; }
        .level { font-size:clamp(94px,29cqw,126px); }
        .level-label { margin-top:22px; font-size:21px; }
        .threshold-summary { font-size:16px; }
      }
      @media (prefers-reduced-motion:no-preference) {
        .salt-highlight { animation:salt-settle 500ms ease-out; transform-origin:center; }
        @keyframes salt-settle { from { transform:translateY(-3px); opacity:0; } }
      }
    `;
  }
}
