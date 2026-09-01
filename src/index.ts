import { SaltWatchCard } from "./saltwatch-card";
import { SaltWatchCardEditor } from "./saltwatch-card-editor";
import packageInfo from "../package.json";

const CARD_TAG = "saltwatch-card";
const VERSION = packageInfo.version;

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, SaltWatchCard);
}

if (!customElements.get("saltwatch-card-editor")) {
  customElements.define("saltwatch-card-editor", SaltWatchCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "SaltWatch Card",
    description: "Visualize a SaltWatch water-softener monitor as a detailed granular tank.",
    preview: true,
    documentationURL: "https://github.com/thomasgregg/saltwatch-card",
  });
}

console.info(
  `%c SALTWATCH-CARD %c ${VERSION} `,
  "color:#102820;background:#f4ad32;font-weight:700;padding:2px 5px;border-radius:3px 0 0 3px",
  "color:#f4f6f7;background:#263139;font-weight:700;padding:2px 5px;border-radius:0 3px 3px 0",
);

export { SaltWatchCard, SaltWatchCardEditor };
export type { HomeAssistant, SaltWatchCardConfig } from "./types";
