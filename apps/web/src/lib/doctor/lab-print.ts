"use client";

import { labReportDepartment, printAge, renderLabReportHtml, type LabCatalogue, type LabProfileHeader, type LabResult, type LabSignatory, type Sex } from "@rx/core";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { parseJson, today } from "./util";

interface LabReportRow {
  panel: string; title: string; department: string | null; specimen: string | null; results: string | null; comment: string | null; conclusion: string | null;
  lab_no: string | null; referred_by: string | null; collected_at: string | null; report_date: string; prepared_by_name: string | null;
  verified_by_name: string | null; verified_at: string | null; patient_id: string;
}

/** Until the server numbers a request, it prints with this reference instead. */
export const provisionalLabRef = (requestId: string) => `Ref ${requestId.slice(0, 8).toUpperCase()}`;

/** A clinic lab request's printed report, built entirely from the local database (works offline). */
export async function buildLabPrintHtml(
  db: AbstractPowerSyncDatabase,
  requestId: string,
  opts: { cat: LabCatalogue; userName: string },
): Promise<{ html: string; labNo: string | null; verified: boolean } | null> {
  const rows = await db.getAll<LabReportRow>(
    `SELECT panel, title, department, specimen, results, comment, conclusion, lab_no, referred_by, collected_at, report_date,
            prepared_by_name, verified_by_name, verified_at, patient_id
       FROM lab_report WHERE request_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    [requestId],
  );
  const first = rows[0];
  if (!first) return null;
  const [patient, profile, chamber] = await Promise.all([
    db.getOptional<{ name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null }>(
      `SELECT name, dob, sex, mobile, code FROM patient WHERE id = ?`, [first.patient_id]),
    db.getOptional<{ lab_name: string | null; address: string | null; phone: string | null; logo_data_url: string | null; signatories: string | null; footer_text: string | null }>(
      `SELECT lab_name, address, phone, logo_data_url, signatories, footer_text FROM lab_profile LIMIT 1`),
    db.getOptional<{ name: string; address: string; phone: string | null; logo_data_url: string | null }>(
      `SELECT name, address, phone, logo_data_url FROM chamber WHERE is_active = 1 OR is_active IS NULL ORDER BY created_at LIMIT 1`),
  ]);
  const header: LabProfileHeader = {
    labName: profile?.lab_name || chamber?.name || "",
    address: profile?.address || chamber?.address || undefined,
    phone: profile?.phone || chamber?.phone || undefined,
    logoDataUrl: profile?.logo_data_url || chamber?.logo_data_url || undefined,
    signatories: parseJson<LabSignatory[]>(profile?.signatories, []),
    footerText: profile?.footer_text || undefined,
  };
  const labNo = rows.find((r) => r.lab_no)?.lab_no ?? null;
  const verifiedBy = rows.find((r) => r.verified_at)?.verified_by_name ?? null;
  const verified = !!verifiedBy || rows.some((r) => r.verified_at);
  const reportDate = rows.map((r) => r.report_date).sort().pop() ?? today();
  const origin = window.location.origin;
  const notes = [
    !labNo ? "The Lab No is given when this report reaches the server." : null,
    !verified ? "DRAFT — not verified for release." : null,
  ].filter(Boolean);
  const html = renderLabReportHtml({
    profile: header,
    patient: {
      name: patient?.name ?? "", sex: (patient?.sex as Sex) ?? undefined, mobile: patient?.mobile ?? undefined, patientCode: patient?.code ?? undefined,
      ...printAge(patient?.dob, reportDate),
    },
    labNo: labNo ?? provisionalLabRef(requestId),
    labNoPending: !labNo,
    referredBy: first.referred_by,
    preparedBy: rows.find((r) => r.prepared_by_name)?.prepared_by_name ?? opts.userName,
    verifiedBy: verifiedBy,
    reportDate,
    collectedAt: first.collected_at,
    reports: rows.map((r) => ({
      title: r.title, department: labReportDepartment(r.panel, r.department, opts.cat), specimen: r.specimen, layout: opts.cat.panelById[r.panel]?.layout,
      results: parseJson<LabResult[]>(r.results, []), comment: r.comment, conclusion: r.conclusion,
    })),
    fonts: { bengali: `${origin}/fonts/NotoSansBengali.ttf`, latin: `${origin}/fonts/NotoSans.ttf` },
    catalogue: opts.cat,
    footerNote: notes.length ? notes.join(" ") : undefined,
  });
  return { html, labNo, verified };
}
