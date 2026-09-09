import { describe, expect, it } from "vitest";
import {
  formatPercentage,
  getTranslations,
  resolveLanguage,
  resolveLocale,
} from "./localize";

describe("localization", () => {
  it("maps Danish and German regional variants and falls back to English", () => {
    expect(resolveLocale("da")).toBe("da");
    expect(resolveLocale("da-DK")).toBe("da");
    expect(resolveLocale("de")).toBe("de");
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("de-DE")).toBe("de");
    expect(resolveLocale("fr-FR")).toBe("en");
  });

  it("falls back safely when a language tag is invalid", () => {
    expect(resolveLanguage("not_a_language")).toBe("en");
    expect(resolveLocale("not_a_language")).toBe("en");
  });

  it("keeps all translation catalogs in sync", () => {
    expect(Object.keys(getTranslations("da")).sort()).toEqual(
      Object.keys(getTranslations("en")).sort(),
    );
    expect(Object.keys(getTranslations("de")).sort()).toEqual(
      Object.keys(getTranslations("en")).sort(),
    );
  });

  it("uses the reviewed Danish terminology for the low marker", () => {
    const translations = getTranslations("da");
    expect(translations.lowMarker).toBe("Minimumsmærke");
    expect(translations.lowMarkerAt).toBe("Minimumsmærke ved {value}");
    expect(translations.marker).toBe("Oversigt over minimumsmærke");
    expect(translations.showLowMarker).toBe("Vis minimumsmærke under værdierne");
  });

  it("formats percentages using the full Home Assistant language tag", () => {
    expect(formatPercentage(62, "en-GB")).toBe("62%");
    expect(formatPercentage(62, "da-DK").replace(/\s/g, "")).toBe("62%");
    expect(formatPercentage(62, "de-DE").replace(/\s/g, "")).toBe("62%");
  });
});
