import { describe, expect, it } from "vitest";
import {
  clamp,
  deriveStatus,
  parseFinite,
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

});
