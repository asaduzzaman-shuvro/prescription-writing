import { describe, expect, it } from "vitest";
import {
  addDuration,
  DEFAULT_PRINT_SETTINGS,
  eardrumLegendSvg,
  eardrumSvg,
  ENT_TEMPLATE,
  FIT_LEVELS,
  flattenFindings,
  followUpDate,
  formatDateDmy,
  formatInstructionParts,
  historyLines,
  nextFit,
  pageContentHeightMm,
  printAge,
  printPagesFor,
  renderPrescriptionHtml,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  startFit,
  type FitState,
  type PrescriptionDoc,
  type PatientInfo,
} from "../src";

const render = (doc: Partial<PrescriptionDoc> = {}, patient: Partial<PatientInfo> = {}, settings = DEFAULT_PRINT_SETTINGS, pages?: number) =>
  renderPrescriptionHtml({
    doc: { ...SAMPLE_DOC, ...doc },
    patient: { ...SAMPLE_PATIENT, ...patient },
    doctor: SAMPLE_DOCTOR,
    chamber: SAMPLE_CHAMBER,
    date: "2026-06-11",
    settings,
    fonts: { bengali: "", latin: "" },
    pages,
  });

describe("dates", () => {
  it("adds days, weeks and months", () => {
    expect(addDuration("2026-06-11", 7, "day")).toBe("2026-06-18");
    expect(addDuration("2026-06-11", 2, "week")).toBe("2026-06-25");
    expect(addDuration("2026-06-11", 1, "month")).toBe("2026-07-11");
    expect(addDuration("2026-11-15", 3, "month")).toBe("2027-02-15");
  });

  it("clamps month steps to the end of the target month", () => {
    expect(addDuration("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addDuration("2028-01-31", 1, "month")).toBe("2028-02-29");
    expect(addDuration("2026-03-31", 1, "month")).toBe("2026-04-30");
  });

  it("works out the follow-up date", () => {
    expect(followUpDate({ kind: "after", value: 1, unit: "month" }, "2026-06-11")).toBe("2026-07-11");
    expect(followUpDate({ kind: "date", date: "2026-08-01" }, "2026-06-11")).toBe("2026-08-01");
    expect(followUpDate({ kind: "none" }, "2026-06-11")).toBeNull();
    expect(followUpDate(undefined, "2026-06-11")).toBeNull();
  });

  it("formats dd-mm-yyyy in either numeral set", () => {
    expect(formatDateDmy("2026-07-11", "bn")).toBe("১১-০৭-২০২৬");
    expect(formatDateDmy("2026-07-11", "en", "/")).toBe("11/07/2026");
  });

  it("measures print age on the prescription date", () => {
    expect(printAge("2026-05-01", "2026-06-11")).toEqual({ ageYears: undefined, ageMonths: 1, ageDays: undefined });
    expect(printAge("2026-06-01", "2026-06-11")).toEqual({ ageYears: undefined, ageMonths: undefined, ageDays: 10 });
    expect(printAge("2000-01-01", "2026-06-11")).toEqual({ ageYears: 26, ageMonths: undefined, ageDays: undefined });
    expect(printAge(null, "2026-06-11")).toEqual({});
  });
});

describe("formatInstructionParts", () => {
  it("splits the duration out of the instruction", () => {
    const tab = SAMPLE_DOC.items[0]!;
    expect(formatInstructionParts(tab, "bn", "bn")).toEqual({ main: "১+০+১ — খাবারের পরে", duration: "৫ দিন" });
  });
});

describe("renderPrescriptionHtml", () => {
  it("prints the relative follow-up with its date", () => {
    const html = render({ followUp: { kind: "after", value: 1, unit: "month" } });
    expect(html).toContain("১ মাস পর আসবেন। (তারিখঃ ১১-০৭-২০২৬)");
  });

  it("prints a fixed follow-up date as dd-mm-yyyy", () => {
    expect(render({ followUp: { kind: "date", date: "2026-07-20" } })).toContain("২০-০৭-২০২৬ তারিখে আসবেন।");
  });

  it("ends the instruction line with the duration", () => {
    const html = render();
    expect(html).toContain(`<div class="instr">১+০+১ — খাবারের পরে — ৫ দিন</div>`);
    expect(html).not.toContain(`class="dur"`);
    // "Continue" reads the same way; no duration leaves no stray separator.
    const continued = render({ items: [{ ...SAMPLE_DOC.items[0]!, duration: { kind: "continue" } }] });
    expect(continued).toContain(`<div class="instr">১+০+১ — খাবারের পরে — চলবে</div>`);
    const noDuration = render({ items: [{ ...SAMPLE_DOC.items[0]!, duration: { kind: "none" } }] });
    expect(noDuration).toContain(`<div class="instr">১+০+১ — খাবারের পরে</div>`);
  });

  it("prints visit number, address, infant age and dd/mm/yyyy date", () => {
    const html = render({ visitNo: 3 }, { ageYears: undefined, ageMonths: 1, address: "Dhaka" });
    const strip = html.slice(html.indexOf(`<div class="patient">`), html.indexOf(`<div class="body">`));
    expect(strip).toContain("<b>Visit No:</b> 3");
    expect(html).toContain("<b>Address:</b> Dhaka");
    expect(html).toContain("<b>Age:</b> 1 M");
    expect(html).toContain("<b>Date:</b> 11/06/2026");
  });

  it("omits visit number and address when absent", () => {
    const html = render();
    expect(html).not.toContain("Visit No");
    expect(html).not.toContain("Address:");
  });

  it("prints the BMDC number in Bangla in the Bangla header block", () => {
    expect(render()).toContain("বিএমডিসি রেজি. নং: এ-১২৩৪৫");
  });

  it("prints O/E findings, Plan, Note and the note under the medicines, but never Ref By", () => {
    const html = render({
      referredBy: "Dr. Imran",
      oeFindings: [{ label: "Pulse", value: "Normal" }, { label: "Skin condition", value: "color change" }, { label: "", value: "ignored" }],
      plan: ["Refd to Paediatric ophthalmology Dept., BSMMU — Dr. Tarek Reza Ali (01766683417)"],
      notes: ["Birth wt 1.7 kg"],
      rxNote: "Dear Dr. Saad,\nThank you for the referral.",
    });
    // Ref By is for the screen only.
    expect(html).not.toContain("Ref By");
    expect(html).not.toContain("Dr. Imran");
    expect(html).toContain(`<span class="oe"><b>Pulse:</b> Normal</span>`);
    expect(html).toContain(`<span class="oe"><b>Skin condition:</b> color change</span>`);
    expect(html).not.toContain("ignored");
    expect(html).toContain("<h3>Plan</h3><ul><li>Refd to Paediatric ophthalmology Dept., BSMMU — Dr. Tarek Reza Ali (01766683417)</li></ul>");
    expect(html).toContain("<h3>Note</h3><ul><li>Birth wt 1.7 kg</li></ul>");
    expect(html).toContain(`<div class="rx-note pre">Dear Dr. Saad,\nThank you for the referral.</div>`);
    // The letter sits between the medicines and the advice.
    expect(html.indexOf("rx-note pre")).toBeGreaterThan(html.indexOf(`<ol class="rx">`));
    expect(html.indexOf("rx-note pre")).toBeLessThan(html.indexOf("<h3>উপদেশ</h3>"));
  });

  it("omits the new sections when they are empty", () => {
    const html = render();
    expect(html).not.toContain("Ref By");
    expect(html).not.toContain("<h3>Plan</h3>");
    expect(html).not.toContain("<h3>Note</h3>");
    expect(html).not.toContain(`class="rx-note`);
  });

  it("prints picked history lines as a list after any legacy free text", () => {
    expect(render({ history: undefined, histories: ["H/O DM", "Smoker"] })).toContain("<h3>History</h3><ul><li>H/O DM</li><li>Smoker</li></ul>");
    expect(render({ history: "P/H: DM\nD/H: Metformin", histories: undefined })).toContain(`<h3>History</h3><p class="pre">P/H: DM\nD/H: Metformin</p></section>`);
    expect(render({ history: "Old note", histories: ["H/O HTN"] })).toContain(`<p class="pre">Old note</p><ul><li>H/O HTN</li></ul>`);
    expect(render({ history: undefined, histories: [" "] })).not.toContain("<h3>History</h3>");
  });

  it("merges legacy and picked history into editable lines", () => {
    expect(historyLines({ history: " P/H: DM ", histories: ["Smoker", ""] })).toEqual(["P/H: DM", "Smoker"]);
    expect(historyLines({ history: "P/H: DM\n\nD/H: Metformin" })).toEqual(["P/H: DM", "D/H: Metformin"]);
    expect(historyLines({})).toEqual([]);
  });

  it("renames and hides sections from the print settings", () => {
    const html = render({ plan: ["Review with reports"] }, {}, {
      ...DEFAULT_PRINT_SETTINGS,
      sectionLabels: { dx: "Δ", ix: "Investigations", followUp: "ফলোআপঃ" },
      hiddenSections: ["history", "plan"],
    });
    expect(render({ histories: ["H/O DM"] }, {}, { ...DEFAULT_PRINT_SETTINGS, hiddenSections: ["history"] })).not.toContain("H/O DM");
    expect(html).toContain("<h3>Δ</h3>");
    expect(html).toContain("<h3>Investigations</h3>");
    expect(html).not.toContain("<h3>Dx</h3>");
    expect(html).not.toContain("Review with reports");
    expect(html).toContain("<h3>C/C</h3>");
  });

  it("keeps the line breaks of written exam findings", () => {
    const html = render({ specialtyFindings: [{ id: "ear", title: "Ear", lines: [{ label: "Findings", value: "Wax in both EAC\nTM intact <both>\n" }] }] });
    expect(html).toContain(`<h3>Ear</h3><ul><li><b>Findings:</b> Wax in both EAC<br>TM intact &lt;both&gt;</li></ul>`);
  });

  it("prints chief complaints on one line, comma separated", () => {
    const html = render({ chiefComplaints: ["Hearing loss × 3 days", " ", "Ear discharge (R) × 7 days", "জ্বর × ৩ দিন", "Itching <ear>"] });
    expect(html).toContain(`<h3>C/C</h3><p class="inline">Hearing loss × 3 days, Ear discharge (R) × 7 days, জ্বর × ৩ দিন, Itching &lt;ear&gt;</p>`);
    expect(render({ chiefComplaints: [] })).not.toContain("<h3>C/C</h3>");
  });

  it("uses English headings for advice and follow-up when instructions are in English", () => {
    const html = render({ followUp: { kind: "after", value: 7, unit: "day" } }, {}, { ...DEFAULT_PRINT_SETTINGS, instructionLang: "en", numerals: "en" });
    expect(html).toContain("<h3>Advice</h3>");
    expect(html).toContain("<h3>Follow-up</h3>");
    expect(html).toContain("Come after 7 days (on 18-06-2026).");
  });

  it("adds birth weight and gestational age to Note for children under 2", () => {
    const html = render({ notes: ["H/O PNA"] }, { ageYears: undefined, ageMonths: 1, birthWeightKg: 1.7, gestationalAgeWeeks: 30 });
    expect(html).toContain("<h3>Note</h3><ul><li>Birth wt: 1.7 kg</li><li>Born at 30 weeks (preterm)</li><li>H/O PNA</li></ul>");
    expect(render({}, { ageYears: 5, birthWeightKg: 1.7 })).not.toContain("Birth wt");
  });
});

describe("TM map always printed", () => {
  const always = { ...DEFAULT_PRINT_SETTINGS, tmMapAlways: true };
  const drums = (html: string) => html.match(/<figure class="diagram tm">/g) ?? [];

  it("prints blank drums when nothing was marked, only when the setting is on", () => {
    expect(drums(render({ diagrams: [] }))).toHaveLength(0);
    const html = render({ diagrams: [] }, {}, always);
    expect(drums(html)).toHaveLength(2);
    expect(html).toContain("scale(-1,1)"); // left drum mirrored
  });

  it("doesn't add a second pair when drums were marked (new or old prescriptions)", () => {
    const tm = [{ title: "Right TM", svg: eardrumSvg({ perforation: ["ai"], retraction: [] }, "right"), kind: "tm" as const }, { title: "Left TM", svg: eardrumSvg(undefined, "left"), kind: "tm" as const }];
    expect(drums(render({ diagrams: tm }, {}, always))).toHaveLength(2);
    const old = tm.map(({ title, svg }) => ({ title, svg }));
    expect(drums(render({ diagrams: old }, {}, always))).toHaveLength(2);
  });

  it("prints them on a pre-printed pad too, and sizes the key separately", () => {
    expect(drums(render({ diagrams: [] }, {}, { ...always, mode: "pad" }))).toHaveLength(2);
    const html = render({ diagrams: [{ title: "Key", svg: "<svg></svg>", kind: "tm-legend" }] });
    expect(html).toContain(`<figure class="diagram legend">`);
  });

  it("puts the key on the drums' row, right after the left drum", () => {
    const tm = [{ title: "Right TM", svg: eardrumSvg(undefined, "right"), kind: "tm" as const }, { title: "Left TM", svg: eardrumSvg(undefined, "left"), kind: "tm" as const }];
    const key = { title: "Key", svg: eardrumLegendSvg(["perforation", "bulging"]), kind: "tm-legend" as const };
    const html = render({ diagrams: [...tm, key, { title: "Audiogram (O right, X left)", svg: "<svg></svg>", kind: "audiogram" }] });
    const row = /<div class="ear-row">([\s\S]*?)<\/div><figure/.exec(html)?.[1] ?? "";
    // The drums carry no "Right TM" / "Left TM" caption (each is marked R / L inside its picture); the key keeps its heading.
    expect(row.match(/<figcaption>[^<]*<\/figcaption>/g)).toEqual(["<figcaption>Key</figcaption>"]);
    expect(row).toContain(`<figure class="diagram legend" style="width:18.9mm"><figcaption>Key</figcaption><div class="svg">`); // heading above the rows; "Perforation": 61 units wide
    expect(row).toContain(`>L</text></svg></div></figure>`); // the left drum: its R / L mark, then no caption
    expect(html).toContain(`</div><figure class="diagram">`); // what follows prints after the row, not in it
    // Older prescriptions (no kind) get the row too; a doctored key width is clamped.
    const old = [...tm.map(({ title, svg }) => ({ title, svg })), { ...key, svg: `<svg viewBox="0 0 99999 10"></svg>` }];
    expect(render({ diagrams: old })).toContain(`<div class="ear-row">`);
    expect(render({ diagrams: old })).toContain(`style="width:37.2mm"`);
    // Without a key the drums print as before.
    expect(render({ diagrams: tm })).not.toContain(`<div class="ear-row">`);
  });
});

describe("prescriptions longer than a page", () => {
  it("measures pages from the content height, with the page-number strip on numbered pages", () => {
    const s = DEFAULT_PRINT_SETTINGS; // A4, 10 mm margins
    expect(pageContentHeightMm(s, false)).toBe(277);
    expect(pageContentHeightMm(s, true)).toBe(277); // a 10 mm bottom margin already fits the 7 mm number strip
    expect(pageContentHeightMm({ ...s, marginBottomMm: 2 }, true)).toBe(280);
    expect(printPagesFor(200, s)).toBe(1);
    expect(printPagesFor(277.3, s)).toBe(1); // rounding slack
    expect(printPagesFor(300, s)).toBe(2);
    expect(printPagesFor(600, s)).toBe(3);
    expect(printPagesFor(Number.NaN, s)).toBe(1);
  });

  it("numbers pages and stretches the page box to all of them only at 2+ pages", () => {
    const one = render({});
    expect(one).not.toContain("counter(pages)");
    expect(one).toContain(".page { min-height: 277mm;");
    const three = render({}, {}, DEFAULT_PRINT_SETTINGS, 3);
    expect(three).toContain('@bottom-right { content: "Page " counter(page) " of " counter(pages);');
    expect(three).toContain("margin: 0 0 7mm 0;");
    expect(three).toContain(".page { min-height: 831mm;"); // 3 × 277: the footer ends at the bottom of page 3
    expect(three).toContain(".sheet { padding: 10mm 10mm 3mm 10mm;"); // 10 mm bottom margin = 7 mm strip + 3 mm
    // A doctored page count can't blow the page up.
    expect(render({}, {}, DEFAULT_PRINT_SETTINGS, 1e9)).toContain(".page { min-height: 13850mm;");
    expect(render({}, {}, DEFAULT_PRINT_SETTINGS, -2)).not.toContain("counter(pages)");
  });
});

describe("fit to one page", () => {
  const fitted = (fit: number | undefined, settings = DEFAULT_PRINT_SETTINGS) =>
    renderPrescriptionHtml({
      doc: SAMPLE_DOC, patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber: SAMPLE_CHAMBER, date: "2026-06-11",
      settings, fonts: { bengali: "", latin: "" }, fit,
    });

  it("is on by default and steps from the natural layout down to 80%", () => {
    expect(DEFAULT_PRINT_SETTINGS.fitOnePage).toBe(true);
    expect(FIT_LEVELS[0]).toEqual({ scale: 1, tight: false });
    expect(FIT_LEVELS.at(-1)).toEqual({ scale: 0.8, tight: true });
    const scales = FIT_LEVELS.map((l) => l.scale);
    expect(scales).toEqual([...scales].sort((a, b) => b - a));
  });

  it("level 0 prints exactly as without fitting", () => {
    expect(fitted(0)).toBe(fitted(undefined));
    expect(fitted(0)).not.toContain("Fit to one page");
    expect(fitted(-3)).toBe(fitted(undefined)); // a doctored level is clamped
  });

  it("tightens the body's spacing at level 1, at full size", () => {
    const html = fitted(1);
    expect(html).toContain(".body { font-size: 1em; line-height: 1.2; }");
    expect(html).toContain(":where(.body) .rx-item { margin-bottom: 1.5mm; }");
    expect(html).toContain(":where(.body) .diagram .svg svg { width: 28mm; }");
    expect(html).toContain(".sign { margin-top: 15mm; font-size: 11pt; line-height: 1.35; }");
  });

  it("shrinks only the body at the floor: header, patient strip, footer, QR, barcode and signature keep their size", () => {
    const html = fitted(5, { ...DEFAULT_PRINT_SETTINGS, fontSizePt: 10 });
    expect(html).toContain(".body { font-size: 0.8em; line-height: 1.2; }");
    expect(html).toContain(":where(.body) .diagram .svg svg { width: 22.4mm; }");
    expect(html).toContain(":where(.body) .diagram.neck .svg svg { width: 24mm; }");
    expect(html).toContain(":where(.body) .ear-row .diagram.tm { flex: 0 1 16mm; min-width: 11.2mm; }");
    expect(html).toContain(".barcode { font-size: 8pt; }");
    expect(html).toContain(".sign { margin-top: 15mm; font-size: 10pt; line-height: 1.35; }");
    // Everything outside the body is the same CSS as the natural layout.
    const base = fitted(0, { ...DEFAULT_PRINT_SETTINGS, fontSizePt: 10 });
    expect(html.replace(/\/\* Fit to one page[\s\S]*?(?=@media screen)/, "")).toBe(base);
  });
});

describe("medicine font", () => {
  it("prints medicine names at their own size, relative to the body so fitting shrinks them too", () => {
    expect(DEFAULT_PRINT_SETTINGS.drugFontSizePt).toBe(12);
    const html = render();
    expect(html).toContain(".rx-item .drug { font-size: 1.091em; }"); // 12pt over an 11pt body
    expect(html).toContain(".rx-item .gen { font-size: 0.779em; }"); // the generic stays 0.85 of the body
    const big = render({}, {}, { ...DEFAULT_PRINT_SETTINGS, fontSizePt: 10, drugFontSizePt: 13 });
    expect(big).toContain(".rx-item .drug { font-size: 1.3em; }");
    // A missing or broken size prints medicine names at the body size.
    expect(render({}, {}, { ...DEFAULT_PRINT_SETTINGS, drugFontSizePt: 0 })).toContain(".rx-item .drug { font-size: 1em; }");
  });
});

describe("exam sections two per row", () => {
  const exam = flattenFindings(ENT_TEMPLATE, {
    ear_tm: { right: "Perforated" },
    ear_tm_map: { right: { perforation: ["ai"], retraction: [] } },
    nose_notes: "DNS to left",
    thr_notes: "Tonsils grade 2",
    neck_notes: "No lymphadenopathy",
  });
  const at = (s: string, sub: string) => s.indexOf(sub);
  const withLeft = (pct: number) =>
    render({ specialtyFindings: exam.groups, diagrams: exam.diagrams }, {}, { ...DEFAULT_PRINT_SETTINGS, leftColumnPct: pct });

  it("keeps one section per row in a narrow left column", () => {
    expect(withLeft(34)).not.toContain(`<div class="exam-cols">`);
    expect(withLeft(44)).not.toContain(`<div class="exam-cols">`);
  });

  it("puts Nose & PNS, Throat and Neck two per row in a wide one; Ear and its drums keep the full width", () => {
    const html = withLeft(50);
    const cols = html.slice(at(html, `<div class="exam-cols">`));
    expect(cols).toMatch(/^<div class="exam-cols"><section><h3>Nose &amp; PNS<\/h3>[\s\S]*<h3>Throat<\/h3>[\s\S]*<h3>Neck<\/h3>/);
    expect(at(html, "<h3>Ear</h3>")).toBeLessThan(at(html, `<div class="exam-cols">`));
    expect(html.match(/<div class="exam-cols">/g)).toHaveLength(1);
  });

  it("a lone section needs no row", () => {
    const one = flattenFindings(ENT_TEMPLATE, { thr_notes: "Tonsils grade 2" });
    const html = render({ specialtyFindings: one.groups, diagrams: one.diagrams }, {}, { ...DEFAULT_PRINT_SETTINGS, leftColumnPct: 60 });
    expect(html).toContain("<h3>Throat</h3>");
    expect(html).not.toContain(`<div class="exam-cols">`);
  });
});

describe("the fit search", () => {
  const s = DEFAULT_PRINT_SETTINGS;
  /** Runs the search against a prescription that fits from level `fitsFrom` (never: Infinity); returns the levels tried. */
  const run = (fitsFrom: number, pagesAt0 = 2, settings = s) => {
    let st: FitState = startFit();
    const tried: number[] = [];
    while (!st.done) {
      tried.push(st.level);
      st = nextFit(st, settings, st.level === 0 ? (fitsFrom === 0 ? 1 : pagesAt0) : st.level >= fitsFrom ? 1 : 2);
    }
    return { st, tried };
  };

  it("keeps a prescription that already fits as it is", () => {
    const { st, tried } = run(0);
    expect(tried).toEqual([0]);
    expect(st).toMatchObject({ level: 0, pages: 1, done: true });
  });

  it("finds the largest size that fits, in at most four renders", () => {
    for (let k = 1; k < FIT_LEVELS.length; k++) {
      const { st, tried } = run(k);
      expect(st).toMatchObject({ level: k, pages: 1, done: true });
      expect(tried.length).toBeLessThanOrEqual(4);
    }
  });

  it("falls back to the natural size on numbered pages when even 80% overflows", () => {
    const { st, tried } = run(Infinity, 3);
    expect(st).toMatchObject({ level: 0, pages: 3, done: true });
    expect(tried.length).toBeLessThanOrEqual(4);
  });

  it("with fitting off, uses numbered pages straight away", () => {
    const { st, tried } = run(1, 2, { ...s, fitOnePage: false });
    expect(tried).toEqual([0]);
    expect(st).toMatchObject({ level: 0, pages: 2, done: true });
  });

  it("ignores measurements once done", () => {
    const done = run(3).st;
    expect(nextFit(done, s, 5)).toBe(done);
  });
});

describe("exam pictures print under their own section", () => {
  const exam = flattenFindings(ENT_TEMPLATE, {
    ear_tm: { right: "Perforated" },
    ear_tm_map: { right: { perforation: ["ai"], retraction: [] } },
    nose_septum: "DNS to left",
    nose_map: { zones: { r_it: "hypertrophied" } },
    thr_tonsil_grade: { right: "Grade 3" },
    thr_oro_map: { zones: { r_tonsil: "swollen" } },
    aud_pta: { right: { ac: { 500: 40, 1000: 45, 2000: 50, 4000: 55 }, bc: {} } },
  });
  const at = (html: string, s: string) => {
    const i = html.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };

  it("doesn't print the TM map's words when the drums print, since the pictures show them", () => {
    const ear = flattenFindings(ENT_TEMPLATE, {
      ear_tm: { right: "Retracted" },
      ear_tm_map: { right: { perforation: [], retraction: ["as", "ai", "ps", "pi"] }, left: { perforation: [], retraction: [], disc: "medium" } },
      ear_discharge: { right: ["Mucoid"] },
    });
    const html = render({ specialtyFindings: ear.groups, diagrams: ear.diagrams });
    expect(html).not.toContain("<b>TM map:</b>");
    expect(html).not.toContain("central perforation (medium)");
    expect(html).toContain(`<b>Discharge:</b> R Mucoid</li></ul><div class="diagrams"><div class="ear-row">`); // the other answers, then the drums
    // Exams saved before the marker existed are matched by the label, and so are older prescriptions' unplaced drums.
    const old = ear.groups.map((g) => ({ ...g, lines: g.lines.map(({ label, value }) => ({ label, value })) }));
    expect(render({ specialtyFindings: old, diagrams: ear.diagrams })).not.toContain("<b>TM map:</b>");
    expect(render({ specialtyFindings: old, diagrams: ear.diagrams.map(({ section: _, ...d }) => d) })).not.toContain("<b>TM map:</b>");
    // Without the drums the words are all there is, so they print.
    const noDrums = render({ specialtyFindings: old, diagrams: [] });
    expect(at(noDrums, "<b>TM map:</b>")).toBeLessThan(at(noDrums, "<b>Discharge:</b>"));
  });

  it("tags every group and picture with its template section", () => {
    expect(exam.groups.map((g) => g.id)).toEqual(["ear", "nose", "throat", "audiology"]);
    expect(exam.diagrams.map((d) => [d.title, d.section])).toEqual([
      ["Right TM", "ear"], ["Left TM", "ear"], ["Key", "ear"], ["Nose & sinuses", "nose"], ["Key", "nose"], ["Oropharynx", "throat"], ["Key", "throat"], ["Audiogram (O right, X left)", "audiology"],
    ]);
  });

  it("prints the nose picture without its words or caption; its key and the other answers stay", () => {
    const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams });
    const nose = html.slice(at(html, "<h3>Nose &amp; PNS</h3>"), at(html, "<h3>Throat</h3>"));
    expect(nose).toContain("<b>Septum:</b> DNS to left");
    expect(nose).not.toContain("Nose &amp; sinus map");
    expect(nose).not.toContain("Nose &amp; sinuses</figcaption>");
    expect(nose).toContain(">Max</text>"); // the picture
    expect(nose).toContain("<figcaption>Key</figcaption>");
    // Other pictures keep their words and caption.
    expect(html).toContain("<b>Oropharynx map:</b>");
    expect(html).toContain("Oropharynx</figcaption>");
    // Older exams (lines without `picture`) are matched by label; without the picture the words are all there is.
    const old = exam.groups.map((g) => ({ ...g, lines: g.lines.map(({ label, value }) => ({ label, value })) }));
    expect(render({ specialtyFindings: old, diagrams: exam.diagrams })).not.toContain("Nose &amp; sinus map");
    expect(render({ specialtyFindings: exam.groups, diagrams: [] })).toContain("<b>Nose &amp; sinus map:</b>");
  });

  it("puts Ear, Nose and Throat pictures right after their findings, and the audiogram inside Ix", () => {
    const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams });
    const order = ["<h3>Ear</h3>", `<figure class="diagram tm">`, "<h3>Nose &amp; PNS</h3>", ">Max</text>", "<h3>Throat</h3>", "Oropharynx</figcaption>", "<h3>Ix</h3>", "Audiogram"];
    const idx = order.map((s) => at(html, s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(html).not.toContain(`<section class="diagrams">`);
  });

  it("prints older prescriptions (no sections) as before: all pictures after the findings", () => {
    const old = { specialtyFindings: exam.groups.map(({ title, lines }) => ({ title, lines })), diagrams: exam.diagrams.map(({ section: _, ...d }) => d) };
    const html = render(old);
    expect(at(html, "<h3>Audiology</h3>")).toBeLessThan(at(html, `<section class="diagrams">`));
    expect(at(html, `<section class="diagrams">`)).toBeLessThan(at(html, `<figure class="diagram tm">`));
  });

  it("puts a blank always-print picture in its section, or after the findings when that section is empty", () => {
    const settings = { ...DEFAULT_PRINT_SETTINGS, tmMapAlways: true, sketchesAlways: ["larynx" as const] };
    const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams.filter((d) => d.section !== "ear") }, {}, settings);
    expect(at(html, "<h3>Ear</h3>")).toBeLessThan(at(html, `<figure class="diagram tm">`));
    expect(at(html, `<figure class="diagram tm">`)).toBeLessThan(at(html, "<h3>Nose &amp; PNS</h3>"));
    expect(at(html, "<h3>Throat</h3>")).toBeLessThan(at(html, "Larynx (IDL)</figcaption>"));
    expect(at(html, "Larynx (IDL)</figcaption>")).toBeLessThan(at(html, "<h3>Ix</h3>"));
    const noEar = render({ specialtyFindings: exam.groups.filter((g) => g.id !== "ear"), diagrams: [] }, {}, settings);
    expect(at(noEar, `<section class="diagrams">`)).toBeLessThan(at(noEar, `<figure class="diagram tm">`));
  });

  describe("Audiology prints inside Ix", () => {
    it("after the advised tests, with its audiogram and no heading of its own", () => {
      const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams, investigations: ["CBC", "X-ray PNS (OM view)"] });
      const ix = html.slice(at(html, "<h3>Ix</h3>"));
      const order = ["<li>CBC</li>", "<li>X-ray PNS (OM view)</li>", "<b>PTA:</b> R 47.5 dB", "Audiogram (O right, X left)</figcaption>"];
      const idx = order.map((s) => at(ix, s));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(ix.indexOf("</section>")).toBeGreaterThan(at(ix, "Audiogram (O right, X left)</figcaption>")); // all in the Ix section
      expect(html).not.toContain("<h3>Audiology</h3>");
    });

    it("prints Ix even when only audiology is filled in", () => {
      const audio = exam.groups.filter((g) => g.id === "audiology");
      const html = render({ specialtyFindings: audio, diagrams: exam.diagrams.filter((d) => d.section === "audiology"), investigations: [] });
      expect(at(html, "<h3>Ix</h3>")).toBeLessThan(at(html, "<b>PTA:</b>"));
    });

    it("keeps its own heading with the examination when the doctor hides Ix", () => {
      const settings = { ...DEFAULT_PRINT_SETTINGS, hiddenSections: ["ix" as const] };
      const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams, investigations: ["CBC"] }, {}, settings);
      expect(html).not.toContain("<h3>Ix</h3>");
      expect(html).not.toContain("<li>CBC</li>");
      expect(at(html, "<h3>Audiology</h3>")).toBeLessThan(at(html, "<b>PTA:</b>"));
      expect(at(html, "<b>PTA:</b>")).toBeLessThan(at(html, "Audiogram (O right, X left)</figcaption>"));
    });
  });

  describe("Neck is its own section, after Throat", () => {
    const withNeck = flattenFindings(ENT_TEMPLATE, {
      thr_tonsil_grade: { right: "Grade 3" },
      thr_oro_map: { zones: { r_tonsil: "swollen" } },
      thr_neck: "Thyroid swelling",
      thr_neck_map: { zones: { thyroid: "enlarged" } },
    });

    it("groups the neck answers and picture under Neck, not Throat", () => {
      expect(withNeck.groups.map((g) => [g.id, g.title])).toEqual([["throat", "Throat"], ["neck", "Neck"]]);
      expect(withNeck.groups.find((g) => g.id === "throat")!.lines.map((l) => l.label)).not.toContain("Neck");
      const neckPics = withNeck.diagrams.filter((d) => d.ref === "neck");
      expect(neckPics.length).toBeGreaterThan(0);
      expect(neckPics.every((d) => d.section === "neck")).toBe(true);
    });

    it("prints Throat then Neck, each with its own picture", () => {
      const html = render({ specialtyFindings: withNeck.groups, diagrams: withNeck.diagrams });
      const order = ["<h3>Throat</h3>", "Oropharynx</figcaption>", "<h3>Neck</h3>", "<b>Neck:</b> Thyroid swelling", "Neck</figcaption>"];
      const idx = order.map((s) => at(html, s));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(html).not.toContain(`<section class="diagrams">`);
    });

    it("puts a blank always-print neck under Neck, or after the findings when Neck has no answers", () => {
      const settings = { ...DEFAULT_PRINT_SETTINGS, sketchesAlways: ["neck" as const] };
      const linesOnly = { specialtyFindings: withNeck.groups, diagrams: withNeck.diagrams.filter((d) => d.ref !== "neck") };
      const html = render(linesOnly, {}, settings);
      expect(at(html, "<h3>Neck</h3>")).toBeLessThan(at(html, "Neck</figcaption>"));
      expect(html).not.toContain(`<section class="diagrams">`);
      const throatOnly = render({ ...linesOnly, specialtyFindings: withNeck.groups.filter((g) => g.id !== "neck") }, {}, settings);
      expect(at(throatOnly, `<section class="diagrams">`)).toBeLessThan(at(throatOnly, "Neck</figcaption>"));
    });
  });
});

describe("long prescriptions flow onto the next page", () => {
  it("lets a section break across pages, keeping only its pieces whole", () => {
    // A section kept whole that is taller than the rest of page 1 moves to page 2, and at the top of a column it takes
    // the whole column (and the body) with it: page 1 printed blank.
    const html = render();
    expect(html).toContain("section { margin-bottom: 2.5mm; }");
    expect(html).not.toMatch(/section \{[^}]*break-inside: avoid/);
    expect(html).toMatch(/h3 \{[^}]*break-after: avoid/);
    expect(html).toContain("li, .oe, .pre { break-inside: avoid; }");
    expect(html).toMatch(/\.ear-row \{[^}]*break-inside: avoid/);
  });

  it("lays the left column out as a grid, not a column flexbox, which Chrome moved wholly onto page 2", () => {
    expect(render()).toMatch(/\.left \{[^}]*display: grid; grid-template-rows: 1fr auto; \}/);
    expect(render()).not.toMatch(/\.left \{[^}]*display: flex/);
  });

  it("keeps the pad's QR as the last row of the left column, after the findings", () => {
    const html = renderPrescriptionHtml({
      doc: SAMPLE_DOC, patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber: SAMPLE_CHAMBER, date: "2026-11-05",
      settings: { ...DEFAULT_PRINT_SETTINGS, mode: "pad" }, fonts: { bengali: "", latin: "" },
      qrSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`,
    });
    const left = html.slice(html.indexOf(`<div class="left">`), html.indexOf(`<div class="right">`));
    expect(left).toMatch(/^<div class="left"><div class="left-main">[\s\S]*<\/div><div class="qr"><svg/);
  });
});

describe("page margins", () => {
  it("leaves no @page margin for the browser's header/footer and pads every page instead", () => {
    const html = render({}, {}, { ...DEFAULT_PRINT_SETTINGS, mode: "pad" });
    expect(html).toMatch(/@page \{ size: [\d.]+mm [\d.]+mm; margin: 0; \}/);
    expect(html).toContain(".sheet { padding: 55mm 10mm 30mm 10mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }");
  });
});

describe("signature and QR placement", () => {
  const renderWith = (mode: "letterhead" | "pad") =>
    renderPrescriptionHtml({
      doc: SAMPLE_DOC,
      patient: SAMPLE_PATIENT,
      doctor: SAMPLE_DOCTOR,
      chamber: SAMPLE_CHAMBER,
      date: "2026-06-11",
      settings: { ...DEFAULT_PRINT_SETTINGS, mode },
      fonts: { bengali: "", latin: "" },
      qrSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>`,
    });
  const leftOf = (html: string) => html.slice(html.indexOf(`<div class="left">`), html.indexOf(`<div class="right">`));
  const html = renderWith("letterhead");
  const right = html.slice(html.indexOf(`<div class="right">`), html.indexOf("<footer>"));

  it("signs right after the last line of the prescription", () => {
    expect(right).toContain(`class="sign"`);
    expect(right).toContain("পুনরায় সাক্ষাৎ");
    expect(right.indexOf(`class="sign"`)).toBeGreaterThan(right.indexOf("পুনরায় সাক্ষাৎ"));
  });

  it("centres the QR in the letterhead footer, with no row under the body", () => {
    expect(html).toMatch(/<div class="foot-qr"><div class="qr"><svg/);
    expect(leftOf(html)).not.toContain(`class="qr"`);
    expect(html).not.toContain(`class="bottom"`);
  });

  it("keeps the QR at the end of the left column on a pre-printed pad, which has no footer", () => {
    const pad = renderWith("pad");
    expect(leftOf(pad)).toContain(`class="qr"`);
    expect(pad).not.toContain("<footer>");
  });
});

describe("O/E", () => {
  const render = (doc: Partial<PrescriptionDoc>, settings = DEFAULT_PRINT_SETTINGS) =>
    renderPrescriptionHtml({
      doc: { ...SAMPLE_DOC, ...doc }, patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber: SAMPLE_CHAMBER, date: "2026-06-11",
      settings, fonts: { bengali: "", latin: "" },
    });

  const strip = (html: string) => /<div class="patient">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  const cells = (html: string) => [...strip(html).matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1]!.replace(/<\/?b>/g, ""));

  it("prints the vitals and findings in the patient strip, right after the ID", () => {
    const html = render({ oeFindings: [{ label: "Throat", value: "congested" }] });
    const c = cells(html);
    const id = c.findIndex((x) => x.startsWith("ID:"));
    expect(id).toBeGreaterThan(-1);
    expect(c.slice(id + 1)).toEqual(["BP: 120/80 mmHg", "Pulse: 78 b/m", "Temp: 99.2 °F", "Wt: 68 kg", "Ht: 170 cm", "BMI: 23.5", "Throat: congested"]);
    expect(strip(html)).toContain(`<span class="oe"><b>BP:</b> 120/80 mmHg</span>`);
    expect(html).not.toContain("<h3>O/E</h3>");
    expect(html).not.toContain(`<p class="oe">`);
  });

  it("keeps the free-text examination in the body under its (renamable) heading, and can be hidden", () => {
    expect(render({ examination: "Throat congested" })).toContain(`<section><p class="pre"><b>O/E:</b> Throat congested</p></section>`);
    const renamed = render({ examination: "Throat congested" }, { ...DEFAULT_PRINT_SETTINGS, sectionLabels: { oe: "On exam:" } });
    expect(renamed).toContain(`<p class="pre"><b>On exam:</b> Throat congested</p>`);
    expect(strip(render({ vitals: {}, oeFindings: [] }))).not.toContain(`class="oe"`);
    const hidden = render({ examination: "Throat congested" }, { ...DEFAULT_PRINT_SETTINGS, hiddenSections: ["oe"] });
    expect(hidden).not.toContain("BP:");
    expect(hidden).not.toContain("Throat congested");
  });
});
