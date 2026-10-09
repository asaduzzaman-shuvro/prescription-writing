import { describe, expect, it } from "vitest";
import {
  buildLabCatalogue,
  cleanLabTestSpec,
  customLabCode,
  DEFAULT_LAB_CATALOGUE,
  LAB_CURATED_PANELS,
  LAB_CURATED_TESTS,
  LAB_TEST_BY_CODE,
  labFlag,
  labPanelRow,
  labRefText,
  labReportProblem,
  labResult,
  labRowId,
  labTestOverride,
  labTestRow,
  labValueText,
  panelForInvestigation,
  parseLabCount,
  parseLabShorthand,
  type LabPanelRow,
  type LabTestRow,
} from "../src";

const T = (code: string) => LAB_TEST_BY_CODE[code]!;
const platformRows = () => ({
  tests: LAB_CURATED_TESTS.map((t, i): LabTestRow => ({ tenantId: null, isActive: true, ...labTestRow(t, i) })),
  panels: LAB_CURATED_PANELS.map((p, i): LabPanelRow => ({ tenantId: null, isActive: true, ...labPanelRow(p, i) })),
});

/** The codes reports were saved under before the catalogue grew: they must never change. */
const RELEASED = [
  "718-7", "30341-2", "6690-2", "770-8", "736-9", "777-3", "14749-6", "14771-0", "14761-1", "4548-4", "2160-0", "3091-6",
  "98979-8", "3084-1", "1742-6", "1920-8", "1975-2", "2093-3", "2571-8", "2085-9", "13457-7", "3016-3", "14920-3", "5821-4",
  "13945-1", "20454-5", "25428-4", "2951-2", "2823-3", "2075-0", "2028-9", "5196-1", "16128-1", "1988-5",
];

describe("curated catalogue", () => {
  it("keeps every released code and panel id", () => {
    for (const c of RELEASED) expect(LAB_TEST_BY_CODE[c], c).toBeDefined();
    for (const id of ["cbc", "sugar", "rft", "lft", "lipid", "thyroid", "urine", "electrolytes", "serology"]) expect(DEFAULT_LAB_CATALOGUE.panelById[id], id).toBeDefined();
  });

  it("has unique codes, panel ids and quick-entry names", () => {
    expect(new Set(LAB_CURATED_TESTS.map((t) => t.code)).size).toBe(LAB_CURATED_TESTS.length);
    expect(new Set(LAB_CURATED_PANELS.map((p) => p.id)).size).toBe(LAB_CURATED_PANELS.length);
    const seen = new Map<string, string>();
    for (const t of LAB_CURATED_TESTS) {
      for (const a of t.aliases ?? []) {
        const k = a.toLowerCase().replace(/[\s.\-_]/g, "");
        expect(seen.get(k) ?? t.code, `alias "${a}" is used by ${seen.get(k)} and ${t.code}`).toBe(t.code);
        seen.set(k, t.code);
      }
    }
  });

  it("puts every test in a panel, and every panel test exists", () => {
    const inPanel = new Set(LAB_CURATED_PANELS.flatMap((p) => p.tests));
    for (const t of LAB_CURATED_TESTS) expect(inPanel.has(t.code), `${t.code} is in no panel`).toBe(true);
    for (const p of LAB_CURATED_PANELS) {
      for (const c of p.tests) expect(LAB_TEST_BY_CODE[c], `${p.id}: ${c}`).toBeDefined();
      if (p.sections) expect(p.sections.flatMap((s) => s.tests)).toEqual(p.tests);
    }
  });

  it("gives coded and titre tests their choices, and cultures their antibiotics", () => {
    for (const t of LAB_CURATED_TESTS) {
      if (t.kind === "coded") expect(t.options?.length, t.code).toBeGreaterThan(1);
      if (t.kind === "titre") expect(t.options).toContain(t.titreSignificant);
      if (t.kind === "culture") expect(t.antibiotics?.length).toBeGreaterThan(5);
      for (const n of t.normal ?? []) if (t.kind === "coded") expect(t.options, `${t.code}: ${n}`).toContain(n);
    }
  });

  it("covers the menu Bangladeshi labs offer", () => {
    const ids = DEFAULT_LAB_CATALOGUE.panels.map((p) => p.id);
    for (const id of ["stool", "semen", "upt", "widal", "febrile", "dengue", "grouping", "coag", "tumour", "urine-cs", "blood-cs", "afb"]) expect(ids).toContain(id);
    expect(DEFAULT_LAB_CATALOGUE.panelById.cbc!.tests).toHaveLength(15);
    expect(DEFAULT_LAB_CATALOGUE.panelById.urine!.sections!.map((s) => s.title)).toEqual(["Physical examination", "Chemical examination", "Microscopic examination"]);
  });
});

describe("buildLabCatalogue", () => {
  it("rebuilds the curated catalogue from its rows", () => {
    const cat = buildLabCatalogue(platformRows());
    expect(cat.tests.map((t) => t.code)).toEqual(DEFAULT_LAB_CATALOGUE.tests.map((t) => t.code));
    expect(cat.panels.map((p) => p.id)).toEqual(DEFAULT_LAB_CATALOGUE.panels.map((p) => p.id));
    expect(cat.byCode["718-7"]).toEqual(T("718-7"));
    expect(cat.panelById.urine).toEqual(DEFAULT_LAB_CATALOGUE.panelById.urine);
  });

  it("lays a clinic's row over the platform's: set fields win, the rest inherit", () => {
    const rows = platformRows();
    rows.tests.push({ tenantId: "t1", code: "718-7", unit: "g/L", spec: { range: { low: 120, high: 160 } } });
    const hb = buildLabCatalogue(rows).byCode["718-7"]!;
    expect(hb).toMatchObject({ name: "Haemoglobin", short: "Hb", unit: "g/L", range: { low: 120, high: 160 }, decimals: 1 });
    expect(hb.aliases).toContain("hb");
  });

  it("hides a test the clinic turned off, but still knows its name", () => {
    const rows = platformRows();
    rows.tests.push({ tenantId: "t1", code: "30341-2", isActive: false });
    const cat = buildLabCatalogue(rows);
    expect(cat.tests.some((t) => t.code === "30341-2")).toBe(false);
    expect(cat.panelById.cbc!.tests).not.toContain("30341-2");
    expect(cat.panelById.esr).toBeUndefined();
    expect(cat.byCode["30341-2"]!.short).toBe("ESR");
    expect(cat.aliasToCode.esr).toBeUndefined();
  });

  it("adds a clinic's own test and panel; ignores another clinic's view of nothing", () => {
    const rows = platformRows();
    rows.tests.push({ tenantId: "t1", code: "x-hbeag", name: "HBeAg", short: "HBeAg", kind: "coded", department: "serology", sortOrder: 9999, isActive: true, spec: { options: ["Negative", "Positive"], normal: ["Negative"], aliases: ["hbeag"] } });
    rows.panels.push({ tenantId: "t1", key: "x-hep", name: "Hepatitis B profile", department: "serology", isActive: true, spec: JSON.stringify({ sections: [{ tests: ["5196-1", "x-hbeag"] }] }) });
    const cat = buildLabCatalogue(rows);
    expect(cat.byCode["x-hbeag"]).toMatchObject({ kind: "coded", department: "serology" });
    expect(cat.panelById["x-hep"]!.tests).toEqual(["5196-1", "x-hbeag"]);
    expect(parseLabShorthand("hbeag pos", cat).results).toEqual([{ code: "x-hbeag", text: "Positive" }]);
  });

  it("skips malformed rows and spec fields", () => {
    const cat = buildLabCatalogue({
      tests: [
        { code: "a", name: "A", short: "A", kind: "numeric", spec: { range: { low: "1", high: 5 }, options: [1, 2], printAs: "x", decimals: 2 } },
        { code: "b", name: "B", short: "B", kind: "nonsense" },
        { code: "c", short: "C", kind: "numeric" },
      ],
      panels: [{ key: "p", name: "P", spec: { sections: [{ tests: ["a", "b", "c"] }] } }],
    });
    expect(Object.keys(cat.byCode)).toEqual(["a"]);
    expect(cat.byCode.a).toMatchObject({ range: { high: 5 }, decimals: 2, department: "biochemistry" });
    expect(cat.byCode.a!.options).toBeUndefined();
    expect(cat.panelById.p!.tests).toEqual(["a"]);
    expect(cleanLabTestSpec("not json")).toEqual({});
  });
});

describe("a clinic's edits as rows", () => {
  const tenant = "11111111-2222-3333-4444-555555555555";

  it("derives one uuid per clinic, table and code", () => {
    const id = labRowId(tenant, "lab_test", "718-7");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(labRowId(tenant, "lab_test", "718-7")).toBe(id);
    expect(labRowId(tenant, "lab_panel", "718-7")).not.toBe(id);
    expect(labRowId("11111111-2222-3333-4444-555555555556", "lab_test", "718-7")).not.toBe(id);
  });

  it("names a clinic's own test x-<name>, numbered when taken", () => {
    expect(customLabCode("Serum  Zinc (S.)", () => false)).toBe("x-serum-zinc-s");
    expect(customLabCode("Serum zinc", (c) => c === "x-serum-zinc")).toBe("x-serum-zinc-2");
    expect(customLabCode("জিংক", () => false)).toBe("x-test");
    expect(customLabCode("a".repeat(80), () => false).length).toBeLessThanOrEqual(40);
  });

  it("writes only what differs from the platform's test", () => {
    const hb = T("718-7");
    const same = labTestOverride(hb, {}, hb);
    expect(same).toEqual({ name: null, short: null, unit: null, kind: null, department: null, spec: {} });
    // The form's blank printed-range box is no change when the platform prints the range too.
    expect(labTestOverride(hb, {}, { ...hb, refText: "" }).spec).toEqual({});

    // A new male range keeps the female range and the child band; the unit changes; the name stays inherited.
    const range = { ...hb.range, male: { low: 13.5, high: 17.5 } };
    const edited = labTestOverride(hb, {}, { ...hb, unit: "gm/dL", range });
    expect(edited).toMatchObject({ name: null, unit: "gm/dL", spec: { range } });
    const cat = buildLabCatalogue({ tests: [...platformRows().tests, { tenantId: tenant, code: "718-7", ...edited }], panels: platformRows().panels });
    expect(labRefText(cat.byCode["718-7"]!, "male")).toBe("13.5–17.5");
    expect(labRefText(cat.byCode["718-7"]!, "female")).toBe("12–15");
    expect(cat.byCode["718-7"]!.name).toBe(hb.name);

    // Put back to the platform's values, the row follows the platform again.
    expect(labTestOverride(hb, edited.spec, { ...hb }).spec).toEqual({});
  });

  it("clears a platform's printed text so the range prints, and keeps a clinic's other spec keys", () => {
    const chol = T("2093-3");
    const edited = labTestOverride(chol, { decimals: 0 }, { ...chol, refText: "", range: { high: 190 } });
    expect(edited.spec).toEqual({ decimals: 0, refText: "", range: { high: 190 } });
    const cat = buildLabCatalogue({ tests: [...platformRows().tests, { tenantId: tenant, code: "2093-3", ...edited }], panels: platformRows().panels });
    expect(labRefText(cat.byCode["2093-3"]!, null)).toBe("<190");
  });

  it("writes every field of the clinic's own test", () => {
    const own = labTestOverride(undefined, {}, { name: "Serum zinc", short: "Zinc", unit: "µg/dL", kind: "numeric", department: "biochemistry", range: { low: 70, high: 120 } });
    expect(own).toEqual({ name: "Serum zinc", short: "Zinc", unit: "µg/dL", kind: "numeric", department: "biochemistry", spec: { range: { low: 70, high: 120 } } });
  });
});

describe("ranges by age and sex", () => {
  const HB = T("718-7");
  it("uses a child's band before the adult range", () => {
    expect(labFlag(HB, { value: 11.8 }, { sex: "male", ageDays: 6 * 365 })).toBeUndefined();
    expect(labFlag(HB, { value: 11.8 }, { sex: "male", ageDays: 30 * 365 })).toBe("L");
    expect(labRefText(HB, { sex: "female", ageDays: 3 * 365 })).toBe("11.5–15.5");
  });

  it("prints both sexes' ranges when the sex is unknown", () => {
    expect(labRefText(HB, null)).toBe("M: 13–17, F: 12–15");
    expect(labRefText(HB, "female")).toBe("12–15");
    expect(labRefText(T("2093-3"), "male")).toMatch(/^Desirable < 200/);
    expect(labRefText(T("2085-9"), "male")).toBe("> 40");
    expect(labRefText(T("20454-5"), "male")).toBe("Nil");
    expect(labRefText(HB, "male", { low: 11, high: 16 })).toBe("11–16");
  });
});

describe("results of every kind", () => {
  it("titres: flags at or above the significant titre", () => {
    const to = T("bd-widal-to");
    expect(labResult(to, { text: "1:80" }, "male")).toMatchObject({ text: "1:80", print: false, ref: "<1:160" });
    expect(labResult(to, { text: "1:160" }, "male")).toMatchObject({ flag: "A", print: true });
  });

  it("text results: flags what isn't normal, case-insensitively", () => {
    const ova = T("bd-stool-ova");
    expect(labFlag(ova, { text: "not found" }, null)).toBeUndefined();
    expect(labFlag(ova, { text: "Ascaris lumbricoides" }, null)).toBe("A");
    expect(labFlag(T("bd-urine-others"), { text: "Bacteria" }, null)).toBeUndefined();
  });

  it("coded results without normal values are never flagged", () => {
    expect(labResult(T("883-9"), { text: "B" }, "male")).toMatchObject({ text: "B", print: false });
    expect(labResult(T("2106-3"), { text: "Positive" }, "female").flag).toBeUndefined();
  });

  it("microscopy counts: ranges judged on the upper figure, words as written", () => {
    const pus = T("5821-4");
    expect(parseLabCount("2-4")).toEqual({ value: 4, text: "2-4" });
    expect(labResult(pus, { text: "2-4" }, "male")).toMatchObject({ value: 4, text: "2-4", print: false });
    expect(labResult(pus, { text: "8–10" }, "male")).toMatchObject({ value: 10, text: "8-10", flag: "H" });
    expect(labResult(pus, { text: "Plenty" }, "male")).toMatchObject({ text: "Plenty", flag: "H", print: true });
    expect(labResult(pus, { text: "nil" }, "male")).toMatchObject({ value: 0, text: "Nil" });
    expect(labResult(pus, { text: "3" }, "male")).toEqual(expect.objectContaining({ value: 3 }));
    expect(labResult(pus, { text: "3" }, "male").text).toBeUndefined();
    expect(labValueText(labResult(pus, { text: "8-10" }, "male"))).toBe("Pus cells 8-10 /HPF (H)");
  });

  it("cultures: growth is abnormal and prints the organisms and sensitivity", () => {
    const ucs = T("630-4");
    const growth = labResult(ucs, { culture: { growth: true, organisms: [{ name: "E. coli", count: "10⁵ CFU/mL", sensitivity: [{ drug: "Nitrofurantoin", sir: "S" }, { drug: "Ciprofloxacin", sir: "R" }] }] } }, "female");
    expect(growth).toMatchObject({ flag: "A", print: true });
    expect(labValueText(growth)).toBe("Urine C/S: E. coli 10⁵ CFU/mL (S: Nitrofurantoin; R: Ciprofloxacin)");
    expect(labValueText(labResult(ucs, { culture: { growth: false, organisms: [] } }, "female"))).toBe("Urine C/S: No growth");
  });

  it("keeps the name and range as they were when saved", () => {
    const r = labResult(T("718-7"), { value: 9.2, section: "Haemoglobin" }, "female");
    expect(r).toMatchObject({ name: "Hb", ref: "12–15", section: "Haemoglobin" });
    expect(labValueText({ ...r, name: "Haemoglobin" })).toBe("Haemoglobin 9.2 g/dL (L)");
    // Saved before names were kept, or under a test the clinic since removed: still readable.
    expect(labValueText({ code: "718-7", value: 9.2, unit: "g/dL", flag: "L", print: true })).toBe("Hb 9.2 g/dL (L)");
    expect(labValueText({ code: "x-gone", value: 3, unit: "U", print: true })).toBe("x-gone 3 U");
  });
});

describe("labReportProblem for the clinic's own reports", () => {
  const today = "2026-10-12";
  const culture = (c: unknown) => labReportProblem({ results: [{ code: "630-4", unit: "", print: true, culture: c }] }, today);

  it("checks the new report fields", () => {
    expect(labReportProblem({ source: "in_house", requestId: "6f1c2a51-9a40-4f7e-8f1e-2b8a5a0c1d23", specimen: "Urine", collectedAt: "2026-10-12T09:30:00+06:00", referredBy: "Dr. Rahman", comment: "", department: "haematology" }, today)).toBeNull();
    expect(labReportProblem({ source: "mine" }, today)).toMatch(/source/);
    expect(labReportProblem({ requestId: "x" }, today)).toMatch(/request/);
    expect(labReportProblem({ department: "kitchen" }, today)).toMatch(/department/);
    expect(labReportProblem({ collectedAt: "yesterday" }, today)).toMatch(/collection/);
    expect(labReportProblem({ collectedAt: "2026-10-13T09:00:00Z" }, today)).toMatch(/future/);
    expect(labReportProblem({ referredBy: "x".repeat(121) }, today)).toMatch(/too long/);
    expect(labReportProblem({ results: [{ code: "718-7", unit: "g/dL", print: true, ref: "x".repeat(121) }] }, today)).toMatch(/reference/);
  });

  it("checks culture results", () => {
    expect(culture({ growth: false, organisms: [] })).toBeNull();
    expect(culture({ growth: true, organisms: [{ name: "E. coli", sensitivity: [{ drug: "Amikacin", sir: "S" }] }] })).toBeNull();
    expect(culture({ growth: "yes", organisms: [] })).toMatch(/culture/);
    expect(culture({ growth: true, organisms: [{ name: "E. coli", sensitivity: [{ drug: "Amikacin", sir: "X" }] }] })).toMatch(/S, I or R/);
    expect(culture({ growth: true, organisms: Array.from({ length: 4 }, () => ({ name: "x", sensitivity: [] })) })).toMatch(/too many organisms/);
    expect(culture({ growth: true, organisms: [{ name: "", sensitivity: [] }] })).toMatch(/organism/);
  });
});

describe("quick entry and ordered tests across the full menu", () => {
  it("reads the new tests and microscopy ranges", () => {
    expect(parseLabShorthand("pcv 38 mcv 72 tsh 6.1 ns1 pos pus 8-10 ca125 40").results).toEqual([
      { code: "4544-3", value: 38 },
      { code: "787-2", value: 72 },
      { code: "3016-3", value: 6.1 },
      { code: "75377-6", text: "Positive" },
      { code: "5821-4", text: "8-10" },
      { code: "10334-1", value: 40 },
    ]);
    expect(parseLabShorthand("hb 8-10").unknown).toEqual(["hb 8-10"]);
  });

  it("maps ordered investigations to the new panels", () => {
    expect(panelForInvestigation("Stool R/M/E")).toEqual({ panel: "stool" });
    expect(panelForInvestigation("Widal test")).toEqual({ panel: "widal" });
    expect(panelForInvestigation("Dengue NS1")).toEqual({ panel: "dengue" });
    expect(panelForInvestigation("Blood grouping & Rh")).toEqual({ panel: "grouping" });
    expect(panelForInvestigation("Semen analysis")).toEqual({ panel: "semen" });
    expect(panelForInvestigation("S. TSH")).toEqual({ panel: "thyroid" });
    expect(panelForInvestigation("Blood C/S")).toEqual({ panel: "blood-cs" });
    expect(panelForInvestigation("USG of whole abdomen")).toEqual({ panel: "other", title: "USG of whole abdomen" });
  });
});
