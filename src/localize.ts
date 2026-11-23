import { da } from "./locales/da";
import { de } from "./locales/de";
import { en } from "./locales/en";
import type { TranslationCatalog, TranslationKey } from "./locales/en";

export type SupportedLocale = "da" | "de" | "en";
export type { TranslationCatalog, TranslationKey };

const translations: Record<SupportedLocale, TranslationCatalog> = { da, de, en };

export function resolveLanguage(language?: string): string {
  const detected = language?.trim() ||
    (typeof document !== "undefined" ? document.documentElement.lang : "") ||
    (typeof navigator !== "undefined" ? navigator.language : "") ||
    "en";
  try {
    return Intl.getCanonicalLocales(detected)[0] ?? "en";
  } catch {
    return "en";
  }
}

export function resolveLocale(language?: string): SupportedLocale {
  const detected = resolveLanguage(language).toLowerCase();
  if (detected === "da" || detected.startsWith("da-")) return "da";
  return detected === "de" || detected.startsWith("de-") ? "de" : "en";
}

export function getTranslations(locale = resolveLocale()): TranslationCatalog {
  return translations[locale];
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

/** HA frontend number-format preferences, independent of translation language. */
export interface NumberLocale {
  language: string;
  number_format?: string;
}

// Mirrors HA's common/number/format_number.ts numberFormatToLocale.
function numberFormatLocale(locale: NumberLocale): string | string[] | undefined {
  switch (locale.number_format) {
    case "comma_decimal": return ["en-US", "en"];
    case "decimal_comma": return ["de", "es", "it"];
    case "space_comma": return ["fr", "sv", "cs"];
    case "quote_decimal": return ["de-CH"];
    case "none": return "en-US";
    case "system": return undefined;
    default: return resolveLanguage(locale.language);
  }
}

export function formatNumber(value: number, locale: NumberLocale, decimals = 0): string {
  return new Intl.NumberFormat(numberFormatLocale(locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(locale.number_format === "none" ? { useGrouping: false } : {}),
  }).format(value);
}

export function formatPercentage(value: number, locale: NumberLocale, decimals = 0): string {
  // HA's blank_before_percent.ts bases unit spacing on language, not number format.
  const space = ["cs", "de", "fi", "fr", "sk", "sv"].includes(locale.language) ? "\u00a0" : "";
  return `${formatNumber(value, locale, decimals)}${space}%`;
}
