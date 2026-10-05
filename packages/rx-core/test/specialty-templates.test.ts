import { describe, expect, it } from "vitest";
import { ENT_TEMPLATE, flattenFindings, OPHTHALMOLOGY_TEMPLATE, validateTemplateSchema, VASCULAR_TEMPLATE } from "../src";

describe("ophthalmology and vascular templates", () => {
  it("are valid schemas", () => {
    expect(validateTemplateSchema(OPHTHALMOLOGY_TEMPLATE)).toEqual([]);
    expect(validateTemplateSchema(VASCULAR_TEMPLATE)).toEqual([]);
  });

  it("print eyes as RE / LE / B/E and keep 'Fundus : NAD'", () => {
    const { groups } = flattenFindings(OPHTHALMOLOGY_TEMPLATE, {
      eye_va: { right: "6/6", left: "6/18" },
      eye_fundus: { right: "NAD", left: "NAD" },
      eye_iop: { right: 14, left: 16 },
      eye_cornea: { right: "Clear", left: "Clear" },
      rop_stage: { right: "Stage 1", left: "Stage 1" },
      rop_zone: { right: "Zone III", left: "Zone III" },
    });
    const lines = Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [l.label, l.value])));
    expect(lines["VA (unaided)"]).toBe("RE 6/6, LE 6/18");
    expect(lines.Fundus).toBe("B/E NAD");
    expect(lines.IOP).toBe("RE 14 mmHg, LE 16 mmHg");
    expect(lines.Cornea).toBeUndefined(); // "Clear" is the normal answer and is left off the pad
    expect(lines.Stage).toBe("B/E Stage 1");
    expect(lines.Zone).toBe("B/E Zone III");
  });

  it("keeps the ENT labels when a template sets none", () => {
    const { groups } = flattenFindings(ENT_TEMPLATE, { ear_tm: { right: "Intact", left: "Intact" }, ear_rinne: { right: "+ve", left: "−ve" } });
    const lines = Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [l.label, l.value])));
    expect(lines.TM).toBe("B/L Intact");
    expect(lines.Rinne).toBe("R +ve, L −ve");
  });

  it("prints vascular pulses with the default sides", () => {
    const { groups } = flattenFindings(VASCULAR_TEMPLATE, { vas_dp: { right: "Present", left: "Absent" }, vas_ulcer: { right: "None", left: "Venous" } });
    const lines = Object.fromEntries(groups.flatMap((g) => g.lines.map((l) => [l.label, l.value])));
    expect(lines["Dorsalis pedis"]).toBe("R Present, L Absent");
    expect(lines.Ulcer).toBe("L Venous");
  });

  it("rejects malformed side labels", () => {
    expect(validateTemplateSchema({ ...VASCULAR_TEMPLATE, lateralLabels: { right: "Rt" } })).toEqual([
      `lateralLabels must be { "right": "…", "left": "…", "both": "…" }`,
    ]);
  });
});
