import { code39Encodable, code39Svg } from "./barcode";
import { formatDateDmy } from "./dates";
import { DEFAULT_LAB_CATALOGUE, LAB_DEPARTMENTS, labCultureText, type LabCatalogue, type LabDepartment, type LabResult, type LabTest } from "./lab-tests";
import { escapeHtml as esc } from "./print";
import { safeImageDataUrl } from "./sanitize";
import type { PatientInfo } from "./types";

/** How a clinic's lab reports are headed and signed (lab_profile, falling back to the chamber). */
export interface LabProfileHeader {
  labName?: string;
  address?: string;
  phone?: string;
  logoDataUrl?: string;
  signatories?: LabSignatory[];
  footerText?: string;
}

export interface LabSignatory {
  name: string;
  degrees?: string;
  title?: string;
}

/** One panel's report as printed. */
export interface LabPrintReport {
  title: string;
  department?: string | null;
  specimen?: string | null;
  layout?: "table" | "culture";
  results: LabResult[];
  conclusion?: string | null;
  comment?: string | null;
}

export interface LabPrintInput {
  profile: LabProfileHeader;
  patient: PatientInfo;
  /** The Lab No, or a provisional reference until the server assigns it (labNoPending: printed without a barcode). */
  labNo?: string;
  labNoPending?: boolean;
  referredBy?: string | null;
  preparedBy?: string | null;
  /** YYYY-MM-DD. */
  reportDate: string;
  /** ISO timestamp. */
  collectedAt?: string | null;
  reports: LabPrintReport[];
  fonts: { bengali: string; latin: string };
  catalogue?: LabCatalogue;
  /** Printed under the signatures (e.g. "Lab No pending"). */
  footerNote?: string;
}

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const perCmm = (test: LabTest | undefined, r: LabResult) => test?.printAs === "per_cmm" && /10³/.test(r.unit);

/** A result's value, unit and reference range as a lab report prints them (counts per cmm, fixed decimals). */
export function labPrintCells(r: LabResult, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): { value: string; unit: string; ref: string } {
  const test = cat.byCode[r.code];
  const ref = r.ref ?? "";
  if (r.culture) return { value: labCultureText(r.culture), unit: "", ref };
  if (perCmm(test, r)) {
    return {
      value: r.text ?? (r.value !== undefined ? thousands(r.value * 1000) : ""),
      unit: "/cumm",
      ref: ref.replace(/\d+(?:\.\d+)?/g, (n) => thousands(Number(n) * 1000)),
    };
  }
  const value = r.text ?? (r.value === undefined ? "" : test?.decimals !== undefined ? r.value.toFixed(test.decimals) : String(Math.round(r.value * 1000) / 1000));
  return { value, unit: r.unit, ref };
}

const SIR = { S: "Sensitive", I: "Intermediate", R: "Resistant" } as const;

function cultureBlock(r: LabResult): string {
  const c = r.culture!;
  if (!c.growth || !c.organisms.length) return `<p class="growth"><b>No growth</b></p>`;
  return c.organisms
    .map((o) => `<div class="organism">
      <p><b>Organism isolated:</b> <i>${esc(o.name)}</i>${o.count ? ` &nbsp; <b>Colony count:</b> ${esc(o.count)}` : ""}</p>
      ${o.sensitivity.length
        ? `<table class="sir"><thead><tr><th>Antibiotic</th><th>Interpretation</th><th>Zone (mm)</th></tr></thead><tbody>${o.sensitivity
            .map((s) => `<tr class="sir-${s.sir}"><td>${esc(s.drug)}</td><td>${SIR[s.sir]}</td><td>${esc(s.zone ?? "")}</td></tr>`)
            .join("")}</tbody></table>`
        : ""}
    </div>`)
    .join("");
}

function reportBlock(rep: LabPrintReport, cat: LabCatalogue): string {
  const cultures = rep.results.filter((r) => r.culture);
  const rows = rep.results.filter((r) => !r.culture);
  let lastSection: string | undefined;
  const body = rows
    .map((r) => {
      const { value, unit, ref } = labPrintCells(r, cat);
      const test = cat.byCode[r.code];
      const heading = r.section && r.section !== lastSection ? `<tr class="sec"><td colspan="4">${esc(r.section)}</td></tr>` : "";
      lastSection = r.section;
      const flag = r.flag === "H" || r.flag === "L" ? ` <span class="flag">${r.flag}</span>` : "";
      const method = test?.method ? ` <span class="method">(${esc(test.method)})</span>` : "";
      return `${heading}<tr${r.flag ? ' class="abn"' : ""}><td>${esc(r.name ?? test?.short ?? r.code)}${method}</td><td class="val">${esc(value)}${flag}</td><td>${esc(unit)}</td><td>${esc(ref)}</td></tr>`;
    })
    .join("");
  const table = rows.length
    ? `<table class="results"><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th></tr></thead><tbody>${body}</tbody></table>`
    : "";
  const notes = [rep.conclusion, rep.comment].filter((x): x is string => Boolean(x?.trim()));
  return `<section class="report">
    <h3>${esc(rep.title)}${rep.specimen ? ` <span class="specimen">Specimen: ${esc(rep.specimen)}</span>` : ""}</h3>
    ${table}${cultures.map(cultureBlock).join("")}
    ${notes.map((n) => `<p class="comment"><b>Comment:</b> ${esc(n)}</p>`).join("")}
  </section>`;
}

const ageSex = (p: PatientInfo) =>
  [[p.ageYears, "Y"], [p.ageMonths, "M"], [p.ageDays, "D"]].filter(([n]) => n).map(([n, u]) => `${n} ${u}`).join(" ") +
  (p.sex ? ` / ${p.sex[0]!.toUpperCase()}${p.sex.slice(1)}` : "");

const time = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDateDmy(d.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }), "en", "/")} ${d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })}`;
};

/**
 * A clinic lab's report, as Bangladeshi diagnostic centres print it: the lab's header, the patient and sample, then
 * one page per department with Test | Result | Unit | Reference range (abnormal values bold and flagged H/L),
 * culture results with their sensitivity table, and the signatures. Used by the browser print and the server PDF.
 */
export function renderLabReportHtml(input: LabPrintInput): string {
  const cat = input.catalogue ?? DEFAULT_LAB_CATALOGUE;
  const { profile, patient } = input;
  const logo = safeImageDataUrl(profile.logoDataUrl);
  const order = (d: string | null | undefined) => {
    const i = LAB_DEPARTMENTS.findIndex((x) => x.id === d);
    return i < 0 ? LAB_DEPARTMENTS.length : i;
  };
  const departments = [...new Set(input.reports.map((r) => r.department ?? ""))].sort((a, b) => order(a) - order(b));
  const barcode = input.labNo && !input.labNoPending && code39Encodable(input.labNo) ? code39Svg(input.labNo, { heightMm: 7 }) : null;

  const header = `<header>
    ${logo ? `<div class="logo"><img src="${esc(logo)}" alt=""></div>` : ""}
    <div class="lab">
      <div class="lab-name">${esc(profile.labName ?? "")}</div>
      ${profile.address ? `<div>${esc(profile.address)}</div>` : ""}
      ${profile.phone ? `<div>Phone: ${esc(profile.phone)}</div>` : ""}
    </div>
  </header>`;

  const patientBlock = `<table class="patient">
    <tr><td><b>Lab No:</b> ${esc(input.labNo ?? "")}</td><td><b>Patient ID:</b> ${esc(patient.patientCode ?? "")}</td><td rowspan="3" class="barcode">${barcode ?? ""}</td></tr>
    <tr><td><b>Name:</b> ${esc(patient.name)}</td><td><b>Age/Sex:</b> ${esc(ageSex(patient))}</td></tr>
    <tr><td><b>Referred by:</b> ${esc(input.referredBy ?? "Self")}</td><td>${patient.mobile ? `<b>Mobile:</b> ${esc(patient.mobile)}` : ""}</td></tr>
    <tr><td><b>Collected:</b> ${esc(input.collectedAt ? time(input.collectedAt) : "")}</td><td colspan="2"><b>Reported:</b> ${esc(formatDateDmy(input.reportDate, "en", "/"))}</td></tr>
  </table>`;

  const signatories = profile.signatories ?? [];
  const signs = `<div class="signs">
    <div class="sign"><div class="line">Prepared by</div><div><b>${esc(input.preparedBy ?? "")}</b></div></div>
    ${signatories
      .map((s) => `<div class="sign"><div class="line"><b>${esc(s.name)}</b></div>${s.degrees ? `<div>${esc(s.degrees)}</div>` : ""}${s.title ? `<div>${esc(s.title)}</div>` : ""}</div>`)
      .join("")}
  </div>`;

  const pages = departments
    .map((d) => {
      const name = LAB_DEPARTMENTS.find((x) => x.id === d)?.name ?? "Laboratory report";
      const reports = input.reports.filter((r) => (r.department ?? "") === d);
      return `<div class="sheet" data-department="${esc(d)}">
        ${header}
        <h2>${esc(name)} report</h2>
        ${patientBlock}
        <div class="body">${reports.map((r) => reportBlock(r, cat)).join("")}</div>
        <div class="end">— End of report —</div>
        ${signs}
        ${input.footerNote ? `<div class="footnote">${esc(input.footerNote)}</div>` : ""}
        ${profile.footerText ? `<footer>${esc(profile.footerText)}</footer>` : ""}
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lab report — ${esc(patient.name)}</title>
<style>
@font-face { font-family: "RxBengali"; src: url("${input.fonts.bengali}") format("truetype"); font-weight: 100 900; }
@font-face { font-family: "RxLatin"; src: url("${input.fonts.latin}") format("truetype"); font-weight: 100 900; }
@page { size: 210mm 297mm; margin: 12mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: "RxLatin", "RxBengali", sans-serif; font-size: 10pt; line-height: 1.35; }
.sheet { min-height: 272mm; display: flex; flex-direction: column; break-after: page; }
.sheet:last-child { break-after: auto; }
header { display: flex; align-items: center; gap: 4mm; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; }
header .logo img { max-height: 18mm; max-width: 30mm; }
header .lab { flex: 1; text-align: center; }
header .lab-name { font-size: 1.6em; font-weight: 700; }
h2 { text-align: center; font-size: 1.1em; text-transform: uppercase; letter-spacing: 0.5pt; margin: 2.5mm 0 2mm; }
table { border-collapse: collapse; width: 100%; }
.patient { border: 0.75pt solid #000; margin-bottom: 3mm; }
.patient td { padding: 0.8mm 2mm; vertical-align: top; }
.patient .barcode { text-align: right; width: 45mm; }
.patient .barcode svg { width: 42mm; height: auto; }
.body { flex: 1; }
.report { margin-bottom: 4mm; break-inside: avoid; }
.report h3 { font-size: 1em; margin: 0 0 1mm; text-decoration: underline; }
.report h3 .specimen { font-weight: 400; font-size: 0.9em; text-decoration: none; margin-left: 3mm; }
.results th, .sir th { text-align: left; border-bottom: 0.75pt solid #000; padding: 0.8mm 1.5mm; font-size: 0.9em; }
.results td, .sir td { padding: 0.6mm 1.5mm; vertical-align: top; }
.results td:first-child { width: 38%; }
.results tr.sec td { font-weight: 700; padding-top: 1.8mm; font-size: 0.9em; text-transform: uppercase; }
.results tr.abn td.val { font-weight: 700; }
.results .flag { font-weight: 700; margin-left: 1mm; }
.results .method { font-size: 0.85em; color: #333; }
.organism p { margin: 0 0 1mm; }
.sir { width: auto; min-width: 110mm; margin-bottom: 2mm; }
.sir tr.sir-R td { font-weight: 700; }
.comment { margin: 1.5mm 0 0; }
.end { text-align: center; font-size: 0.85em; margin: 3mm 0; }
.signs { display: flex; justify-content: space-between; gap: 6mm; margin-top: 10mm; break-inside: avoid; }
.sign { text-align: center; min-width: 40mm; font-size: 0.9em; }
.sign .line { border-top: 0.75pt solid #000; padding-top: 1mm; }
.footnote { font-size: 0.8em; text-align: center; margin-top: 2mm; }
footer { border-top: 0.75pt solid #000; margin-top: 2mm; padding-top: 1mm; text-align: center; font-size: 0.85em; }
@media screen {
  body { background: #e5e7eb; }
  .sheet { width: 210mm; min-height: 297mm; margin: 8mm auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.2); padding: 12mm 14mm; }
}
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/** The department a report prints under: its own, else its panel's. */
export function labReportDepartment(panel: string, department: string | null | undefined, cat: LabCatalogue = DEFAULT_LAB_CATALOGUE): LabDepartment | "" {
  const d = department ?? cat.panelById[panel]?.department;
  return LAB_DEPARTMENTS.some((x) => x.id === d) ? (d as LabDepartment) : "";
}
