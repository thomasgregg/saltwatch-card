const T = /* @__PURE__ */ new Set(["", "unknown", "unavailable", "none", "nan"]);
function H(o) {
  if (typeof o == "number")
    return Number.isFinite(o) ? o : void 0;
  if (typeof o != "string" || T.has(o.trim().toLowerCase()))
    return;
  const t = Number(o);
  return Number.isFinite(t) ? t : void 0;
}
function m(o, t = 0, r = 100) {
  return Math.min(r, Math.max(t, o));
}
function w(o) {
  return H(o?.state);
}
function U(o, t, r) {
  const e = o?.trim().toLowerCase() ?? "";
  return e.includes("fault") || e.includes("error") ? { label: "Sensor fault", tone: "fault" } : e.includes("calibration") ? { label: "Calibration required", tone: "warning" } : t === void 0 ? { label: "No current reading", tone: "fault" } : e.includes("low") || t <= r ? { label: "Low salt", tone: "low" } : { label: o?.trim() || "Good", tone: "good" };
}
function q(o) {
  return o ? o.map((t) => H(t.s)).filter((t) => t !== void 0).map((t) => m(t)) : [];
}
function G(o, t, r, e = 3) {
  if (o.length < 2) return "";
  const a = t - e * 2, i = r - e * 2;
  return o.map((n, s) => {
    const l = e + s / (o.length - 1) * a, d = e + (100 - m(n)) / 100 * i;
    return `${s === 0 ? "M" : "L"}${l.toFixed(1)} ${d.toFixed(1)}`;
  }).join(" ");
}
function O(o, t = Date.now()) {
  if (!o) return "Update unknown";
  const r = Date.parse(o);
  if (!Number.isFinite(r)) return "Update unknown";
  const e = Math.max(0, Math.floor((t - r) / 1e3));
  if (e < 60) return "Updated now";
  const a = Math.floor(e / 60);
  if (a < 60) return `Updated ${a}m ago`;
  const i = Math.floor(a / 60);
  return i < 24 ? `Updated ${i}h ago` : `Updated ${Math.floor(i / 24)}d ago`;
}
function p(o) {
  return String(o).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const S = 20, M = 336, N = 900 * 1e3;
function g(o, t) {
  return t ? o?.states[t] : void 0;
}
function z() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 16.5 4 20 7.5 7.5 20 4 16.5Zm4.2-.7 1.4 1.4m1.1-4.1 1.4 1.4m1.1-4.1 1.4 1.4"/></svg>';
}
function W() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>';
}
class j extends HTMLElement {
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
  static getStubConfig(t, r = [], e = []) {
    const a = [...r, ...e, ...Object.keys(t.states)], i = [...new Set(a)], n = (...x) => i.find((b) => x.every((_) => b.includes(_))), s = {
      entity: n("saltwatch", "salt_level") ?? n("salt", "level") ?? "sensor.saltwatch_salt_level",
      low_threshold: S,
      history_hours: M,
      show_history: !0
    }, l = n("saltwatch", "salt_status"), d = n("saltwatch", "low_salt_threshold"), c = n("saltwatch", "estimated_days_until_low_salt"), h = n("saltwatch", "distance_to_salt");
    return l && (s.status_entity = l), d && (s.threshold_entity = d), c && (s.forecast_entity = c), h && (s.distance_entity = h), s;
  }
  setConfig(t) {
    if (!t.entity || typeof t.entity != "string")
      throw new Error("SaltWatch Card requires an estimated salt level entity.");
    this.config = {
      ...t,
      low_threshold: t.low_threshold ?? S,
      history_hours: t.history_hours ?? M,
      show_history: t.show_history ?? !0
    }, this.history = [], this.historyRequestKey = "", this.historyGeneration += 1, this.render(), this.loadHistoryIfNeeded();
  }
  set hass(t) {
    this._hass = t, this.render(), this.loadHistoryIfNeeded();
  }
  getCardSize() {
    return 5;
  }
  getGridOptions() {
    return { columns: 12, rows: 6, min_columns: 6, min_rows: 5 };
  }
  async loadHistoryIfNeeded() {
    if (!this._hass || !this.config?.show_history) return;
    const t = m(this.config.history_hours ?? M, 24, 720), r = `${this.config.entity}:${t}`;
    if (r === this.historyRequestKey && Date.now() - this.historyRequestedAt < N) return;
    this.historyRequestKey = r, this.historyRequestedAt = Date.now();
    const a = ++this.historyGeneration, i = /* @__PURE__ */ new Date(), n = new Date(i.getTime() - t * 60 * 60 * 1e3);
    try {
      const s = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: n.toISOString(),
        end_time: i.toISOString(),
        entity_ids: [this.config.entity],
        minimal_response: !0,
        no_attributes: !0,
        significant_changes_only: !1
      });
      if (a !== this.historyGeneration) return;
      this.history = q(s[this.config.entity]), this.render();
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
    const t = g(this._hass, this.config.entity), r = w(t), e = r === void 0 ? void 0 : m(r), a = w(g(this._hass, this.config.threshold_entity)), i = m(a ?? this.config.low_threshold ?? S), n = g(this._hass, this.config.status_entity), s = U(n?.state, e, i), l = w(g(this._hass, this.config.forecast_entity)), d = g(this._hass, this.config.distance_entity), c = e === void 0 ? void 0 : w(d), h = p(this.config.name || "SaltWatch"), x = e === void 0 ? "—" : `${Math.round(e)}%`, b = O(t?.last_updated), _ = 48, u = 274, C = u - _, f = e === void 0 ? u : u - e / 100 * C, E = u - i / 100 * C, R = [
      `M52 ${f.toFixed(1)}`,
      `C78 ${(f - 4.5).toFixed(1)} 102 ${(f + 2).toFixed(1)} 128 ${(f - 1).toFixed(1)}`,
      `C153 ${(f - 4).toFixed(1)} 179 ${(f + 3).toFixed(1)} 208 ${f.toFixed(1)}`,
      `L208 ${u}`,
      `L52 ${u}`,
      "Z"
    ].join(" "), k = this.config.show_history !== !1, $ = k ? [...this.history] : [];
    e !== void 0 && $.at(-1) !== e && $.push(e);
    const F = G($, 360, 92, 5), A = e === void 0 ? "Unavailable" : s.tone === "low" ? "0 days" : l === void 0 ? "Learning" : `${Math.max(0, Math.round(l))} days`, D = e === void 0 ? "measurement unavailable" : l === void 0 && s.tone !== "low" ? "forecast not ready" : "until low salt";
    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <ha-card class="tone-${s.tone}" tabindex="0" role="button" aria-label="${h}: ${p(x)}, ${p(s.label)}">
        <div class="card-shell">
          <section class="tank-panel" aria-label="Tank level visualization">
            ${this.tankSvg(e, R, f, E, i, s.tone)}
          </section>
          <section class="content-panel">
            <header>
              <div class="title">${h}</div>
              <div class="status"><span class="status-dot"></span>${p(s.label)}</div>
            </header>
            <div class="reading">
              <div class="level">${x}</div>
              <div class="level-label">${e === void 0 ? p(s.label) : "Estimated salt level"}</div>
            </div>
            <div class="forecast${k ? "" : " no-history"}">
              <div class="forecast-copy">
                <strong>${p(A)}</strong>
                <span>${p(D)}</span>
              </div>
              ${k ? `<div class="chart" aria-label="Salt level history">
                <svg viewBox="0 0 360 92" preserveAspectRatio="none" role="img">
                  <path class="chart-grid" d="M5 23 H355 M5 69 H355" />
                  ${e !== void 0 && F ? `<path class="chart-line" d="${F}"/><circle class="chart-dot" cx="355" cy="${this.sparklineLastY(e)}" r="3.5"/>` : `<text x="180" y="50" text-anchor="middle">${e === void 0 ? "Measurement unavailable" : "History is learning"}</text>`}
                </svg>
              </div>` : ""}
            </div>
            <footer>
              <div>${z()}<span>${c === void 0 ? "Distance unavailable" : `Distance ${c.toFixed(1)} cm`}</span></div>
              <div>${W()}<span>${p(b)}</span></div>
            </footer>
          </section>
        </div>
      </ha-card>`;
    const L = this.shadowRoot.querySelector("ha-card");
    L?.addEventListener("click", () => this.openMoreInfo()), L?.addEventListener("keydown", (y) => {
      y instanceof KeyboardEvent && (y.key === "Enter" || y.key === " ") && (y.preventDefault(), this.openMoreInfo());
    });
  }
  sparklineLastY(t) {
    return t === void 0 ? "46" : (5 + (100 - t) / 100 * 82).toFixed(1);
  }
  tankSvg(t, r, e, a, i, n) {
    const s = [100, 75, 50, 25, 0].map((c) => {
      const h = 274 - c / 100 * 226;
      return `<text x="24" y="${h + 4}" text-anchor="end">${c}%</text><path d="M29 ${h}h10"/>`;
    }).join(""), l = t === void 0, d = Math.max(52, Math.min(266, a));
    return `
      <svg class="tank" viewBox="0 0 250 320" role="img" aria-label="${l ? "No current salt level" : `${Math.round(t)} percent estimated salt level`}">
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
        <g class="ruler">${s}</g>
        <rect x="40" y="20" width="180" height="276" rx="28" fill="url(#tank-frame)"/>
        <path d="M34 34 Q34 20 50 16 H210 Q226 20 226 34 V48 H34Z" fill="url(#tank-frame)" stroke="#646b70" stroke-width="1"/>
        <rect x="48" y="44" width="164" height="234" rx="18" fill="url(#tank-glass)" stroke="#5c6469" stroke-width="2"/>
        <g clip-path="url(#tank-window)">
          ${l ? '<rect x="48" y="44" width="164" height="234" fill="url(#hatch)" opacity=".76"/><text class="no-reading" x="130" y="166" text-anchor="middle">?</text>' : `<path d="${r}" fill="url(#pellets)" filter="url(#salt-shadow)"/><path class="salt-highlight" d="M54 ${e.toFixed(1)} C82 ${(e - 4).toFixed(1)} 103 ${(e + 2).toFixed(1)} 130 ${(e - 1).toFixed(1)} C154 ${(e - 4).toFixed(1)} 180 ${(e + 3).toFixed(1)} 206 ${e.toFixed(1)}"/>`}
          <rect x="48" y="44" width="164" height="234" fill="url(#glass-sheen)" opacity=".08"/>
        </g>
        <path class="threshold tone-${n}" d="M40 ${a.toFixed(1)}H214"/>
        <g class="threshold-label tone-${n}" transform="translate(2 ${d - 11})">
          <rect width="38" height="22" rx="7"/><text x="19" y="15" text-anchor="middle">LOW</text>
        </g>
        <text class="threshold-value" x="218" y="${d + 4}" text-anchor="start">${Math.round(i)}%</text>
        <path d="M56 287h148l-10 17H66Z" fill="#111619"/>
      </svg>`;
  }
  styles() {
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
const v = "saltwatch-card", I = "0.1.0";
customElements.get(v) || customElements.define(v, j);
window.customCards = window.customCards || [];
window.customCards.some((o) => o.type === v) || window.customCards.push({
  type: v,
  name: "SaltWatch Card",
  description: "Visualize estimated water-softener salt level, health, and refill forecast.",
  preview: !0,
  documentationURL: "https://github.com/thomasgregg/saltwatch-card",
  getEntitySuggestion: (o, t) => {
    const r = o.states[t];
    return t.startsWith("sensor.") && t.toLowerCase().includes("salt") && r?.attributes.unit_of_measurement === "%" ? { config: { type: "custom:saltwatch-card", entity: t } } : null;
  }
});
console.info(
  `%c SALTWATCH-CARD %c ${I} `,
  "color:#102820;background:#f4ad32;font-weight:700;padding:2px 5px;border-radius:3px 0 0 3px",
  "color:#f4f6f7;background:#263139;font-weight:700;padding:2px 5px;border-radius:0 3px 3px 0"
);
export {
  j as SaltWatchCard
};
