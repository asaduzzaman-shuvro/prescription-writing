import { describe, expect, it } from "vitest";
import { airBoneGap, audiogramSvg, eardrumSvg, ENT_TEMPLATE, flattenFindings, hearingGrade, ptaAverage, validateTemplateSchema } from "../src";

describe("ENT template", () => {
  it("is a valid schema", () => {
    expect(validateTemplateSchema(ENT_TEMPLATE)).toEqual([]);
  });
  it("rejects broken schemas", () => {
    expect(validateTemplateSchema({})).toEqual(["root must be { sections: [...] }"]);
    expect(
      validateTemplateSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", label: "X", type: "select" }, { id: "x", label: "Y", type: "bogus" }] }] }),
    ).toEqual(["field x: options required for select", 'duplicate field id "x"', 'field x: unknown type "bogus"']);
  });
});

describe("audiology", () => {
  const right = { ac: { 250: 40, 500: 40, 1000: 45, 2000: 50, 4000: 55, 8000: 60 }, bc: { 500: 10, 1000: 15, 2000: 20 } };
  it("computes PTA, grade and air-bone gap", () => {
    expect(ptaAverage(right)).toBe(47.5);
    expect(hearingGrade(47.5)).toBe("Moderate");
    expect(hearingGrade(10)).toBe("Normal");
    expect(airBoneGap(right)).toBe(30);
    expect(ptaAverage({ ac: { 500: 10 }, bc: {} })).toBeNull();
  });
  it("draws an audiogram with right (O) and left (X) markers", () => {
    const svg = audiogramSvg({ right, left: { ac: { 500: 10, 1000: 10 }, bc: {} } });
    expect(svg).toContain("<circle");
    expect(svg).toContain('stroke="#00c"');
  });
});

describe("flattenFindings", () => {
  it("prints only abnormal answers, merges identical sides and adds diagrams", () => {
    const out = flattenFindings(ENT_TEMPLATE, {
      ear_pinna: { right: "Normal", left: "Normal" },
      ear_tm: { right: "Perforated", left: "Intact" },
      ear_tm_map: { right: { perforation: ["ai", "pi"], retraction: [] }, left: { perforation: [], retraction: [] } },
      ear_discharge: { right: "Mucopurulent", left: "None" },
      ear_weber: "Lateralised to right",
      nose_septum: "DNS to left",
      thr_tonsil_grade: { right: "Grade 3", left: "Grade 3" },
      aud_pta: { right: { ac: { 500: 40, 1000: 45, 2000: 50, 4000: 55 }, bc: { 500: 10, 1000: 15, 2000: 20 } } },
    });
    expect(out.groups.map((g) => g.title)).toEqual(["Ear", "Nose & PNS", "Throat & neck", "Audiology"]);
    const ear = out.groups[0]!.lines;
    expect(ear).toContainEqual({ label: "TM", value: "R Perforated, L Intact" });
    expect(ear).toContainEqual({ label: "TM map", value: "R: perforation AI+PI" });
    expect(ear).toContainEqual({ label: "Discharge", value: "R Mucopurulent" });
    expect(ear.find((l) => l.label === "Pinna / mastoid")).toBeUndefined();
    expect(out.groups[2]!.lines).toContainEqual({ label: "Tonsil (Brodsky)", value: "B/L Grade 3" });
    expect(out.groups[3]!.lines[0]!.value).toBe("R 47.5 dB (Moderate, A-B gap 30 dB)");
    expect(out.diagrams.map((d) => d.title)).toEqual(["Right TM", "Left TM", "Audiogram (O right, X left)"]);
  });
  it("mirrors the left eardrum", () => {
    expect(eardrumSvg(undefined, "left")).toContain("scale(-1,1)");
    expect(eardrumSvg({ perforation: ["ai"], retraction: [] }, "right")).toContain('fill="#111"');
  });
});
