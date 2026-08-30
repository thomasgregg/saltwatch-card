import { SaltWatchCard } from "./saltwatch-card";

const CARD_TAG = "saltwatch-card";
const VERSION = "0.1.1";

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, SaltWatchCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "SaltWatch Card",
    description: "Visualize estimated water-softener salt level in a detailed granular tank.",
    preview: true,
    documentationURL: "https://github.com/thomasgregg/saltwatch-card",
    getEntitySuggestion: (hass, entityId) => {
      const state = hass.states[entityId];
      const isSaltPercentage = entityId.startsWith("sensor.") &&
        entityId.toLowerCase().includes("salt") &&
        state?.attributes.unit_of_measurement === "%";
      return isSaltPercentage
        ? { config: { type: "custom:saltwatch-card", entity: entityId } }
        : null;
    },
  });
}

console.info(
  `%c SALTWATCH-CARD %c ${VERSION} `,
  "color:#102820;background:#f4ad32;font-weight:700;padding:2px 5px;border-radius:3px 0 0 3px",
  "color:#f4f6f7;background:#263139;font-weight:700;padding:2px 5px;border-radius:0 3px 3px 0",
);

export { SaltWatchCard };
export type { HomeAssistant, SaltWatchCardConfig } from "./types";
