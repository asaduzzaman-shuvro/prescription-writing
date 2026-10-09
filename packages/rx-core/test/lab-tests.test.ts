import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_SETTINGS,
  LAB_PANELS,
  LAB_TEST_BY_CODE,
  LAB_TESTS,
  labFlag,
  labLine,
  labReportProblem,
  labResult,
  labTrend,
  panelForInvestigation,
  panelOfTest,
  parseLabShorthand,
  renderPrescriptionHtml,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  type LabReport,
} from "../src";

const T = (code: string) => LAB_TEST_BY_CODE[code]!;
const HB = T("718-7"), WBC = T("6690-2"), PLT = T("777-3"), RBS = T("14749-6"), HBSAG = T("5196-1"), ALB = T("20454-5");

describe("lab test catalogue", () => {
  it("has unique codes and every panel test exists", () => {
    expect(new Set(LAB_TESTS.map((x) => x.code)).size).toBe(LAB_TESTS.length);
    for (const p of LAB_PANELS) for (const code of p.tests) expect(LAB_TEST_BY_CODE[code], `${p.id}: ${code}`).toBeDefined();
  });
});

describe("labFlag", () => {
  it("uses the range for the patient's sex", () => {
    expect(labFlag(HB, { value: 12.5 }, "male")).toBe("L");
    expect(labFlag(HB, { value: 12.5 }, "female")).toBeUndefined();
    expect(labFlag(HB, { value: 15.5 }, "female")).toBe("H");
  });

  it("with sex unknown, flags only what's abnormal for either sex", () => {
    expect(labFlag(HB, { value: 12.5 }, undefined)).toBeUndefined();
    expect(labFlag(HB, { value: 11.5 }, undefined)).toBe("L");
  });

  it("the lab's own range wins over the default", () => {
    expect(labFlag(RBS, { value: 7.5 }, "male")).toBeUndefined();
    expect(labFlag(RBS, { value: 7.5, high: 7.0 }, "male")).toBe("H");
  });

  it("flags an abnormal coded result as A", () => {
    expect(labFlag(HBSAG, { text: "Positive" }, "male")).toBe("A");
    expect(labFlag(HBSAG, { text: "Negative" }, "male")).toBeUndefined();
    expect(labFlag(ALB, { text: "Trace" }, "male")).toBe("A");
  });
});

describe("labResult", () => {
  it("turns per-cmm counts into ×10³/µL", () => {
    expect(labResult(WBC, { value: 11800 }, "male")).toMatchObject({ value: 11.8, flag: "H", print: true });
    expect(labResult(WBC, { value: 7.2 }, "male")).toMatchObject({ value: 7.2, print: false });
    expect(labResult(PLT, { value: 250000 }, "male").value).toBe(250);
  });

  it("prints abnormal values by default; the doctor can tick a normal one", () => {
    expect(labResult(HB, { value: 9.2 }, "female")).toMatchObject({ flag: "L", print: true });
    expect(labResult(HB, { value: 13 }, "female").print).toBe(false);
    expect(labResult(HB, { value: 13, print: true }, "female").print).toBe(true);
  });
});

const cbc: LabReport = {
  panel: "cbc",
  title: "CBC",
  reportDate: "2026-10-12",
  results: [labResult(HB, { value: 9.2 }, "female"), labResult(WBC, { value: 11800 }, "female"), labResult(PLT, { value: 250 }, "female")],
};

describe("labLine", () => {
  it("prints the ticked values with units and H/L", () => {
    expect(labLine(cbc, { onlyPrinted: true })?.text).toBe("CBC (12/10/26): Hb 9.2 g/dL (L), WBC 11.8 ×10³/µL (H)");
    expect(labLine(cbc, { onlyPrinted: false })?.text).toContain("Platelets 250 ×10³/µL");
  });

  it("prints a free-text conclusion, and nothing for a report with nothing ticked", () => {
    expect(labLine({ panel: "other", title: "USG of whole abdomen", reportDate: "2026-10-01", results: [], conclusion: "Fatty liver grade I" }, { onlyPrinted: true })?.text)
      .toBe("USG of whole abdomen (01/10/26): Fatty liver grade I");
    expect(labLine({ ...cbc, results: [labResult(PLT, { value: 250 }, "female")] }, { onlyPrinted: true })).toBeNull();
    expect(labLine({ ...cbc, results: [labResult(HBSAG, { text: "Positive" }, "female")] }, { onlyPrinted: true })?.text).toBe("CBC (12/10/26): HBsAg Positive");
  });
});

describe("labReportProblem", () => {
  const today = "2026-10-12";
  it("accepts a normal report and partial updates", () => {
    expect(labReportProblem({ ...cbc }, today)).toBeNull();
    expect(labReportProblem({ conclusion: "NAD" }, today)).toBeNull();
  });

  it("rejects tampered results, future dates and oversized text", () => {
    expect(labReportProblem({ results: "x" }, today)).toMatch(/list/);
    expect(labReportProblem({ results: [{ code: "718-7", unit: "g/dL", print: true, value: "9" }] }, today)).toMatch(/number/);
    expect(labReportProblem({ results: [{ code: "718-7", unit: "g/dL", print: "yes" }] }, today)).toMatch(/print/);
    expect(labReportProblem({ results: Array.from({ length: 61 }, () => ({ code: "718-7", unit: "", print: false })) }, today)).toMatch(/too many/);
    expect(labReportProblem({ reportDate: "2026-10-13" }, today)).toMatch(/future/);
    expect(labReportProblem({ conclusion: "x".repeat(2001) }, today)).toMatch(/too long/);
  });
});

describe("printing lab findings", () => {
  const render = (labFindings?: { title: string; date: string; text: string }[], hidden: typeof DEFAULT_PRINT_SETTINGS.hiddenSections = []) =>
    renderPrescriptionHtml({
      doc: { ...SAMPLE_DOC, labFindings },
      patient: SAMPLE_PATIENT,
      doctor: SAMPLE_DOCTOR,
      chamber: SAMPLE_CHAMBER,
      date: "2026-10-12",
      settings: { ...DEFAULT_PRINT_SETTINGS, hiddenSections: hidden },
      fonts: { bengali: "", latin: "" },
    });

  it("prints a Reports section before Ix, escaped", () => {
    const html = render([{ title: "CBC", date: "2026-10-12", text: "CBC (12/10/26): Hb 9.2 g/dL (L) <b>" }]);
    expect(html).toContain("<h3>Reports</h3><ul><li>CBC (12/10/26): Hb 9.2 g/dL (L) &lt;b&gt;</li></ul>");
    expect(html.indexOf("<h3>Reports</h3>")).toBeLessThan(html.indexOf("<h3>Ix</h3>"));
  });

  it("prints nothing without findings, or when the section is hidden", () => {
    expect(render()).not.toContain("<h3>Reports</h3>");
    expect(render([{ title: "CBC", date: "2026-10-12", text: "CBC: Hb 9.2" }], ["labs"])).not.toContain("<h3>Reports</h3>");
  });
});

describe("parseLabShorthand", () => {
  it("reads names and values, joined or apart", () => {
    expect(parseLabShorthand("hb 9.2 wbc 11800, rbs=11.4 hba1c 7.4 cr1.6 na140")).toEqual({
      results: [
        { code: "718-7", value: 9.2 },
        { code: "6690-2", value: 11800 },
        { code: "14749-6", value: 11.4 },
        { code: "4548-4", value: 7.4 },
        { code: "2160-0", value: 1.6 },
        { code: "2951-2", value: 140 },
      ],
      unknown: [],
    });
  });

  it("reads coded results and multi-word names", () => {
    expect(parseLabShorthand("HBsAg neg anti hcv pos alb ++ s. creatinine 1.1").results).toEqual([
      { code: "5196-1", text: "Negative" },
      { code: "16128-1", text: "Positive" },
      { code: "20454-5", text: "++" },
      { code: "2160-0", value: 1.1 },
    ]);
  });

  it("reports what it didn't understand", () => {
    expect(parseLabShorthand("hb 9.2 xyz 4 tsh").unknown).toEqual(["xyz 4", "tsh"]);
    expect(parseLabShorthand("hbsag 5").unknown).toEqual(["hbsag 5"]);
  });
});

describe("panelForInvestigation", () => {
  it("maps ordered investigations to panels, others to a titled free-text report", () => {
    expect(panelForInvestigation("CBC with ESR")).toEqual({ panel: "cbc" });
    expect(panelForInvestigation("FBS & 2HABF")).toEqual({ panel: "sugar" });
    expect(panelForInvestigation("Serum creatinine")).toEqual({ panel: "rft" });
    expect(panelForInvestigation("Lipid profile (fasting)")).toEqual({ panel: "lipid" });
    expect(panelForInvestigation("Urine R/M/E")).toEqual({ panel: "urine" });
    expect(panelForInvestigation("Urine C/S")).toEqual({ panel: "other", title: "Urine C/S" });
    expect(panelForInvestigation("X-ray chest P/A view")).toEqual({ panel: "other", title: "X-ray chest P/A view" });
    expect(panelOfTest("4548-4")?.id).toBe("sugar");
  });
});

describe("labTrend", () => {
  it("places points oldest-left and the normal band, scaled to values and range", () => {
    const t = labTrend([{ date: "2026-01-01", value: 8.1 }, { date: "2026-04-01", value: 7.4 }, { date: "2026-07-01", value: 6.9 }], { high: 5.7 }, 200, 60);
    expect(t.points.map((p) => p.x)).toEqual([6, 100, 194]);
    expect(t.points[0]!.y).toBeLessThan(t.points[2]!.y); // higher value, higher on the chart
    expect(t.band).toEqual({ top: expect.any(Number), bottom: 54 });
    expect(t.band!.top).toBeGreaterThan(t.points[2]!.y);
  });

  it("handles a single point and no range", () => {
    const t = labTrend([{ date: "2026-01-01", value: 5 }], {}, 100, 40);
    expect(t.points[0]).toMatchObject({ x: 50, y: 20 });
    expect(t.band).toBeNull();
  });
});
