import { describe, expect, it } from "vitest";
import {
  addDuration,
  DEFAULT_PRINT_SETTINGS,
  eardrumSvg,
  ENT_TEMPLATE,
  flattenFindings,
  followUpDate,
  formatDateDmy,
  formatInstructionParts,
  historyLines,
  printAge,
  renderPrescriptionHtml,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  type PrescriptionDoc,
  type PatientInfo,
} from "../src";

const render = (doc: Partial<PrescriptionDoc> = {}, patient: Partial<PatientInfo> = {}, settings = DEFAULT_PRINT_SETTINGS) =>
  renderPrescriptionHtml({
    doc: { ...SAMPLE_DOC, ...doc },
    patient: { ...SAMPLE_PATIENT, ...patient },
    doctor: SAMPLE_DOCTOR,
    chamber: SAMPLE_CHAMBER,
    date: "2026-06-11",
    settings,
    fonts: { bengali: "", latin: "" },
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

  it("puts the duration in its own column", () => {
    const html = render();
    expect(html).toContain(`<div class="instr">১+০+১ — খাবারের পরে</div>`);
    expect(html).toContain(`<div class="dur">- ৫ দিন</div>`);
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
    expect(html).toContain(`<span>Pulse: Normal</span>, <span>Skin condition: color change</span>`);
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
  const drums = (html: string) => html.match(/<figcaption>(Right|Left) TM<\/figcaption>/g) ?? [];

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

  it("tags every group and picture with its template section", () => {
    expect(exam.groups.map((g) => g.id)).toEqual(["ear", "nose", "throat", "audiology"]);
    expect(exam.diagrams.map((d) => [d.title, d.section])).toEqual([
      ["Right TM", "ear"], ["Left TM", "ear"], ["Nose & sinuses", "nose"], ["Key", "nose"], ["Oropharynx", "throat"], ["Key", "throat"], ["Audiogram (O right, X left)", "audiology"],
    ]);
  });

  it("puts Ear, Nose, Throat and Audiology pictures right after their findings", () => {
    const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams });
    const order = ["<h3>Ear</h3>", "Right TM</figcaption>", "<h3>Nose &amp; PNS</h3>", "Nose &amp; sinuses</figcaption>", "<h3>Throat &amp; neck</h3>", "Oropharynx</figcaption>", "<h3>Audiology</h3>", "Audiogram"];
    const idx = order.map((s) => at(html, s));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(html).not.toContain(`<section class="diagrams">`);
  });

  it("prints older prescriptions (no sections) as before: all pictures after the findings", () => {
    const old = { specialtyFindings: exam.groups.map(({ title, lines }) => ({ title, lines })), diagrams: exam.diagrams.map(({ section: _, ...d }) => d) };
    const html = render(old);
    expect(at(html, "<h3>Audiology</h3>")).toBeLessThan(at(html, `<section class="diagrams">`));
    expect(at(html, `<section class="diagrams">`)).toBeLessThan(at(html, "Right TM</figcaption>"));
  });

  it("puts a blank always-print picture in its section, or after the findings when that section is empty", () => {
    const settings = { ...DEFAULT_PRINT_SETTINGS, tmMapAlways: true, sketchesAlways: ["larynx" as const] };
    const html = render({ specialtyFindings: exam.groups, diagrams: exam.diagrams.filter((d) => d.section !== "ear") }, {}, settings);
    expect(at(html, "<h3>Ear</h3>")).toBeLessThan(at(html, "Right TM</figcaption>"));
    expect(at(html, "Right TM</figcaption>")).toBeLessThan(at(html, "<h3>Nose &amp; PNS</h3>"));
    expect(at(html, "<h3>Throat &amp; neck</h3>")).toBeLessThan(at(html, "Larynx (IDL)</figcaption>"));
    expect(at(html, "Larynx (IDL)</figcaption>")).toBeLessThan(at(html, "<h3>Audiology</h3>"));
    const noEar = render({ specialtyFindings: exam.groups.filter((g) => g.id !== "ear"), diagrams: [] }, {}, settings);
    expect(at(noEar, `<section class="diagrams">`)).toBeLessThan(at(noEar, "Right TM</figcaption>"));
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

  it("prints the bold heading and the vitals and findings as one comma-separated line", () => {
    const html = render({ oeFindings: [{ label: "Throat", value: "congested" }] });
    expect(html).toContain(
      `<section><p class="oe"><b>O/E:</b> <span class="v">BP: 120/80 mmHg</span>, <span class="v">Pulse: 78 b/m</span>, <span class="v">Temp: 99.2 °F</span>, ` +
        `<span class="v">Wt: 68 kg</span>, <span class="v">Ht: 170 cm</span>, <span class="v">BMI: 23.5</span>, <span>Throat: congested</span></p>`,
    );
    expect(html).not.toContain("<h3>O/E</h3>");
  });

  it("uses a renamed heading, puts the heading before a lone examination note, and can be hidden", () => {
    const renamed = render({}, { ...DEFAULT_PRINT_SETTINGS, sectionLabels: { oe: "On exam:" } });
    expect(renamed).toContain(`<p class="oe"><b>On exam:</b> <span class="v">BP:`);
    expect(render({ vitals: {}, oeFindings: [], examination: "Throat congested" })).toContain(`<p class="pre"><b>O/E:</b> Throat congested</p>`);
    expect(render({}, { ...DEFAULT_PRINT_SETTINGS, hiddenSections: ["oe"] })).not.toContain("BP: 120/80");
  });
});
