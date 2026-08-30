import type { HassEntity } from "./types";

export type CardTone = "good" | "low" | "warning" | "fault";
export type StatusTranslationKey =
  | "calibrationRequired"
  | "good"
  | "lowSalt"
  | "noCurrentReading"
  | "sensorFault";

const INVALID_STATES = new Set(["", "unknown", "unavailable", "none", "nan"]);

export function isInvalidState(value: string | undefined): boolean {
  return value === undefined || INVALID_STATES.has(value.trim().toLowerCase());
}

export function parseFinite(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string" || INVALID_STATES.has(value.trim().toLowerCase())) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function entityNumber(entity: HassEntity | undefined): number | undefined {
  return parseFinite(entity?.state);
}

export function deriveStatus(
  statusState: string | undefined,
  level: number | undefined,
  threshold: number,
): { label: string; tone: CardTone; translationKey?: StatusTranslationKey } {
  const normalized = statusState?.trim().toLowerCase() ?? "";

  if (normalized.includes("fault") || normalized.includes("error")) {
    return { label: "Sensor fault", tone: "fault", translationKey: "sensorFault" };
  }
  if (normalized.includes("calibration")) {
    return {
      label: "Calibration required",
      tone: "warning",
      translationKey: "calibrationRequired",
    };
  }
  if (level === undefined) {
    return {
      label: "No current reading",
      tone: "fault",
      translationKey: "noCurrentReading",
    };
  }
  if (normalized.includes("low") || level <= threshold) {
    return { label: "Low salt", tone: "low", translationKey: "lowSalt" };
  }
  if (normalized === "good") {
    return { label: "Good", tone: "good", translationKey: "good" };
  }
  return {
    label: isInvalidState(statusState) ? "Good" : statusState?.trim() || "Good",
    tone: "good",
    translationKey: isInvalidState(statusState) ? "good" : undefined,
  };
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
