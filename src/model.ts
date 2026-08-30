import type { HassEntity } from "./types";

export type CardTone = "good" | "low" | "warning" | "fault";

const INVALID_STATES = new Set(["", "unknown", "unavailable", "none", "nan"]);

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
): { label: string; tone: CardTone } {
  const normalized = statusState?.trim().toLowerCase() ?? "";

  if (normalized.includes("fault") || normalized.includes("error")) {
    return { label: "Sensor fault", tone: "fault" };
  }
  if (normalized.includes("calibration")) {
    return { label: "Calibration required", tone: "warning" };
  }
  if (level === undefined) {
    return { label: "No current reading", tone: "fault" };
  }
  if (normalized.includes("low") || level <= threshold) {
    return { label: "Low salt", tone: "low" };
  }
  return { label: statusState?.trim() || "Good", tone: "good" };
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
