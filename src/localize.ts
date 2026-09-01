export type SupportedLocale = "de" | "en";

export type TranslationKey =
  | "actions"
  | "calibrationRequired"
  | "cardContent"
  | "doubleTapAction"
  | "dayUntilLowSalt"
  | "daysUntilLowSalt"
  | "estimatedLevel"
  | "estimatedLevelEntity"
  | "fallbackThreshold"
  | "forecastConfirmingRefill"
  | "forecastEntity"
  | "forecastInitializing"
  | "forecastInsufficientChange"
  | "forecastLearning"
  | "forecastOnly"
  | "forecastStatusEntity"
  | "forecastUnavailable"
  | "forecastWaitingForMeasurement"
  | "forecastWaitingForTime"
  | "good"
  | "holdAction"
  | "initializing"
  | "levelAndForecast"
  | "lowBadge"
  | "lowMarker"
  | "lowMarkerAt"
  | "lowSalt"
  | "lowThresholdReached"
  | "noCurrentReading"
  | "percentageOnly"
  | "saltLevel"
  | "saltLevelOnly"
  | "sensorFault"
  | "showLowMarker"
  | "showStatus"
  | "statusEntity"
  | "tankAndPercentage"
  | "tankLevelVisualization"
  | "tankOnly"
  | "tapAction"
  | "thresholdEntity"
  | "valueDisplay";

const translations: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: {
    actions: "Actions",
    calibrationRequired: "Calibration required",
    cardContent: "Card content",
    dayUntilLowSalt: "Day until low salt",
    daysUntilLowSalt: "Days until low salt",
    doubleTapAction: "Double-tap action",
    estimatedLevel: "Estimated salt level",
    estimatedLevelEntity: "Estimated salt level entity",
    fallbackThreshold: "Fallback low threshold",
    forecastConfirmingRefill: "Confirming refill",
    forecastEntity: "Estimated days until low salt entity",
    forecastInitializing: "Forecast initializing",
    forecastInsufficientChange: "No clear usage trend",
    forecastLearning: "Forecast learning",
    forecastOnly: "Forecast only",
    forecastStatusEntity: "Forecast status entity",
    forecastUnavailable: "Forecast unavailable",
    forecastWaitingForMeasurement: "Forecast waiting for measurement",
    forecastWaitingForTime: "Forecast waiting for time",
    good: "Good",
    holdAction: "Hold action",
    initializing: "Initializing",
    levelAndForecast: "Salt level and forecast",
    lowBadge: "LOW",
    lowMarker: "Low marker",
    lowMarkerAt: "Low salt marker at {value}",
    lowSalt: "Low salt",
    lowThresholdReached: "Low threshold reached",
    noCurrentReading: "No current reading",
    percentageOnly: "Details only",
    saltLevel: "Salt level",
    saltLevelOnly: "Salt level only",
    sensorFault: "Sensor fault",
    showLowMarker: "Show low marker below values",
    showStatus: "Show status",
    statusEntity: "Salt status entity",
    tankAndPercentage: "Tank and details",
    tankLevelVisualization: "Tank level visualization",
    tankOnly: "Tank only",
    tapAction: "Tap action",
    thresholdEntity: "Low threshold entity",
    valueDisplay: "Displayed values",
  },
  de: {
    actions: "Aktionen",
    calibrationRequired: "Kalibrierung erforderlich",
    cardContent: "Karteninhalt",
    dayUntilLowSalt: "Tag bis zum niedrigen Salzstand",
    daysUntilLowSalt: "Tage bis zum niedrigen Salzstand",
    doubleTapAction: "Doppeltipp-Aktion",
    estimatedLevel: "Geschätzter Salzstand",
    estimatedLevelEntity: "Entität für den geschätzten Salzstand",
    fallbackThreshold: "Ersatzwert für niedrigen Salzstand",
    forecastConfirmingRefill: "Nachfüllung wird bestätigt",
    forecastEntity: "Entität für geschätzte Tage bis zum niedrigen Salzstand",
    forecastInitializing: "Prognose wird initialisiert",
    forecastInsufficientChange: "Noch kein klarer Verbrauchstrend",
    forecastLearning: "Prognose lernt",
    forecastOnly: "Nur Prognose",
    forecastStatusEntity: "Entität für den Prognosestatus",
    forecastUnavailable: "Prognose nicht verfügbar",
    forecastWaitingForMeasurement: "Prognose wartet auf Messwert",
    forecastWaitingForTime: "Prognose wartet auf Zeit",
    good: "Gut",
    holdAction: "Halten-Aktion",
    initializing: "Wird initialisiert",
    levelAndForecast: "Salzstand und Prognose",
    lowBadge: "NIEDRIG",
    lowMarker: "Niedrig-Markierung",
    lowMarkerAt: "Markierung für niedrigen Salzstand bei {value}",
    lowSalt: "Salzstand niedrig",
    lowThresholdReached: "Niedriger Grenzwert erreicht",
    noCurrentReading: "Kein aktueller Messwert",
    percentageOnly: "Nur Details",
    saltLevel: "Salzstand",
    saltLevelOnly: "Nur Salzstand",
    sensorFault: "Sensorfehler",
    showLowMarker: "Niedrig-Markierung unter den Werten anzeigen",
    showStatus: "Status anzeigen",
    statusEntity: "Entität für den Salzstatus",
    tankAndPercentage: "Tank und Details",
    tankLevelVisualization: "Tankfüllstand",
    tankOnly: "Nur Tank",
    tapAction: "Tipp-Aktion",
    thresholdEntity: "Entität für den niedrigen Grenzwert",
    valueDisplay: "Angezeigte Werte",
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
