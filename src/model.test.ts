import { describe, expect, it } from "vitest";
import {
  buildSparklinePath,
  clamp,
  deriveStatus,
  historyValues,
  parseFinite,
  relativeUpdated,
} from "./model";

describe("SaltWatch card model", () => {
  it("parses only finite entity values", () => {
    expect(parseFinite("62.4")).toBe(62.4);
    expect(parseFinite("unavailable")).toBeUndefined();
    expect(parseFinite(Number.NaN)).toBeUndefined();
  });

  it("clamps levels to the visual range", () => {
    expect(clamp(-4)).toBe(0);
    expect(clamp(48)).toBe(48);
    expect(clamp(103)).toBe(100);
  });

  it("prioritizes faults and calibration over the numeric level", () => {
    expect(deriveStatus("Sensor Fault", 60, 20)).toEqual({
      label: "Sensor fault",
      tone: "fault",
    });
    expect(deriveStatus("Calibration Required", undefined, 20)).toEqual({
      label: "Calibration required",
      tone: "warning",
    });
  });

  it("derives a low status inclusively at the threshold", () => {
    expect(deriveStatus("Good", 20, 20)).toEqual({ label: "Low salt", tone: "low" });
    expect(deriveStatus("Good", 20.1, 20)).toEqual({ label: "Good", tone: "good" });
  });

  it("filters invalid history without inventing values", () => {
    expect(historyValues([{ s: "84" }, { s: "unknown" }, { s: "105" }])).toEqual([84, 100]);
  });

  it("creates an SVG path only when real history exists", () => {
    expect(buildSparklinePath([], 100, 50)).toBe("");
    expect(buildSparklinePath([80, 60], 100, 50)).toBe("M3.0 11.8 L97.0 20.6");
  });

  it("formats the entity update age", () => {
    const now = Date.parse("2026-08-30T10:00:00Z");
    expect(relativeUpdated("2026-08-30T09:59:45Z", now)).toBe("Updated now");
    expect(relativeUpdated("2026-08-30T09:55:00Z", now)).toBe("Updated 5m ago");
  });
});
