export type SupportedLocale = "de" | "en";

export type TranslationKey =
  | "actions"
  | "calibrationRequired"
  | "cardContent"
  | "doubleTapAction"
  | "estimatedLevel"
  | "estimatedLevelEntity"
  | "fallbackThreshold"
  | "good"
  | "holdAction"
  | "lowBadge"
  | "lowMarker"
  | "lowMarkerAt"
  | "lowSalt"
  | "noCurrentReading"
  | "percentageOnly"
  | "sensorFault"
  | "showLowMarker"
  | "showStatus"
  | "statusEntity"
  | "tankAndPercentage"
  | "tankLevelVisualization"
  | "tankOnly"
  | "tapAction"
  | "thresholdEntity";

const translations: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: {
    actions: "Actions",
    calibrationRequired: "Calibration required",
    cardContent: "Card content",
    doubleTapAction: "Double-tap action",
    estimatedLevel: "Estimated salt level",
    estimatedLevelEntity: "Estimated salt level entity",
    fallbackThreshold: "Fallback low threshold",
    good: "Good",
    holdAction: "Hold action",
    lowBadge: "LOW",
    lowMarker: "Low marker",
    lowMarkerAt: "Low salt marker at {value}",
    lowSalt: "Low salt",
    noCurrentReading: "No current reading",
    percentageOnly: "Percentage only",
    sensorFault: "Sensor fault",
    showLowMarker: "Show low marker below percentage",
    showStatus: "Show status",
    statusEntity: "Salt status entity",
    tankAndPercentage: "Tank and percentage",
    tankLevelVisualization: "Tank level visualization",
    tankOnly: "Tank only",
    tapAction: "Tap action",
    thresholdEntity: "Low threshold entity",
  },
  de: {
    actions: "Aktionen",
    calibrationRequired: "Kalibrierung erforderlich",
    cardContent: "Karteninhalt",
    doubleTapAction: "Doppeltipp-Aktion",
    estimatedLevel: "Geschätzter Salzstand",
    estimatedLevelEntity: "Entität für den geschätzten Salzstand",
    fallbackThreshold: "Ersatzwert für niedrigen Salzstand",
    good: "Gut",
    holdAction: "Halten-Aktion",
    lowBadge: "NIEDRIG",
    lowMarker: "Niedrig-Markierung",
    lowMarkerAt: "Markierung für niedrigen Salzstand bei {value}",
    lowSalt: "Salzstand niedrig",
    noCurrentReading: "Kein aktueller Messwert",
    percentageOnly: "Nur Prozentwert",
    sensorFault: "Sensorfehler",
    showLowMarker: "Niedrig-Markierung unter dem Prozentwert anzeigen",
    showStatus: "Status anzeigen",
    statusEntity: "Entität für den Salzstatus",
    tankAndPercentage: "Tank und Prozentwert",
    tankLevelVisualization: "Tankfüllstand",
    tankOnly: "Nur Tank",
    tapAction: "Tipp-Aktion",
    thresholdEntity: "Entität für den niedrigen Grenzwert",
  },
};

export function resolveLocale(language?: string): SupportedLocale {
  const detected = language ?? document.documentElement.lang ?? navigator.language;
  return detected.toLowerCase().startsWith("de") ? "de" : "en";
}

export function localize(
  key: TranslationKey,
  locale = resolveLocale(),
  replacements: Record<string, string> = {},
): string {
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
    translations[locale][key],
  );
}

export function formatPercentage(value: number, locale = resolveLocale()): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
