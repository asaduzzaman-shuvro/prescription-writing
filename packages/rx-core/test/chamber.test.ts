import { describe, expect, it } from "vitest";
import {
  code39Encodable,
  code39Modules,
  code39Svg,
  DEFAULT_PRINT_SETTINGS,
  formatDays,
  formatSlot,
  formatTime,
  formatTimeRange,
  chamberWorkdays,
  freeReportPolicyText,
  inFreeReportWindow,
  workingDaysBetween,
  renderPrescriptionHtml,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  type ChamberHeader,
  type PrintSettings,
} from "../src";

describe("chamber schedule", () => {
  it("formats day runs and lists the Bangladeshi way", () => {
    expect(formatDays(["sat", "sun", "mon", "tue", "wed"], "bn")).toBe("শনি থেকে বুধবার");
    expect(formatDays(["thu", "sun", "tue"], "bn")).toBe("রবিবার, মঙ্গলবার ও বৃহস্পতিবার");
    expect(formatDays(["fri"], "bn")).toBe("শুক্রবার");
    expect(formatDays(["sat", "sun", "mon", "tue", "wed", "thu", "fri"], "bn")).toBe("প্রতিদিন");
    expect(formatDays(["sat", "sun", "mon", "tue", "wed", "thu"], "en")).toBe("Sat–Thu");
    expect(formatDays(["sun", "wed"], "en")).toBe("Sun & Wed");
    expect(formatDays([], "bn")).toBe("");
  });

  it("formats times with the Bangla time-of-day word", () => {
    expect(formatTime("09:00", "bn", "bn")).toBe("সকাল ৯টা");
    expect(formatTime("13:00", "bn", "bn")).toBe("দুপুর ১টা");
    expect(formatTime("17:30", "bn", "bn")).toBe("বিকাল ৫.৩০টা");
    expect(formatTime("21:00", "bn", "bn")).toBe("রাত ৯টা");
    expect(formatTime("17:30", "en", "en")).toBe("5:30pm");
    expect(formatTimeRange("09:00", "10:00", "bn", "bn")).toBe("সকাল ৯টা - ১০টা");
    expect(formatTimeRange("16:00", "20:00", "bn", "bn")).toBe("বিকাল ৪টা - রাত ৮টা");
  });

  it("formats a whole slot", () => {
    expect(formatSlot({ days: ["sun", "tue", "thu"], from: "09:00", to: "10:00" }, "bn", "bn")).toBe("রবিবার, মঙ্গলবার ও বৃহস্পতিবার, সকাল ৯টা - ১০টা");
    expect(formatSlot({ label: "অপারেশন", days: ["sun", "wed"] }, "bn", "bn")).toBe("অপারেশন: রবিবার ও বুধবার");
  });
});

describe("Code 39", () => {
  it("accepts patient codes and rejects other characters", () => {
    expect(code39Encodable("P-000123")).toBe(true);
    expect(code39Encodable("p-12")).toBe(true);
    expect(code39Encodable("রোগী")).toBe(false);
    expect(code39Encodable("A*B")).toBe(false);
    expect(code39Encodable("")).toBe(false);
    expect(code39Svg("রোগী")).toBeNull();
  });

  it("encodes start/stop, characters and gaps", () => {
    // "*" + "0" + "*": 3 chars × 9 elements + 2 gaps.
    const m = code39Modules("0");
    expect(m).toHaveLength(29);
    // "*" = n w n n w n w n n
    expect(m.slice(0, 9)).toEqual([1, 3, 1, 1, 3, 1, 3, 1, 1]);
    expect(m[9]).toBe(1);
    // "0" = n n n w w n w n n
    expect(m.slice(10, 19)).toEqual([1, 1, 1, 3, 3, 1, 3, 1, 1]);
    // Every character has exactly 3 wide elements.
    for (let i = 0; i < 3; i++) expect(m.slice(i * 10, i * 10 + 9).filter((w) => w === 3)).toHaveLength(3);
  });

  it("draws one rect per bar", () => {
    const svg = code39Svg("P-1")!;
    expect(svg.match(/<rect /g)).toHaveLength(5 * 5); // 5 chars incl. start/stop, 5 bars each
  });
});

describe("renderPrescriptionHtml: chambers, logo, barcode", () => {
  const chamber: ChamberHeader = {
    ...SAMPLE_CHAMBER,
    hours: "old free text",
    schedule: [{ days: ["sun", "tue", "thu"], from: "09:00", to: "10:00" }],
    serialPhone: "01717-021090",
    footerText: "পরামর্শের ৫ কর্মদিবসের মধ্যে রিপোর্ট দেখাতে সিরিয়াল বা ভিজিট লাগবে না।",
    logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  };
  const render = (settings: Partial<PrintSettings> = {}, chambers?: ChamberHeader[]) =>
    renderPrescriptionHtml({
      doc: SAMPLE_DOC, patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber, chambers, date: "2026-06-11",
      settings: { ...DEFAULT_PRINT_SETTINGS, ...settings }, fonts: { bengali: "", latin: "" },
    });

  it("prints the schedule (not the old hours), serial phone and policy line in the footer", () => {
    const html = render();
    expect(html).toContain("রবিবার, মঙ্গলবার ও বৃহস্পতিবার, সকাল ৯টা - ১০টা");
    expect(html).not.toContain("old free text");
    expect(html).toContain("সিরিয়াল: 01717-021090");
    expect(html).toContain(`<div class="policy">পরামর্শের ৫ কর্মদিবসের`);
    expect(html).toContain(`<div class="logo"><img src="data:image/png;base64,iVBORw0KGgo="`);
  });

  it("lists every chamber under the header when asked", () => {
    const other: ChamberHeader = { name: "Rajbari Eye Clinic", address: "Rajbari", schedule: [{ days: ["thu"], from: "09:00", to: "11:00" }] };
    const html = render({ chambersInHeader: true }, [chamber, other]);
    const strip = html.slice(html.indexOf(`<div class="chambers">`), html.indexOf(`<div class="patient">`));
    expect(strip).toContain("Popular Diagnostic Centre");
    expect(strip).toContain("Rajbari Eye Clinic");
    expect(strip).toContain("বৃহস্পতিবার, সকাল ৯টা - ১১টা");
    const footer = html.slice(html.indexOf("<footer>"));
    expect(footer).not.toContain(`class="chamber"`);
    expect(footer).toContain("পরামর্শের");
  });

  it("prints nothing of the letterhead in pad mode", () => {
    const html = render({ mode: "pad", chambersInHeader: true }, [chamber]);
    expect(html).not.toContain("<footer>");
    expect(html).not.toContain(`<div class="chambers">`);
    expect(html).not.toContain(`class="logo"`);
  });

  it("prints the patient barcode only when enabled", () => {
    expect(render()).not.toContain(`class="barcode"`);
    const html = render({ showBarcode: true });
    expect(html).toContain(`<div class="barcode"><svg`);
    expect(html).toContain("*P-000123*");
  });
});

describe("free report-showing window", () => {
  // 2026-06-11 is a Thursday; 2026-06-12 a Friday.
  it("counts working days, skipping Friday", () => {
    expect(workingDaysBetween("2026-06-11", "2026-06-11")).toBe(0);
    expect(workingDaysBetween("2026-06-11", "2026-06-13")).toBe(1); // Fri off, Sat counts
    expect(workingDaysBetween("2026-06-11", "2026-06-18")).toBe(6);
  });

  it("uses the chamber's open days when it has a schedule", () => {
    const days = chamberWorkdays([{ days: ["sun", "tue", "thu"], from: "09:00", to: "10:00" }, { label: "অপারেশন", days: ["wed"] }]);
    expect(days).toEqual(["sun", "tue", "thu"]);
    expect(chamberWorkdays([])).toEqual(["sat", "sun", "mon", "tue", "wed", "thu"]);
    // Thu → next Thu: Sun, Tue, Thu = 3 chamber days.
    expect(workingDaysBetween("2026-06-11", "2026-06-18", days)).toBe(3);
  });

  it("decides whether a report visit is free", () => {
    expect(inFreeReportWindow("2026-06-11", "2026-06-18", 5)).toBe(false); // 6 working days
    expect(inFreeReportWindow("2026-06-11", "2026-06-17", 5)).toBe(true);
    expect(inFreeReportWindow("2026-06-11", "2026-06-11", 5)).toBe(false); // same day is the consultation itself
    expect(inFreeReportWindow(null, "2026-06-17", 5)).toBe(false);
    expect(inFreeReportWindow("2026-06-11", "2026-06-12", 0)).toBe(false);
  });

  it("writes the policy line", () => {
    expect(freeReportPolicyText(5, "bn", "bn")).toBe("পরামর্শের ৫ কর্মদিবসের মধ্যে রিপোর্ট দেখাতে সিরিয়াল বা ভিজিট লাগবে না।");
  });
});
