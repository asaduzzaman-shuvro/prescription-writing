import "server-only";
import {
  buildLabCatalogue,
  DEFAULT_PRINT_SETTINGS,
  labLine,
  labReportDepartment,
  printAge,
  renderLabReportHtml,
  prescriptionFileName,
  renderPrescriptionHtml,
  type ChamberHeader,
  type ChamberSlot,
  type LabResult,
  type LabSignatory,
  type PrescriptionDoc,
  type PrintSettings,
  type Sex,
} from "@rx/core";
import { s, withTenant } from "@rx/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import QRCode from "qrcode";
import { appDb } from "./db";

const g = globalThis as unknown as { __rxBrowser?: Promise<Browser> };

/** Playwright's bundled Chromium, then the machine's Chrome or Edge. A failed launch is not cached. */
async function browser(): Promise<Browser> {
  if (g.__rxBrowser) {
    try {
      return await g.__rxBrowser;
    } catch {
      g.__rxBrowser = undefined;
    }
  }
  const launched = (async () => {
    try {
      return await chromium.launch();
    } catch {
      for (const channel of ["chrome", "msedge"] as const) {
        try {
          return await chromium.launch({ channel });
        } catch {
          /* try the next installed browser */
        }
      }
      throw new Error("Could not start a browser for PDF. Install Chrome, or run: pnpm exec playwright install chromium");
    }
  })();
  g.__rxBrowser = launched;
  try {
    return await launched;
  } catch (err) {
    if (g.__rxBrowser === launched) g.__rxBrowser = undefined;
    throw err;
  }
}

let fontCache: { bengali: string; latin: string } | null = null;
function fonts() {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), "public/fonts");
  const data = (f: string) => `data:font/ttf;base64,${readFileSync(join(dir, f)).toString("base64")}`;
  fontCache = { bengali: data("NotoSansBengali.ttf"), latin: data("NotoSans.ttf") };
  return fontCache;
}

/** Server-side render of a prescription to PDF (same renderer as the browser print). */
export async function prescriptionPdf(
  ctx: { tenantId: string; userId: string },
  prescriptionId: string,
): Promise<{ pdf: Buffer; filename: string } | null> {
  const data = await withTenant(appDb, ctx, async (tx) => {
    const [rx] = await tx.select().from(s.prescription).where(eq(s.prescription.id, prescriptionId));
    if (!rx) return null;
    const [patient] = await tx.select().from(s.patient).where(eq(s.patient.id, rx.patientId));
    const [doctor] = await tx.select().from(s.doctorProfile).where(eq(s.doctorProfile.userId, rx.doctorUserId));
    const [chamber] = rx.chamberId ? await tx.select().from(s.chamber).where(eq(s.chamber.id, rx.chamberId)) : [];
    const [enc] = await tx.select().from(s.encounter).where(eq(s.encounter.id, rx.encounterId));
    const chambers = await tx
      .select()
      .from(s.chamber)
      .where(and(eq(s.chamber.isActive, true), or(eq(s.chamber.doctorUserId, rx.doctorUserId), isNull(s.chamber.doctorUserId))))
      .orderBy(asc(s.chamber.name));
    const labs = rx.status === "final"
      ? []
      : await tx.select().from(s.labReport)
          .where(and(eq(s.labReport.encounterId, rx.encounterId), isNull(s.labReport.deletedAt)))
          .orderBy(asc(s.labReport.reportDate), asc(s.labReport.createdAt));
    return { rx, patient, doctor, chamber, enc, chambers, labs };
  });
  if (!data?.patient || !data.doctor) return null;
  const { rx, patient, doctor, chamber, enc, chambers, labs } = data;
  const header = (c: typeof chamber | undefined): ChamberHeader => ({
    name: c?.name ?? "", address: c?.address ?? "", phone: c?.phone ?? undefined, hours: c?.hours ?? undefined,
    schedule: (c?.schedule as ChamberSlot[] | undefined) ?? [], serialPhone: c?.serialPhone ?? undefined,
    footerText: c?.footerText ?? undefined, logoDataUrl: c?.logoDataUrl ?? undefined,
  });
  const doc = rx.doc as PrescriptionDoc;
  if (rx.status !== "final" && enc) doc.vitals = (enc.vitals as PrescriptionDoc["vitals"]) ?? doc.vitals;
  // Drafts print the visit's live lab reports (finalised ones keep their snapshot), as the browser print does.
  if (rx.status !== "final") {
    doc.labFindings = labs
      .map((r) => labLine({ panel: r.panel, title: r.title, reportDate: r.reportDate, results: r.results as LabResult[], conclusion: r.conclusion ?? undefined }, { onlyPrinted: true }))
      .filter((l): l is NonNullable<typeof l> => l !== null);
  }
  const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS, ...((chamber?.printSettings as Partial<PrintSettings>) ?? {}) };
  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const verifyUrl = rx.verifyToken ? `${base}/v/${rx.verifyToken}` : null;
  const date = rx.finalizedAt ? rx.finalizedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }) : (enc?.visitDate ?? rx.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }));
  const html = renderPrescriptionHtml({
    doc,
    patient: {
      name: patient.name, sex: (patient.sex as Sex) ?? undefined, mobile: patient.mobile ?? undefined, patientCode: patient.code ?? undefined,
      address: patient.address ?? undefined, ...printAge(patient.dob, date),
      birthWeightKg: patient.birthWeightKg ?? undefined, gestationalAgeWeeks: patient.gestationalAgeWeeks ?? undefined,
    },
    doctor: {
      nameEn: doctor.nameEn, nameBn: doctor.nameBn ?? undefined, degreesEn: doctor.degreesEn, degreesBn: doctor.degreesBn,
      designation: doctor.designation ?? undefined, institution: doctor.institution ?? undefined, specialty: doctor.specialtyLabel ?? undefined, bmdcNumber: doctor.bmdcNumber,
    },
    chamber: header(chamber),
    // The prescription's own chamber first, as in the browser print.
    chambers: [...chambers.filter((c) => c.id === chamber?.id), ...chambers.filter((c) => c.id !== chamber?.id)].map(header),
    date,
    settings,
    qrSvg: verifyUrl ? await QRCode.toString(verifyUrl, { type: "svg", margin: 0 }) : undefined,
    signatureDataUrl: doctor.signatureDataUrl ?? undefined,
    fonts: fonts(),
    footerNote: verifyUrl ? `Verify: ${verifyUrl.replace(/^https?:\/\//, "")}` : "DRAFT — not valid",
  });
  return {
    pdf: await htmlToPdf(html),
    filename: prescriptionFileName({ name: patient.name, mobile: patient.mobile, id: patient.code, date }),
  };
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const page = await (await browser()).newPage({ javaScriptEnabled: false });
  try {
    // Everything (fonts, QR, signature) is inline; block all network so injected markup can't call out.
    await page.route("**/*", (r) => r.abort());
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForLoadState("load");
    return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  } finally {
    await page.close();
  }
}

/** Server-side render of a clinic lab request to PDF (same renderer as the browser print). */
export async function labReportPdf(ctx: { tenantId: string; userId: string }, requestId: string): Promise<Buffer | null> {
  const data = await withTenant(appDb, ctx, async (tx) => {
    const rows = await tx.select().from(s.labReport)
      .where(and(eq(s.labReport.requestId, requestId), isNull(s.labReport.deletedAt)))
      .orderBy(asc(s.labReport.createdAt));
    if (!rows[0]) return null;
    const [patient] = await tx.select().from(s.patient).where(eq(s.patient.id, rows[0].patientId));
    const [profile] = await tx.select().from(s.labProfile);
    const [chamber] = await tx.select().from(s.chamber).where(eq(s.chamber.isActive, true)).orderBy(asc(s.chamber.createdAt)).limit(1);
    // The platform's catalogue and this clinic's changes (RLS shows no other clinic's).
    const tests = await tx.select().from(s.labTest);
    const panels = await tx.select().from(s.labPanel);
    return { rows, patient, profile, chamber, tests, panels };
  });
  if (!data?.patient) return null;
  const { rows, patient, profile, chamber } = data;
  const cat = buildLabCatalogue({ tests: data.tests, panels: data.panels });
  const labNo = rows.find((r) => r.labNo)?.labNo ?? null;
  const reportDate = rows.map((r) => r.reportDate).sort().pop()!;
  const html = renderLabReportHtml({
    profile: {
      labName: profile?.labName || chamber?.name || "", address: profile?.address || chamber?.address || undefined, phone: profile?.phone || chamber?.phone || undefined,
      logoDataUrl: profile?.logoDataUrl || chamber?.logoDataUrl || undefined, signatories: (profile?.signatories as LabSignatory[] | undefined) ?? [],
      footerText: profile?.footerText || undefined,
    },
    patient: { name: patient.name, sex: (patient.sex as Sex) ?? undefined, mobile: patient.mobile ?? undefined, patientCode: patient.code ?? undefined, ...printAge(patient.dob, reportDate) },
    labNo: labNo ?? `Ref ${requestId.slice(0, 8).toUpperCase()}`,
    labNoPending: !labNo,
    referredBy: rows[0]!.referredBy,
    preparedBy: rows.find((r) => r.preparedByName)?.preparedByName ?? null,
    verifiedBy: rows.find((r) => r.verifiedAt)?.verifiedByName ?? null,
    reportDate,
    collectedAt: rows[0]!.collectedAt?.toISOString() ?? null,
    reports: rows.map((r) => ({
      title: r.title, department: labReportDepartment(r.panel, r.department, cat), specimen: r.specimen, layout: cat.panelById[r.panel]?.layout,
      results: r.results as LabResult[], comment: r.comment, conclusion: r.conclusion,
    })),
    fonts: fonts(),
    catalogue: cat,
    footerNote: rows.some((r) => r.verifiedAt) ? undefined : "DRAFT — not verified for release.",
  });
  return htmlToPdf(html);
}
