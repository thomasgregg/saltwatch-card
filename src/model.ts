import type { HassEntity, HistoryState } from "./types";

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

export function historyValues(states: HistoryState[] | undefined): number[] {
  if (!states) return [];
  return states
    .map((state) => parseFinite(state.s))
    .filter((value): value is number => value !== undefined)
    .map((value) => clamp(value));
}

export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  padding = 3,
): string {
  if (values.length < 2) return "";

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * usableWidth;
      const y = padding + ((100 - clamp(value)) / 100) * usableHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function relativeUpdated(isoTimestamp: string | undefined, now = Date.now()): string {
  if (!isoTimestamp) return "Update unknown";
  const timestamp = Date.parse(isoTimestamp);
  if (!Number.isFinite(timestamp)) return "Update unknown";
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 60) return "Updated now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
