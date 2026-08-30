const z = /* @__PURE__ */ new Set(["", "unknown", "unavailable", "none", "nan"]);
function L(o) {
  if (typeof o == "number")
    return Number.isFinite(o) ? o : void 0;
  if (typeof o != "string" || z.has(o.trim().toLowerCase()))
    return;
  const t = Number(o);
  return Number.isFinite(t) ? t : void 0;
}
function g(o, t = 0, s = 100) {
  return Math.min(s, Math.max(t, o));
}
function w(o) {
  return L(o?.state);
}
function A(o, t, s) {
  const e = o?.trim().toLowerCase() ?? "";
  return e.includes("fault") || e.includes("error") ? { label: "Sensor fault", tone: "fault" } : e.includes("calibration") ? { label: "Calibration required", tone: "warning" } : t === void 0 ? { label: "No current reading", tone: "fault" } : e.includes("low") || t <= s ? { label: "Low salt", tone: "low" } : { label: o?.trim() || "Good", tone: "good" };
}
function D(o) {
  return o ? o.map((t) => L(t.s)).filter((t) => t !== void 0).map((t) => g(t)) : [];
}
function Z(o, t, s, e = 3) {
  if (o.length < 2) return "";
  const a = t - e * 2, i = s - e * 2;
  return o.map((n, r) => {
    const l = e + r / (o.length - 1) * a, c = e + (100 - g(n)) / 100 * i;
    return `${r === 0 ? "M" : "L"}${l.toFixed(1)} ${c.toFixed(1)}`;
  }).join(" ");
}
function G(o, t = Date.now()) {
  if (!o) return "Update unknown";
  const s = Date.parse(o);
  if (!Number.isFinite(s)) return "Update unknown";
  const e = Math.max(0, Math.floor((t - s) / 1e3));
  if (e < 60) return "Updated now";
  const a = Math.floor(e / 60);
  if (a < 60) return `Updated ${a}m ago`;
  const i = Math.floor(a / 60);
  return i < 24 ? `Updated ${i}h ago` : `Updated ${Math.floor(i / 24)}d ago`;
}
function f(o) {
  return String(o).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const M = 20, S = 336, T = 900 * 1e3;
function x(o, t) {
  return t ? o?.states[t] : void 0;
}
function V() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 16.5 4 20 7.5 7.5 20 4 16.5Zm4.2-.7 1.4 1.4m1.1-4.1 1.4 1.4m1.1-4.1 1.4 1.4"/></svg>';
}
function U() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>';
}
class O extends HTMLElement {
  config;
  _hass;
  history = [];
  historyRequestKey = "";
  historyRequestedAt = 0;
  historyGeneration = 0;
  constructor() {
    super(), this.attachShadow({ mode: "open" });
  }
  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: !0,
          selector: { entity: { domain: "sensor" } }
        },
        { name: "name", selector: { text: {} } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "status_entity", selector: { entity: {} } },
            { name: "threshold_entity", selector: { entity: {} } },
            { name: "forecast_entity", selector: { entity: { domain: "sensor" } } },
            { name: "distance_entity", selector: { entity: { domain: "sensor" } } }
          ]
        },
        {
          type: "grid",
          name: "",
          schema: [
            {
              name: "low_threshold",
              selector: { number: { min: 0, max: 100, step: 1, mode: "box" } }
            },
            {
              name: "history_hours",
              selector: { number: { min: 24, max: 720, step: 24, mode: "box" } }
            }
          ]
        },
        { name: "show_history", selector: { boolean: {} } }
      ],
      computeLabel: (t) => ({
        entity: "Estimated salt level entity",
        name: "Card title",
        status_entity: "Salt status entity",
        threshold_entity: "Low threshold entity",
        forecast_entity: "Days until low entity",
        distance_entity: "Distance to salt entity",
        low_threshold: "Fallback low threshold",
        history_hours: "History window in hours",
        show_history: "Show level history"
      })[t.name] ?? t.name
    };
  }
  static getStubConfig(t, s = [], e = []) {
    const a = [...s, ...e, ...Object.keys(t.states)], i = [...new Set(a)], n = (...m) => i.find((v) => m.every((k) => v.includes(k))), r = {
      entity: n("saltwatch", "salt_level") ?? n("salt", "level") ?? "sensor.saltwatch_salt_level",
      low_threshold: M,
      history_hours: S,
      show_history: !0
    }, l = n("saltwatch", "salt_status"), c = n("saltwatch", "low_salt_threshold"), h = n("saltwatch", "estimated_days_until_low_salt"), p = n("saltwatch", "distance_to_salt");
    return l && (r.status_entity = l), c && (r.threshold_entity = c), h && (r.forecast_entity = h), p && (r.distance_entity = p), r;
  }
  setConfig(t) {
    if (!t.entity || typeof t.entity != "string")
      throw new Error("SaltWatch Card requires an estimated salt level entity.");
    this.config = {
      ...t,
      low_threshold: t.low_threshold ?? M,
      history_hours: t.history_hours ?? S,
      show_history: t.show_history ?? !0
    }, this.history = [], this.historyRequestKey = "", this.historyGeneration += 1, this.render(), this.loadHistoryIfNeeded();
  }
  set hass(t) {
    this._hass = t, this.render(), this.loadHistoryIfNeeded();
  }
  getCardSize() {
    return 8;
  }
  getGridOptions() {
    return { columns: 12, rows: 9, min_columns: 6, min_rows: 7 };
  }
  async loadHistoryIfNeeded() {
    if (!this._hass || !this.config?.show_history) return;
    const t = g(this.config.history_hours ?? S, 24, 720), s = `${this.config.entity}:${t}`;
    if (s === this.historyRequestKey && Date.now() - this.historyRequestedAt < T) return;
    this.historyRequestKey = s, this.historyRequestedAt = Date.now();
    const a = ++this.historyGeneration, i = /* @__PURE__ */ new Date(), n = new Date(i.getTime() - t * 60 * 60 * 1e3);
    try {
      const r = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: n.toISOString(),
        end_time: i.toISOString(),
        entity_ids: [this.config.entity],
        minimal_response: !0,
        no_attributes: !0,
        significant_changes_only: !1
      });
      if (a !== this.historyGeneration) return;
      this.history = D(r[this.config.entity]), this.render();
    } catch {
      if (a !== this.historyGeneration) return;
      this.history = [], this.render();
    }
  }
  openMoreInfo() {
    if (!this.config) return;
    const t = new Event("hass-more-info", { bubbles: !0, composed: !0 });
    Object.assign(t, { detail: { entityId: this.config.entity } }), this.dispatchEvent(t);
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = '<ha-card><div class="loading">Waiting for Home Assistant…</div></ha-card>';
      return;
    }
    const t = x(this._hass, this.config.entity), s = w(t), e = s === void 0 ? void 0 : g(s), a = w(x(this._hass, this.config.threshold_entity)), i = g(a ?? this.config.low_threshold ?? M), n = x(this._hass, this.config.status_entity), r = A(n?.state, e, i), l = w(x(this._hass, this.config.forecast_entity)), c = x(this._hass, this.config.distance_entity), h = e === void 0 ? void 0 : w(c), p = f(this.config.name || "SaltWatch"), m = e === void 0 ? "—" : `${Math.round(e)}%`, v = G(t?.last_updated), k = 132, u = 474, H = u - k, d = e === void 0 ? u : u - e / 100 * H, q = u - i / 100 * H, E = [
      `M96 ${(d + 2).toFixed(1)}`,
      `C126 ${(d - 8).toFixed(1)} 154 ${(d - 6).toFixed(1)} 181 ${(d - 1).toFixed(1)}`,
      `C211 ${(d + 5).toFixed(1)} 240 ${(d - 5).toFixed(1)} 270 ${(d + 2).toFixed(1)}`,
      `C290 ${(d + 5).toFixed(1)} 306 ${(d + 3).toFixed(1)} 324 ${(d + 1).toFixed(1)}`,
      `L324 ${u}`,
      `L96 ${u}`,
      "Z"
    ].join(" "), _ = this.config.show_history !== !1, $ = _ ? [...this.history] : [];
    e !== void 0 && $.at(-1) !== e && $.push(e);
    const F = Z($, 360, 92, 5), Q = e === void 0 ? "Unavailable" : r.tone === "low" ? "0 days" : l === void 0 ? "Learning" : `${Math.max(0, Math.round(l))} days`, R = e === void 0 ? "measurement unavailable" : l === void 0 && r.tone !== "low" ? "forecast not ready" : "until low salt";
    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <ha-card class="tone-${r.tone}" tabindex="0" role="button" aria-label="${p}: ${f(m)}, ${f(r.label)}">
        <div class="card-shell">
          <section class="tank-panel" aria-label="Tank level visualization">
            ${this.tankSvg(e, E, d, q, i, r.tone)}
          </section>
          <section class="content-panel">
            <header>
              <div class="title">${p}</div>
              <div class="status"><span class="status-dot"></span>${f(r.label)}</div>
            </header>
            <div class="reading">
              <div class="level">${m}</div>
              <div class="level-label">${e === void 0 ? f(r.label) : "Estimated salt level"}</div>
            </div>
            <div class="forecast${_ ? "" : " no-history"}">
              <div class="forecast-copy">
                <strong>${f(Q)}</strong>
                <span>${f(R)}</span>
              </div>
              ${_ ? `<div class="chart" aria-label="Salt level history">
                <svg viewBox="0 0 360 92" preserveAspectRatio="none" role="img">
                  <path class="chart-grid" d="M5 23 H355 M5 69 H355" />
                  ${e !== void 0 && F ? `<path class="chart-line" d="${F}"/><circle class="chart-dot" cx="355" cy="${this.sparklineLastY(e)}" r="3.5"/>` : `<text x="180" y="50" text-anchor="middle">${e === void 0 ? "Measurement unavailable" : "History is learning"}</text>`}
                </svg>
              </div>` : ""}
            </div>
            <footer>
              <div>${V()}<span>${h === void 0 ? "Distance unavailable" : `Distance ${h.toFixed(1)} cm`}</span></div>
              <div>${U()}<span>${f(v)}</span></div>
            </footer>
          </section>
        </div>
      </ha-card>`;
    const C = this.shadowRoot.querySelector("ha-card");
    C?.addEventListener("click", () => this.openMoreInfo()), C?.addEventListener("keydown", (y) => {
      y instanceof KeyboardEvent && (y.key === "Enter" || y.key === " ") && (y.preventDefault(), this.openMoreInfo());
    });
  }
  sparklineLastY(t) {
    return t === void 0 ? "46" : (5 + (100 - t) / 100 * 82).toFixed(1);
  }
  tankSvg(t, s, e, a, i, n) {
    const r = [100, 75, 50, 25, 0].map((h) => {
      const p = 474 - h / 100 * 342;
      return `<text x="54" y="${p + 5}" text-anchor="end">${h}%</text><path d="M62 ${p}h14"/>`;
    }).join(""), l = t === void 0, c = Math.max(134, Math.min(470, a));
    return `
      <svg class="tank" viewBox="0 0 400 560" role="img" aria-label="${l ? "No current salt level" : `${Math.round(t)} percent estimated salt level`}">
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
        <g class="ruler">${r}</g>
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
          ${l ? '<rect x="96" y="110" width="228" height="364" fill="url(#hatch)" opacity=".82"/><text class="no-reading" x="210" y="320" text-anchor="middle">?</text>' : `<path class="salt-fill" data-level="${t}" data-surface-y="${e.toFixed(1)}" d="${s}" fill="url(#pellets)" filter="url(#salt-shadow)"/><path class="salt-highlight" d="M98 ${(e + 2).toFixed(1)} C128 ${(e - 8).toFixed(1)} 154 ${(e - 6).toFixed(1)} 182 ${(e - 1).toFixed(1)} C211 ${(e + 5).toFixed(1)} 240 ${(e - 5).toFixed(1)} 270 ${(e + 2).toFixed(1)} C291 ${(e + 5).toFixed(1)} 306 ${(e + 3).toFixed(1)} 322 ${(e + 1).toFixed(1)}"/>`}
          <rect x="96" y="110" width="228" height="364" fill="url(#glass-sheen)" opacity=".38"/>
        </g>
        <path d="M97 146V443Q97 468 121 473" fill="none" stroke="#ffffff" stroke-opacity=".11" stroke-width="5"/>
        <path class="threshold tone-${n}" data-threshold="${i}" data-threshold-y="${a.toFixed(1)}" d="M58 ${a.toFixed(1)}H326"/>
        <g class="threshold-label tone-${n}" transform="translate(4 ${c - 15})">
          <rect width="54" height="30" rx="9"/><text x="27" y="20" text-anchor="middle">LOW</text>
        </g>
        <text class="threshold-value" x="334" y="${c + 5}" text-anchor="start">${Math.round(i)}%</text>
      </svg>`;
  }
  styles() {
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
const b = "saltwatch-card", N = "0.1.0";
customElements.get(b) || customElements.define(b, O);
window.customCards = window.customCards || [];
window.customCards.some((o) => o.type === b) || window.customCards.push({
  type: b,
  name: "SaltWatch Card",
  description: "Visualize estimated water-softener salt level, health, and refill forecast.",
  preview: !0,
  documentationURL: "https://github.com/thomasgregg/saltwatch-card",
  getEntitySuggestion: (o, t) => {
    const s = o.states[t];
    return t.startsWith("sensor.") && t.toLowerCase().includes("salt") && s?.attributes.unit_of_measurement === "%" ? { config: { type: "custom:saltwatch-card", entity: t } } : null;
  }
});
console.info(
  `%c SALTWATCH-CARD %c ${N} `,
  "color:#102820;background:#f4ad32;font-weight:700;padding:2px 5px;border-radius:3px 0 0 3px",
  "color:#f4f6f7;background:#263139;font-weight:700;padding:2px 5px;border-radius:0 3px 3px 0"
);
export {
  O as SaltWatchCard
};
