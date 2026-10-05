import { describe, expect, it } from "vitest";
import {
  addDuration,
  DEFAULT_PRINT_SETTINGS,
  followUpDate,
  formatDateDmy,
  formatInstructionParts,
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
    expect(html).toContain("Visit No: 3");
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

  it("prints Ref By, O/E findings, Plan, Note and the note under the medicines", () => {
    const html = render({
      referredBy: "Dr. Imran",
      oeFindings: [{ label: "Pulse", value: "Normal" }, { label: "Skin condition", value: "color change" }, { label: "", value: "ignored" }],
      plan: ["Refd to Paediatric ophthalmology Dept., BSMMU — Dr. Tarek Reza Ali (01766683417)"],
      notes: ["Birth wt 1.7 kg"],
      rxNote: "Dear Dr. Saad,\nThank you for the referral.",
    });
    expect(html).toContain("<b>Ref By:</b> Dr. Imran");
    expect(html).toContain(`<td class="k">Pulse</td><td>: Normal</td>`);
    expect(html).toContain(`<td class="k">Skin condition</td><td>: color change</td>`);
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

  it("renames and hides sections from the print settings", () => {
    const html = render({ plan: ["Review with reports"] }, {}, {
      ...DEFAULT_PRINT_SETTINGS,
      sectionLabels: { dx: "Δ", ix: "Investigations", followUp: "ফলোআপঃ" },
      hiddenSections: ["history", "plan"],
    });
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
