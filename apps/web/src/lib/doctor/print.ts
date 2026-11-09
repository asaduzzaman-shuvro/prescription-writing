"use client";

import { printAge, renderPrescriptionHtml, type ChamberHeader, type ChamberSlot, type PatientInfo, type PrescriptionDoc, type PrintSettings, type Sex } from "@rx/core";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import QRCode from "qrcode";
import { labFindingsOf, printSettingsOf } from "./data";
import { parseJson } from "./util";

/** Timestamps are stored in UTC; print the doctor's local calendar date. */
function localDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ChamberDbRow {
  name: string; address: string; room: string | null; phone: string | null; hours: string | null; schedule: string | null;
  serial_phone: string | null; footer_text: string | null; logo_data_url: string | null; print_settings: string | null;
}

function chamberHeader(c: ChamberDbRow | null): ChamberHeader {
  return {
    name: c?.name ?? "", address: c?.address ?? "", room: c?.room ?? undefined, phone: c?.phone ?? undefined, hours: c?.hours ?? undefined,
    schedule: parseJson<ChamberSlot[]>(c?.schedule, []), serialPhone: c?.serial_phone ?? undefined,
    footerText: c?.footer_text ?? undefined, logoDataUrl: c?.logo_data_url ?? undefined,
  };
}

export interface PrintBundle {
  html: string;
  settings: PrintSettings;
  chamberId: string | null;
  status: string;
  verifyUrl: string | null;
}

/** Build the print HTML entirely from the local database (works offline). */
export async function buildPrintHtml(
  db: AbstractPowerSyncDatabase,
  prescriptionId: string,
  /**
   * `pages`: how many pages the last render measured at (see `PrintView`); 2+ numbers them and pins the footer.
   * `fit`: the fit-to-one-page level the search is at (`FIT_LEVELS`).
   */
  opts: { publicBaseUrl: string; settingsOverride?: PrintSettings; pages?: number; fit?: number },
): Promise<PrintBundle | null> {
  const rx = await db.getOptional<{
    doc: string; status: string; verify_token: string | null; finalized_at: string | null; created_at: string;
    patient_id: string; doctor_user_id: string; chamber_id: string | null; encounter_id: string;
  }>(`SELECT doc, status, verify_token, finalized_at, created_at, patient_id, doctor_user_id, chamber_id, encounter_id FROM prescription WHERE id = ?`, [prescriptionId]);
  if (!rx) return null;
  const [patient, doctor, chamber, enc, chambers] = await Promise.all([
    db.getOptional<{ name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null; address: string | null; birth_weight_kg: number | null; gestational_age_weeks: number | null }>(
      `SELECT name, dob, sex, mobile, code, address, birth_weight_kg, gestational_age_weeks FROM patient WHERE id = ?`, [rx.patient_id]),
    db.getOptional<{ name_en: string; name_bn: string | null; degrees_en: string | null; degrees_bn: string | null; designation: string | null; institution: string | null; specialty_label: string | null; bmdc_number: string; signature_data_url: string | null }>(
      `SELECT name_en, name_bn, degrees_en, degrees_bn, designation, institution, specialty_label, bmdc_number, signature_data_url FROM doctor_profile WHERE id = ?`, [rx.doctor_user_id]),
    rx.chamber_id
      ? db.getOptional<ChamberDbRow>(`SELECT * FROM chamber WHERE id = ?`, [rx.chamber_id])
      : Promise.resolve(null),
    db.getOptional<{ vitals: string | null; visit_date: string }>(`SELECT vitals, visit_date FROM encounter WHERE id = ?`, [rx.encounter_id]),
    db.getAll<ChamberDbRow & { id: string }>(
      `SELECT * FROM chamber WHERE (is_active = 1 OR is_active IS NULL) AND (doctor_user_id = ? OR doctor_user_id IS NULL) ORDER BY id = ? DESC, name`,
      [rx.doctor_user_id, rx.chamber_id],
    ),
  ]);
  const doc = parseJson<PrescriptionDoc>(rx.doc, { chiefComplaints: [], vitals: {}, investigations: [], diagnoses: [], items: [], advice: [] });
  // Drafts print the live encounter vitals; finalised prescriptions use their snapshot.
  if (rx.status !== "final") {
    doc.vitals = parseJson(enc?.vitals, doc.vitals);
    doc.labFindings = await labFindingsOf(db, rx.encounter_id);
  }
  const settings = opts.settingsOverride ?? printSettingsOf(chamber?.print_settings);
  const date = rx.finalized_at ? localDate(rx.finalized_at) : (enc?.visit_date ?? localDate(rx.created_at));
  const patientInfo: PatientInfo = {
    name: patient?.name ?? "",
    ...printAge(patient?.dob, date),
    sex: (patient?.sex as Sex) ?? undefined,
    mobile: patient?.mobile ?? undefined,
    patientCode: patient?.code ?? undefined,
    address: patient?.address ?? undefined,
    birthWeightKg: patient?.birth_weight_kg ?? undefined,
    gestationalAgeWeeks: patient?.gestational_age_weeks ?? undefined,
  };
  const verifyUrl = rx.verify_token ? `${opts.publicBaseUrl}/v/${rx.verify_token}` : null;
  const qrSvg = verifyUrl ? await QRCode.toString(verifyUrl, { type: "svg", margin: 0 }) : undefined;
  const origin = window.location.origin;
  const html = renderPrescriptionHtml({
    doc,
    patient: patientInfo,
    doctor: {
      nameEn: doctor?.name_en ?? "",
      nameBn: doctor?.name_bn ?? undefined,
      degreesEn: parseJson<string[]>(doctor?.degrees_en, []),
      degreesBn: parseJson<string[]>(doctor?.degrees_bn, []),
      designation: doctor?.designation ?? undefined,
      institution: doctor?.institution ?? undefined,
      specialty: doctor?.specialty_label ?? undefined,
      bmdcNumber: doctor?.bmdc_number ?? "",
    },
    chamber: chamberHeader(chamber),
    chambers: chambers.map(chamberHeader),
    date,
    settings,
    qrSvg,
    signatureDataUrl: doctor?.signature_data_url ?? undefined,
    fonts: { bengali: `${origin}/fonts/NotoSansBengali.ttf`, latin: `${origin}/fonts/NotoSans.ttf` },
    footerNote: !verifyUrl && rx.status !== "final" ? "DRAFT — not valid" : undefined,
    pages: opts.pages,
    fit: opts.fit,
  });
  return { html, settings, chamberId: rx.chamber_id, status: rx.status, verifyUrl };
}
