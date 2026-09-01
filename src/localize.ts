import { de } from "./locales/de";
import { en } from "./locales/en";
import type { TranslationCatalog, TranslationKey } from "./locales/en";

export type SupportedLocale = "de" | "en";
export type { TranslationCatalog, TranslationKey };

const translations: Record<SupportedLocale, TranslationCatalog> = { de, en };

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

export function formatPercentage(value: number, language = resolveLanguage()): string {
  return new Intl.NumberFormat(resolveLanguage(language), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}
