"use client";

/**
 * Local-database access for the doctor app. Reads and writes go to the browser SQLite managed by
 * PowerSync; writes are queued and uploaded to /api/sync/upload when online.
 */
import type { ChamberSlot, PrescriptionDoc, PrintSettings, RxItem, Vitals } from "@rx/core";
import { DEFAULT_PRINT_SETTINGS } from "@rx/core";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { nowIso, parseJson, randomToken, today, uuid } from "./util";

type Db = AbstractPowerSyncDatabase;

export interface MedicineHit {
  id: string;
  brand_name: string;
  strength_text: string | null;
  generic_text: string;
  form_name: string | null;
  form_label: string | null;
  default_route: string | null;
  default_unit: string | null;
  company_name: string | null;
  is_antibiotic: number;
  favorite_shortcut: string | null;
  is_favorite: number;
}

const MED_SELECT = `
  SELECT p.id, p.brand_name, p.strength_text, p.generic_text,
         f.name AS form_name, f.short_label AS form_label, f.default_route, f.default_unit,
         c.name AS company_name,
         EXISTS (SELECT 1 FROM product_ingredient pi JOIN generic g ON g.id = pi.generic_id
                  WHERE pi.product_id = p.id AND g.is_antibiotic = 1) AS is_antibiotic,
         fav.default_shortcut AS favorite_shortcut,
         CASE WHEN fav.id IS NULL THEN 0 ELSE 1 END AS is_favorite
    FROM brand_product p
    LEFT JOIN dosage_form f ON f.id = p.form_id
    LEFT JOIN company c ON c.id = p.company_id
    LEFT JOIN doctor_favorite fav ON fav.product_id = p.id AND fav.user_id = ?`;

/** Brand/generic prefix search on the synced catalogue; favourites first. Works offline. */
export async function searchMedicines(db: Db, userId: string, q: string, limit = 25): Promise<MedicineHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const prefix = `${term.replace(/[%_]/g, "")}%`;
  const word = `% ${term.replace(/[%_]/g, "")}%`;
  return db.getAll<MedicineHit>(
    `${MED_SELECT}
      WHERE p.brand_name LIKE ? OR p.generic_text LIKE ? OR p.generic_text LIKE ?
      ORDER BY is_favorite DESC,
               CASE WHEN p.brand_name LIKE ? THEN 0 ELSE 1 END,
               fav.use_count DESC, length(p.brand_name), p.brand_name, p.strength_text
      LIMIT ?`,
    [userId, prefix, prefix, word, prefix, limit],
  );
}

export async function favoriteMedicines(db: Db, userId: string, limit = 30): Promise<MedicineHit[]> {
  return db.getAll<MedicineHit>(`${MED_SELECT} WHERE fav.id IS NOT NULL ORDER BY fav.use_count DESC, p.brand_name LIMIT ?`, [userId, limit]);
}

export async function productGenericIds(db: Db, productId: string): Promise<string[]> {
  const rows = await db.getAll<{ generic_id: string }>(`SELECT generic_id FROM product_ingredient WHERE product_id = ? ORDER BY position`, [productId]);
  return rows.map((r) => r.generic_id);
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export interface PatientInput {
  name: string;
  dob: string | null;
  dobEstimated: boolean;
  sex: "male" | "female" | "other" | null;
  mobile: string;
  address: string;
  allergies: string[];
  guardianName: string;
  nid: string;
  brn: string;
  healthId: string;
  notes: string;
  consent: boolean;
  birthWeightKg: number | null;
  gestationalAgeWeeks: number | null;
}

export async function createPatient(db: Db, userId: string, tenantId: string, p: PatientInput): Promise<string> {
  const id = uuid();
  const now = nowIso();
  await db.execute(
    `INSERT INTO patient (id, tenant_id, name, dob, dob_estimated, sex, mobile, address, allergies, guardian_name, nid, brn, health_id,
                          notes, consent_at, birth_weight_kg, gestational_age_weeks, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, tenantId, p.name.trim(), p.dob, p.dobEstimated ? 1 : 0, p.sex, p.mobile || null, p.address || null,
      JSON.stringify(p.allergies), p.guardianName || null, p.nid || null, p.brn || null, p.healthId || null, p.notes || null,
      p.consent ? now : null, p.birthWeightKg, p.gestationalAgeWeeks, userId, now, now,
    ],
  );
  return id;
}

export async function updatePatient(db: Db, id: string, p: PatientInput) {
  await db.execute(
    `UPDATE patient SET name = ?, dob = ?, dob_estimated = ?, sex = ?, mobile = ?, address = ?, allergies = ?, guardian_name = ?,
            nid = ?, brn = ?, health_id = ?, notes = ?, consent_at = COALESCE(consent_at, ?), birth_weight_kg = ?, gestational_age_weeks = ?,
            updated_at = ? WHERE id = ?`,
    [
      p.name.trim(), p.dob, p.dobEstimated ? 1 : 0, p.sex, p.mobile || null, p.address || null, JSON.stringify(p.allergies),
      p.guardianName || null, p.nid || null, p.brn || null, p.healthId || null, p.notes || null, p.consent ? nowIso() : null,
      p.birthWeightKg, p.gestationalAgeWeeks, nowIso(), id,
    ],
  );
}

// ---------------------------------------------------------------------------
// Visits (encounters) and prescriptions
// ---------------------------------------------------------------------------

export function emptyDoc(): PrescriptionDoc {
  return { chiefComplaints: [], vitals: {}, investigations: [], diagnoses: [], items: [], advice: [], followUp: { kind: "none" } };
}

/** Start a visit: today's encounter with the next serial number (and a draft Rx when a doctor starts it). */
export async function startVisit(
  db: Db,
  opts: { tenantId: string; userId: string; patientId: string; doctorUserId: string; chamberId: string | null; specialtyCode: string; asDoctor: boolean },
): Promise<string> {
  const date = today();
  const existing = await db.getOptional<{ id: string }>(
    `SELECT id FROM encounter WHERE patient_id = ? AND visit_date = ? AND status IN ('waiting', 'in_progress') LIMIT 1`,
    [opts.patientId, date],
  );
  if (existing) {
    if (opts.asDoctor) await ensureDraft(db, existing.id, opts.userId);
    return existing.id;
  }
  const id = uuid();
  const now = nowIso();
  await db.writeTransaction(async (tx) => {
    const row = await tx.get<{ n: number }>(`SELECT COALESCE(MAX(serial_no), 0) + 1 AS n FROM encounter WHERE visit_date = ? AND doctor_user_id = ?`, [date, opts.doctorUserId]);
    // A patient seen before comes for a follow-up; the doctor can switch it to "report showing".
    const seen = await tx.getOptional<{ id: string }>(`SELECT id FROM encounter WHERE patient_id = ? AND status = 'done' LIMIT 1`, [opts.patientId]);
    await tx.execute(
      `INSERT INTO encounter (id, tenant_id, patient_id, doctor_user_id, chamber_id, visit_date, serial_no, status, specialty_code, visit_type,
                              vitals, exam_findings, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`,
      [id, opts.tenantId, opts.patientId, opts.doctorUserId, opts.chamberId, date, row.n, opts.asDoctor ? "in_progress" : "waiting", opts.specialtyCode,
        seen ? "followup" : "new", opts.userId, now, now],
    );
  });
  if (opts.asDoctor) await ensureDraft(db, id, opts.userId);
  return id;
}

/** The editable prescription for an encounter: the latest draft, created if missing. */
export async function ensureDraft(db: Db, encounterId: string, doctorUserId: string): Promise<string> {
  const draft = await db.getOptional<{ id: string }>(
    `SELECT id FROM prescription WHERE encounter_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1`,
    [encounterId],
  );
  if (draft) return draft.id;
  const final = await db.getOptional<{ id: string }>(`SELECT id FROM prescription WHERE encounter_id = ? AND status = 'final' LIMIT 1`, [encounterId]);
  if (final) return final.id;
  const enc = await db.get<{ tenant_id: string; patient_id: string; chamber_id: string | null }>(
    `SELECT tenant_id, patient_id, chamber_id FROM encounter WHERE id = ?`,
    [encounterId],
  );
  const id = uuid();
  const now = nowIso();
  await db.execute(
    `INSERT INTO prescription (id, tenant_id, encounter_id, patient_id, doctor_user_id, chamber_id, version, status, doc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?, ?)`,
    [id, enc.tenant_id, encounterId, enc.patient_id, doctorUserId, enc.chamber_id, JSON.stringify(emptyDoc()), now, now],
  );
  await db.execute(`UPDATE encounter SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'waiting'`, [now, encounterId]);
  return id;
}

export async function saveDraftDoc(db: Db, prescriptionId: string, doc: PrescriptionDoc) {
  await db.execute(`UPDATE prescription SET doc = ?, updated_at = ? WHERE id = ? AND status = 'draft'`, [JSON.stringify(doc), nowIso(), prescriptionId]);
}

export async function saveVitals(db: Db, encounterId: string, vitals: Vitals) {
  await db.execute(`UPDATE encounter SET vitals = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(vitals), nowIso(), encounterId]);
}

export async function saveExamFindings(db: Db, encounterId: string, findings: Record<string, unknown>, templateId: string | null) {
  await db.execute(`UPDATE encounter SET exam_findings = ?, template_id = ?, updated_at = ? WHERE id = ?`, [
    JSON.stringify(findings),
    templateId,
    nowIso(),
    encounterId,
  ]);
}

/** Lock the prescription: snapshot vitals into the doc, set a verification token, mark final. */
export async function finalizePrescription(db: Db, prescriptionId: string, doc: PrescriptionDoc, vitals: Vitals): Promise<void> {
  const now = nowIso();
  await db.writeTransaction(async (tx) => {
    // Visit No.: earlier encounters of this patient that ended in a prescription, plus this one.
    // Only earlier encounters count, so a new version of the same visit gets the same number.
    const visitNo = (
        await tx.get<{ n: number }>(
          `SELECT COUNT(DISTINCT e.id) + 1 AS n
             FROM prescription me JOIN encounter cur ON cur.id = me.encounter_id
             JOIN encounter e ON e.patient_id = cur.patient_id AND e.id <> cur.id
              AND (e.visit_date < cur.visit_date OR (e.visit_date = cur.visit_date AND e.created_at < cur.created_at))
             JOIN prescription p ON p.encounter_id = e.id AND p.status = 'final'
            WHERE me.id = ?`,
          [prescriptionId],
        )
      ).n;
    await tx.execute(
      `UPDATE prescription SET doc = ?, status = 'final', finalized_at = ?, verify_token = COALESCE(verify_token, ?), updated_at = ?
        WHERE id = ? AND status = 'draft'`,
      [JSON.stringify({ ...doc, vitals, visitNo }), now, randomToken(), now, prescriptionId],
    );
    const rx = await tx.get<{ encounter_id: string }>(`SELECT encounter_id FROM prescription WHERE id = ?`, [prescriptionId]);
    await tx.execute(`UPDATE encounter SET status = 'done', updated_at = ? WHERE id = ?`, [now, rx.encounter_id]);
  });
  for (const item of doc.items) if (item.productId) await bumpFavoriteUse(db, item);
}

/** The doctor is finished with this visit (Finalise already does this; going back to Today makes sure). */
export async function markVisitDone(db: Db, encounterId: string) {
  await db.execute(`UPDATE encounter SET status = 'done', updated_at = ? WHERE id = ? AND status <> 'done'`, [nowIso(), encounterId]);
}

/** A finalised prescription is never edited; "edit" creates version n+1 as a new draft. */
export async function newVersion(db: Db, prescriptionId: string): Promise<string> {
  // Editing can start from the visit or the print screen: reuse a draft that is already open for this visit.
  const open = await db.getOptional<{ id: string }>(
    `SELECT d.id FROM prescription d JOIN prescription me ON me.encounter_id = d.encounter_id
      WHERE me.id = ? AND d.status = 'draft' ORDER BY d.version DESC LIMIT 1`,
    [prescriptionId],
  );
  if (open) return open.id;
  const old = await db.get<{ tenant_id: string; encounter_id: string; patient_id: string; doctor_user_id: string; chamber_id: string | null; version: number; doc: string }>(
    `SELECT tenant_id, encounter_id, patient_id, doctor_user_id, chamber_id, version, doc FROM prescription WHERE id = ?`,
    [prescriptionId],
  );
  const id = uuid();
  const now = nowIso();
  await db.execute(
    `INSERT INTO prescription (id, tenant_id, encounter_id, patient_id, doctor_user_id, chamber_id, version, supersedes_id, status, doc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [id, old.tenant_id, old.encounter_id, old.patient_id, old.doctor_user_id, old.chamber_id, old.version + 1, prescriptionId, old.doc, now, now],
  );
  return id;
}

/** Latest finalised prescription of a patient (for "copy last Rx"). */
export async function lastFinalDoc(db: Db, patientId: string, excludeEncounterId?: string): Promise<PrescriptionDoc | null> {
  const row = await db.getOptional<{ doc: string }>(
    `SELECT doc FROM prescription WHERE patient_id = ? AND status = 'final' AND encounter_id IS NOT ? ORDER BY finalized_at DESC LIMIT 1`,
    [patientId, excludeEncounterId ?? null],
  );
  return row ? parseJson<PrescriptionDoc | null>(row.doc, null) : null;
}

// ---------------------------------------------------------------------------
// Favourites and templates
// ---------------------------------------------------------------------------

export async function toggleFavorite(db: Db, tenantId: string, userId: string, productId: string, shortcut: string | null) {
  const fav = await db.getOptional<{ id: string }>(`SELECT id FROM doctor_favorite WHERE user_id = ? AND product_id = ?`, [userId, productId]);
  if (fav) {
    await db.execute(`DELETE FROM doctor_favorite WHERE id = ?`, [fav.id]);
    return false;
  }
  const now = nowIso();
  await db.execute(
    `INSERT INTO doctor_favorite (id, tenant_id, user_id, product_id, default_shortcut, use_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [uuid(), tenantId, userId, productId, shortcut, now, now],
  );
  return true;
}

async function bumpFavoriteUse(db: Db, item: RxItem) {
  await db.execute(`UPDATE doctor_favorite SET use_count = use_count + 1, updated_at = ? WHERE product_id = ?`, [nowIso(), item.productId]);
}

export type TemplatePayload = Partial<Pick<PrescriptionDoc, "chiefComplaints" | "investigations" | "diagnoses" | "items" | "advice" | "followUp">>;

export async function saveTemplate(db: Db, tenantId: string, userId: string, name: string, specialtyCode: string | null, payload: TemplatePayload) {
  const now = nowIso();
  await db.execute(
    `INSERT INTO rx_template (id, tenant_id, owner_user_id, specialty_code, name, payload, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [uuid(), tenantId, userId, specialtyCode, name, JSON.stringify(payload), now, now],
  );
}

export async function deleteTemplate(db: Db, id: string) {
  await db.execute(`DELETE FROM rx_template WHERE id = ?`, [id]);
}

/** Merge a template into a doc without duplicating lines already present. */
export function applyTemplate(doc: PrescriptionDoc, t: TemplatePayload): PrescriptionDoc {
  const merge = (a: string[], b: string[] = []) => [...a, ...b.filter((x) => !a.includes(x))];
  const haveProducts = new Set(doc.items.map((i) => i.productId ?? i.brandName));
  return {
    ...doc,
    chiefComplaints: merge(doc.chiefComplaints, t.chiefComplaints),
    investigations: merge(doc.investigations, t.investigations),
    diagnoses: merge(doc.diagnoses, t.diagnoses),
    advice: merge(doc.advice, t.advice),
    items: [...doc.items, ...(t.items ?? []).filter((i) => !haveProducts.has(i.productId ?? i.brandName)).map((i) => ({ ...i, id: uuid() }))],
    followUp: doc.followUp && doc.followUp.kind !== "none" ? doc.followUp : (t.followUp ?? doc.followUp),
  };
}

// ---------------------------------------------------------------------------
// Chamber print settings
// ---------------------------------------------------------------------------

export function printSettingsOf(json: string | null | undefined): PrintSettings {
  return { ...DEFAULT_PRINT_SETTINGS, ...parseJson<Partial<PrintSettings>>(json, {}) };
}

export async function savePrintSettings(db: Db, chamberId: string, settings: PrintSettings) {
  await db.execute(`UPDATE chamber SET print_settings = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(settings), nowIso(), chamberId]);
}

export interface ChamberInput {
  name: string;
  address: string;
  phone: string;
  serialPhone: string;
  schedule: ChamberSlot[];
  footerText: string;
  logoDataUrl: string | null;
  freeReportDays: number | null;
}

/** Create (no id) or update a chamber on this device; it syncs like any other local write. */
export async function saveChamber(db: Db, opts: { tenantId: string; doctorUserId: string | null; id?: string }, c: ChamberInput): Promise<string> {
  const now = nowIso();
  const vals = [
    c.name.trim(), c.address.trim(), c.phone.trim() || null, c.serialPhone.trim() || null, JSON.stringify(c.schedule), c.footerText.trim() || null,
    c.logoDataUrl, c.freeReportDays,
  ];
  if (opts.id) {
    await db.execute(
      `UPDATE chamber SET name = ?, address = ?, phone = ?, serial_phone = ?, schedule = ?, footer_text = ?, logo_data_url = ?, free_report_days = ?,
              updated_at = ? WHERE id = ?`,
      [...vals, now, opts.id],
    );
    return opts.id;
  }
  const id = uuid();
  await db.execute(
    `INSERT INTO chamber (id, tenant_id, doctor_user_id, name, address, phone, serial_phone, schedule, footer_text, logo_data_url, free_report_days,
                          print_settings, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, opts.tenantId, opts.doctorUserId, ...vals, JSON.stringify(DEFAULT_PRINT_SETTINGS), now, now],
  );
  return id;
}

export async function setChamberActive(db: Db, id: string, active: boolean) {
  await db.execute(`UPDATE chamber SET is_active = ?, updated_at = ? WHERE id = ?`, [active ? 1 : 0, nowIso(), id]);
}

export async function saveSignature(db: Db, userId: string, dataUrl: string | null) {
  await db.execute(`UPDATE doctor_profile SET signature_data_url = ? WHERE id = ?`, [dataUrl, userId]);
}

// ---------------------------------------------------------------------------
// Appointments (serial booking) and fees
// ---------------------------------------------------------------------------

export async function bookAppointment(
  db: Db,
  a: { tenantId: string; userId: string; doctorUserId: string; chamberId: string | null; name: string; mobile: string; date: string; note: string; patientId?: string | null; source?: string },
): Promise<number> {
  let serial = 0;
  await db.writeTransaction(async (tx) => {
    const row = await tx.get<{ n: number }>(
      `SELECT COALESCE(MAX(serial_no), 0) + 1 AS n FROM appointment WHERE appt_date = ? AND doctor_user_id = ? AND status <> 'cancelled'`,
      [a.date, a.doctorUserId],
    );
    serial = row.n;
    const now = nowIso();
    await tx.execute(
      `INSERT INTO appointment (id, tenant_id, chamber_id, doctor_user_id, patient_id, name, mobile, appt_date, serial_no, status, note, source, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?, ?, ?)`,
      [uuid(), a.tenantId, a.chamberId, a.doctorUserId, a.patientId ?? null, a.name.trim(), a.mobile || null, a.date, serial, a.note || null, a.source ?? "chamber", a.userId, now, now],
    );
  });
  return serial;
}

export async function setAppointmentStatus(db: Db, id: string, status: "booked" | "cancelled" | "no_show") {
  await db.execute(`UPDATE appointment SET status = ?, updated_at = ? WHERE id = ?`, [status, nowIso(), id]);
}

/** Check a booked patient in: link/creates the visit, keeping the booked serial number. */
export async function checkInAppointment(db: Db, apptId: string, patientId: string, opts: { userId: string; asDoctor: boolean; specialtyCode: string }): Promise<string> {
  const a = await db.get<{ tenant_id: string; doctor_user_id: string; chamber_id: string | null; serial_no: number }>(
    `SELECT tenant_id, doctor_user_id, chamber_id, serial_no FROM appointment WHERE id = ?`,
    [apptId],
  );
  const encId = await startVisit(db, {
    tenantId: a.tenant_id, userId: opts.userId, patientId, doctorUserId: a.doctor_user_id, chamberId: a.chamber_id, specialtyCode: opts.specialtyCode, asDoctor: opts.asDoctor,
  });
  const now = nowIso();
  await db.execute(`UPDATE encounter SET serial_no = ?, updated_at = ? WHERE id = ?`, [a.serial_no, now, encId]);
  await db.execute(`UPDATE appointment SET status = 'checked_in', patient_id = ?, encounter_id = ?, updated_at = ? WHERE id = ?`, [patientId, encId, now, apptId]);
  return encId;
}

export async function saveFee(db: Db, encounterId: string, fee: number | null) {
  await db.execute(`UPDATE encounter SET fee = ?, updated_at = ? WHERE id = ?`, [fee, nowIso(), encounterId]);
}

export type VisitType = "new" | "followup" | "report";

export async function saveVisitType(db: Db, encounterId: string, visitType: VisitType, fee?: number | null) {
  if (fee === undefined) await db.execute(`UPDATE encounter SET visit_type = ?, updated_at = ? WHERE id = ?`, [visitType, nowIso(), encounterId]);
  else await db.execute(`UPDATE encounter SET visit_type = ?, fee = ?, updated_at = ? WHERE id = ?`, [visitType, fee, nowIso(), encounterId]);
}

/** Latest earlier consultation (not a report visit) of this patient, for the free report-showing window. */
export async function lastConsultationDate(db: Db, patientId: string, beforeDate: string): Promise<string | null> {
  const row = await db.getOptional<{ d: string }>(
    `SELECT visit_date AS d FROM encounter WHERE patient_id = ? AND status = 'done' AND visit_date < ? AND COALESCE(visit_type, '') <> 'report'
      ORDER BY visit_date DESC LIMIT 1`,
    [patientId, beforeDate],
  );
  return row?.d ?? null;
}
