import "server-only";
import { customMedicineProblem, formatInstruction, labCatalogueRowProblem, labReportProblem, type PrescriptionDoc, type RxItem } from "@rx/core";
import { s, withTenant, type Tx } from "@rx/db";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { appDb } from "./db";
import type { Session } from "./session";

/**
 * NOTE: the client mirrors these rules (antibiotic duration, non-empty Rx, allergy / contraindicated
 * interaction / pregnancy D–X blockers in visit.tsx + safety.ts). Keep both sides identical — a
 * server-only rejection reverts a write the user already saw succeed (via "not saved on server").
 *
 * Applies the PowerSync client's CRUD queue to Postgres. Runs on the RLS connection inside
 * withTenant(), so a client can never touch another tenant's rows even if it forges ids.
 * PUT is an upsert and DELETE of a missing row is a no-op, so retries are idempotent.
 */

type Kind = "text" | "uuid" | "date" | "ts" | "int" | "num" | "bool" | "jsonb" | "textarr" | "uuidarr" | `enum:${string}`;

interface TableSpec {
  /** Columns a client may write. tenant_id is always forced from the session. */
  columns: Record<string, Kind>;
  /** Roles allowed to write this table. */
  roles: Session["tenantRole"][];
  allowDelete?: boolean;
}

const SPECS: Record<string, TableSpec> = {
  appointment: {
    roles: ["doctor", "assistant", "clinic_admin"],
    columns: {
      chamber_id: "uuid", doctor_user_id: "uuid", patient_id: "uuid", name: "text", mobile: "text", appt_date: "date", serial_no: "int",
      status: "enum:appointment_status", encounter_id: "uuid", note: "text", source: "text", created_at: "ts",
    },
  },
  patient: {
    roles: ["doctor", "assistant", "clinic_admin"],
    columns: {
      name: "text", dob: "date", dob_estimated: "bool", sex: "enum:sex", mobile: "text", address: "text", nid: "text",
      brn: "text", health_id: "text", allergies: "textarr", pregnancy_status: "text", notes: "text", consent_at: "ts",
      guardian_name: "text", report_files_consent_at: "ts", referred_by: "text",
      birth_weight_kg: "num", gestational_age_weeks: "int",
      deleted_at: "ts", created_at: "ts",
    },
  },
  encounter: {
    roles: ["doctor", "assistant", "clinic_admin"],
    columns: {
      patient_id: "uuid", doctor_user_id: "uuid", chamber_id: "uuid", visit_date: "date", serial_no: "int",
      status: "enum:encounter_status", specialty_code: "text", template_id: "uuid", vitals: "jsonb", exam_findings: "jsonb",
      fee: "int", visit_type: "enum:visit_type", created_at: "ts",
    },
  },
  prescription: {
    roles: ["doctor"],
    columns: {
      encounter_id: "uuid", patient_id: "uuid", doctor_user_id: "uuid", chamber_id: "uuid", version: "int",
      supersedes_id: "uuid", status: "enum:prescription_status", doc: "jsonb", finalized_at: "ts", verify_token: "text",
      created_at: "ts",
    },
  },
  lab_report: {
    // The assistant types in the paper reports while the patient waits, or the clinic lab's own results;
    // removal is a soft delete. prepared_by_name is always the uploader's (set below); lab_no is the server's.
    roles: ["doctor", "assistant", "clinic_admin"],
    columns: {
      patient_id: "uuid", encounter_id: "uuid", report_date: "date", lab_name: "text", panel: "text", title: "text",
      results: "jsonb", conclusion: "text", files: "jsonb", deleted_at: "ts", created_at: "ts",
      source: "text", request_id: "uuid", department: "text", specimen: "text", collected_at: "ts", referred_by: "text",
      comment: "text", prepared_by_name: "text", verified_by_name: "text", verified_at: "ts",
    },
  },
  // A clinic's changes to the lab catalogue (never the platform's rows: see checkLabCatalogue).
  lab_test: {
    roles: ["doctor", "clinic_admin"],
    columns: {
      code: "text", name: "text", short: "text", unit: "text", kind: "text", department: "text", sort_order: "int",
      is_active: "bool", spec: "jsonb", created_at: "ts",
    },
  },
  lab_panel: {
    roles: ["doctor", "clinic_admin"],
    columns: { key: "text", name: "text", department: "text", sort_order: "int", is_active: "bool", spec: "jsonb", created_at: "ts" },
  },
  lab_profile: {
    roles: ["doctor", "clinic_admin"],
    columns: {
      lab_name: "text", address: "text", phone: "text", logo_data_url: "text", signatories: "jsonb", footer_text: "text",
      print_settings: "jsonb", created_at: "ts",
    },
  },
  chamber: {
    roles: ["doctor", "clinic_admin"],
    columns: {
      name: "text", address: "text", room: "text", phone: "text", hours: "text", print_settings: "jsonb", doctor_user_id: "uuid",
      schedule: "jsonb", serial_phone: "text", footer_text: "text", logo_data_url: "text", is_active: "bool", created_at: "ts",
      free_report_days: "int", report_fee: "int",
    },
  },
  rx_template: {
    roles: ["doctor", "clinic_admin"],
    allowDelete: true,
    columns: { owner_user_id: "uuid", specialty_code: "text", name: "text", payload: "jsonb", is_active: "bool", created_at: "ts" },
  },
  doctor_favorite: {
    roles: ["doctor"],
    allowDelete: true,
    columns: { user_id: "uuid", product_id: "uuid", default_shortcut: "text", use_count: "int", created_at: "ts" },
  },
  // A medicine the doctor added; review fields (status, note, approved product) are the platform admin's.
  custom_medicine: {
    roles: ["doctor"],
    columns: {
      brand_name: "text", form_id: "uuid", strength_text: "text", generic_text: "text", generic_ids: "uuidarr",
      company_id: "uuid", company_name: "text", created_at: "ts",
    },
  },
  doctor_profile: {
    roles: ["doctor"],
    // Identity fields (BMDC, degrees) are admin-verified and not client-writable.
    columns: { signature_data_url: "text" },
  },
};

export interface CrudOp {
  op: "PUT" | "PATCH" | "DELETE";
  table: string;
  id: string;
  data: Record<string, unknown>;
}

export interface UploadResult {
  applied: number;
  rejected: { table: string; id: string; reason: string }[];
}

class Rejection extends Error {}

function valueSql(kind: Kind, raw: unknown): SQL {
  if (raw === null || raw === undefined || raw === "") return sql`null`;
  switch (kind) {
    case "text":
      return sql`${String(raw)}`;
    case "uuid":
      return sql`${String(raw)}::uuid`;
    case "date":
      return sql`${String(raw).slice(0, 10)}::date`;
    case "ts":
      return sql`${String(raw)}::timestamptz`;
    case "int":
      return sql`${Math.trunc(Number(raw))}::int`;
    case "num": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Rejection("not a number");
      return sql`${n}::double precision`;
    }
    case "bool":
      return sql`${raw === true || raw === 1 || raw === "1" || raw === "true"}::boolean`;
    case "jsonb":
      return sql`${typeof raw === "string" ? raw : JSON.stringify(raw)}::jsonb`;
    case "textarr":
      return sql`array(select jsonb_array_elements_text(${typeof raw === "string" ? raw : JSON.stringify(raw)}::jsonb))`;
    case "uuidarr":
      return sql`array(select jsonb_array_elements_text(${typeof raw === "string" ? raw : JSON.stringify(raw)}::jsonb)::uuid)`;
    default:
      return sql`${String(raw)}::${sql.raw(kind.slice(5))}`;
  }
}

function pick(spec: TableSpec, data: Record<string, unknown>) {
  return Object.entries(data).filter(([k]) => k in spec.columns) as [string, unknown][];
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function applyOp(tx: Tx, session: Session & { tenantId: string }, op: CrudOp) {
  const spec = SPECS[op.table];
  if (!spec) throw new Rejection(`table ${op.table} is read-only`);
  if (!spec.roles.includes(session.tenantRole)) throw new Rejection(`role ${session.tenantRole} cannot write ${op.table}`);
  if (!isUuid(op.id)) throw new Rejection("invalid id");
  const t = sql.identifier(op.table);
  const idCol = op.table === "doctor_profile" ? sql.identifier("user_id") : sql.identifier("id");

  if (op.table === "doctor_profile" && op.id !== session.userId) throw new Rejection("can only edit own profile");
  if (op.table === "lab_profile" && op.id !== session.tenantId) throw new Rejection("the lab profile's id is the clinic's");

  if (op.op === "DELETE") {
    if (!spec.allowDelete) throw new Rejection(`delete not allowed on ${op.table}; use a soft-delete field`);
    await tx.execute(sql`delete from ${t} where ${idCol} = ${op.id}::uuid`);
    return;
  }

  const data = { ...op.data };
  // Server-owned / forced fields.
  if (op.table === "doctor_favorite") data.user_id = session.userId;
  if (op.table === "rx_template" && session.tenantRole === "doctor") data.owner_user_id = session.userId;
  const existing = (await tx.execute(sql`select * from ${t} where ${idCol} = ${op.id}::uuid`)) as unknown as Record<string, unknown>[];
  const before = existing[0];

  if (op.table === "prescription") {
    if (op.op === "PUT" || "doctor_user_id" in data) data.doctor_user_id = session.userId;
    if (before?.status === "final") throw new Rejection("finalised prescriptions are immutable; create a new version");
    if (before && before.doctor_user_id !== session.userId) throw new Rejection("not your prescription");
  }
  if (op.table === "encounter" && op.op === "PUT" && !data.doctor_user_id) throw new Rejection("doctor_user_id required");
  if (op.table === "lab_report") {
    await checkLabReport(tx, op, data, before);
    if (op.op === "PUT" && !before) data.prepared_by_name = session.name;
    else delete data.prepared_by_name;
    // Verification is doctor/clinic_admin only; name always comes from the session.
    const wantsVerify = data.verified_at != null && data.verified_at !== "";
    const wantsUnverify = data.verified_at === null || data.verified_at === "";
    delete data.verified_by_name;
    if (wantsVerify && !before?.verified_at) {
      if (session.tenantRole !== "doctor" && session.tenantRole !== "clinic_admin") {
        throw new Rejection("only a doctor or clinic admin can verify a lab report");
      }
      data.verified_by_name = session.name;
      data.verified_at = new Date().toISOString();
    } else if (wantsUnverify && before?.verified_at) {
      if (session.tenantRole !== "doctor" && session.tenantRole !== "clinic_admin") {
        throw new Rejection("only a doctor or clinic admin can clear verification");
      }
      data.verified_by_name = null;
      data.verified_at = null;
    } else {
      delete data.verified_at;
      delete data.verified_by_name;
    }
  }
  if (op.table === "patient" && "pregnancy_status" in data) {
    const v = data.pregnancy_status;
    if (v != null && v !== "" && !["none", "pregnant", "lactating", "both"].includes(String(v))) {
      throw new Rejection("invalid pregnancy_status");
    }
    if (v === "") data.pregnancy_status = null;
  }
  if (op.table === "lab_test" || op.table === "lab_panel") await checkLabCatalogue(tx, session.tenantId, op, data, before);
  if (op.table === "custom_medicine") checkCustomMedicine(session.userId, data, before);
  if (op.table === "lab_profile") {
    if (typeof data.logo_data_url === "string" && data.logo_data_url.length > 400_000) throw new Rejection("logo image too large (max 300 KB)");
    const signatories = typeof data.signatories === "string" ? data.signatories : JSON.stringify(data.signatories ?? []);
    if (signatories.length > 4000) throw new Rejection("too many signatories");
  }
  if (op.table === "chamber") {
    if (op.op === "PUT" && !before && session.tenantRole === "doctor") data.doctor_user_id = session.userId;
    if (typeof data.logo_data_url === "string" && data.logo_data_url.length > 400_000) throw new Rejection("logo image too large (max 300 KB)");
    if (op.op === "PUT" && !before && (!String(data.name ?? "").trim() || !String(data.address ?? "").trim())) throw new Rejection("chamber name and address are required");
  }

  const cols = pick(spec, data);
  if (op.op === "PATCH") {
    if (!before) throw new Rejection("row not found");
    if (!cols.length) return;
    const sets = cols.map(([k, v]) => sql`${sql.identifier(k)} = ${valueSql(spec.columns[k]!, v)}`);
    sets.push(sql`updated_at = now()`);
    await tx.execute(sql`update ${t} set ${sql.join(sets, sql`, `)} where ${idCol} = ${op.id}::uuid`);
  } else {
    if (op.table === "doctor_profile") throw new Rejection("profiles are created by the platform admin");
    const insertCols = [sql`id`, sql`tenant_id`, ...cols.map(([k]) => sql.identifier(k))];
    const insertVals = [sql`${op.id}::uuid`, sql`${session.tenantId}::uuid`, ...cols.map(([k, v]) => valueSql(spec.columns[k]!, v))];
    if ((op.table === "patient" || op.table === "encounter" || op.table === "appointment" || op.table === "lab_report") && !("created_by" in data)) {
      insertCols.push(sql`created_by`);
      insertVals.push(sql`${session.userId}::uuid`);
    }
    if (op.table === "custom_medicine") {
      insertCols.push(sql`owner_user_id`);
      insertVals.push(sql`${session.userId}::uuid`);
    }
    const updates = cols.filter(([k]) => k !== "created_at").map(([k]) => sql`${sql.identifier(k)} = excluded.${sql.identifier(k)}`);
    updates.push(sql`updated_at = now()`);
    await tx.execute(sql`
      insert into ${t} (${sql.join(insertCols, sql`, `)}) values (${sql.join(insertVals, sql`, `)})
      on conflict (id) do update set ${sql.join(updates, sql`, `)}`);
  }

  // Post-write server logic.
  if (op.table === "patient" && !before) await assignPatientCode(tx, session.tenantId, op.id);
  if (op.table === "lab_report") await assignLabNo(tx, session.tenantId, op.id);
  if (op.table === "prescription") {
    const [row] = await tx.select().from(s.prescription).where(eq(s.prescription.id, op.id));
    if (row && row.status === "final" && before?.status !== "final") await finalize(tx, session, row);
  }
}

/** Today in Bangladesh, where the clinics are (the server may run in UTC). */
const todayBd = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

/** Same checks the lab report card runs before saving (labReportProblem), plus the row must make sense. */
async function checkLabReport(tx: Tx, op: CrudOp, data: Record<string, unknown>, before: Record<string, unknown> | undefined) {
  const json = (v: unknown, what: string) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v) as unknown;
    } catch {
      throw new Rejection(`${what} must be a list`);
    }
  };
  const problem = labReportProblem(
    {
      results: json(data.results, "results"), files: json(data.files, "files"), title: data.title, labName: data.lab_name, conclusion: data.conclusion,
      reportDate: data.report_date, source: data.source, requestId: data.request_id, specimen: data.specimen, collectedAt: data.collected_at,
      referredBy: data.referred_by, comment: data.comment, department: data.department,
    },
    todayBd(),
  );
  if (problem) throw new Rejection(problem);
  if (op.op === "PUT" && !before) {
    for (const k of ["patient_id", "report_date", "panel", "title"]) if (!String(data[k] ?? "").trim()) throw new Rejection(`${k} is required`);
  }
  const patientId = (data.patient_id ?? before?.patient_id) as string | undefined;
  const encounterId = (data.encounter_id ?? before?.encounter_id) as string | undefined;
  if (encounterId && patientId) {
    const rows = (await tx.execute(sql`select 1 from encounter where id = ${encounterId}::uuid and patient_id = ${patientId}::uuid`)) as unknown as unknown[];
    if (!rows.length) throw new Rejection("the visit belongs to another patient");
  }
}

/** A clinic may change its own catalogue rows only; a code or key stays what it was created with. */
async function checkLabCatalogue(tx: Tx, tenantId: string, op: CrudOp, data: Record<string, unknown>, before: Record<string, unknown> | undefined) {
  const table = op.table as "lab_test" | "lab_panel";
  const id = table === "lab_test" ? "code" : "key";
  if (before && before.tenant_id === null) throw new Rejection("the platform's lab catalogue is read-only");
  const problem = labCatalogueRowProblem(table, data);
  if (problem) throw new Rejection(problem);
  if (before && id in data && data[id] !== before[id]) throw new Rejection(`a test's ${id} can't change`);
  if (!before) {
    if (!data[id]) throw new Rejection(`${id} is required`);
    const other = (await tx.execute(sql`select 1 from ${sql.identifier(table)} where tenant_id = ${tenantId}::uuid and ${sql.identifier(id)} = ${String(data[id])} and id <> ${op.id}::uuid`)) as unknown as unknown[];
    if (other.length) throw new Rejection(`this clinic already has a row for ${String(data[id])}`);
  }
}

/** A doctor edits only the medicines they added, and only until the platform admin has reviewed them. */
function checkCustomMedicine(userId: string, data: Record<string, unknown>, before: Record<string, unknown> | undefined) {
  if (before && before.owner_user_id !== userId) throw new Rejection("not your medicine");
  if (before && before.status !== "pending") throw new Rejection("this medicine has already been reviewed");
  const problem = customMedicineProblem({ ...before, ...data });
  if (problem) throw new Rejection(problem);
}

/** The clinic lab's report number (L-000123), once per request: the request's other panels share it. */
async function assignLabNo(tx: Tx, tenantId: string, reportId: string) {
  const [row] = (await tx.execute(sql`select source, request_id, lab_no from lab_report where id = ${reportId}::uuid`)) as unknown as { source: string; request_id: string | null; lab_no: string | null }[];
  if (!row || row.source !== "in_house" || row.lab_no) return;
  if (row.request_id) {
    const [sibling] = (await tx.execute(sql`select lab_no from lab_report where request_id = ${row.request_id}::uuid and lab_no is not null limit 1`)) as unknown as { lab_no: string }[];
    if (sibling) {
      await tx.execute(sql`update lab_report set lab_no = ${sibling.lab_no} where id = ${reportId}::uuid and lab_no is null`);
      return;
    }
  }
  const [t] = await tx
    .update(s.tenant)
    .set({ labSeq: sql`${s.tenant.labSeq} + 1` })
    .where(eq(s.tenant.id, tenantId))
    .returning({ seq: s.tenant.labSeq });
  await tx.execute(sql`update lab_report set lab_no = ${`L-${String(t!.seq).padStart(6, "0")}`} where id = ${reportId}::uuid and lab_no is null`);
}

async function assignPatientCode(tx: Tx, tenantId: string, patientId: string) {
  // Keep tenant counter ahead of any codes already on devices (offline registration).
  await tx.execute(sql`
    UPDATE tenant SET patient_seq = GREATEST(
      patient_seq,
      COALESCE((SELECT MAX(CAST(REPLACE(code, 'P-', '') AS INTEGER)) FROM patient WHERE tenant_id = ${tenantId}::uuid AND code LIKE 'P-%'), 0)
    ) + 1
    WHERE id = ${tenantId}::uuid
  `);
  const [t] = await tx.select({ seq: s.tenant.patientSeq }).from(s.tenant).where(eq(s.tenant.id, tenantId));
  await tx.execute(sql`update patient set code = ${`P-${String(t!.seq).padStart(6, "0")}`} where id = ${patientId}::uuid and code is null`);
}

async function finalize(tx: Tx, session: Session & { tenantId: string }, row: typeof s.prescription.$inferSelect) {
  const doc = row.doc as PrescriptionDoc;
  if (!doc?.items?.length) throw new Rejection("cannot finalise an empty prescription");
  for (const it of doc.items) {
    if (it.isAntibiotic && it.duration?.kind !== "fixed") throw new Rejection(`antibiotic ${it.brandName} needs a fixed duration`);
  }
  await assertFinalizeSafety(tx, row.patientId, doc);
  await tx.execute(sql`update prescription set finalized_at = coalesce(finalized_at, now()) where id = ${row.id}::uuid`);
  await tx.delete(s.prescriptionItem).where(eq(s.prescriptionItem.prescriptionId, row.id));
  await tx.insert(s.prescriptionItem).values(
    doc.items.map((it, position) => ({
      tenantId: session.tenantId,
      prescriptionId: row.id,
      position,
      productId: it.productId && isUuid(it.productId) ? it.productId : null,
      brandName: it.brandName,
      genericName: it.genericName ?? null,
      instruction: formatInstruction(it, "en", "en"),
    })),
  );
  await tx.execute(sql`update encounter set status = 'done', updated_at = now() where id = ${row.encounterId}::uuid and status <> 'done'`);
}

const normAllergy = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+(hydrochloride|hcl|sodium|potassium|trihydrate|dihydrate|monohydrate|besilate|maleate|citrate)\b/g, "")
    .trim();

/** The id an item's generics are looked up by: its catalogue product, else the doctor-added medicine. */
const itemKey = (it: RxItem) => it.productId || it.customMedicineId || null;

/** Hard gates mirrored by client `checkSafety` blockers — allergies, contraindicated DDI, pregnancy D/X. */
async function assertFinalizeSafety(tx: Tx, patientId: string, doc: PrescriptionDoc) {
  const [patient] = await tx
    .select({
      allergies: s.patient.allergies,
      sex: s.patient.sex,
      pregnancyStatus: s.patient.pregnancyStatus,
    })
    .from(s.patient)
    .where(eq(s.patient.id, patientId));
  if (!patient) throw new Rejection("patient not found");

  const productIds = [...new Set(doc.items.map((i) => i.productId).filter((id): id is string => !!id && isUuid(id)))];
  const customIds = [...new Set(doc.items.filter((i) => !i.productId).map((i) => i.customMedicineId).filter((id): id is string => !!id && isUuid(id)))];
  if (!productIds.length && !customIds.length) return;

  const productIngredients = productIds.length
    ? await tx
        .select({
          productId: s.productIngredient.productId,
          genericId: s.generic.id,
          genericName: s.generic.name,
          pregnancyCategory: s.generic.pregnancyCategory,
        })
        .from(s.productIngredient)
        .innerJoin(s.generic, eq(s.generic.id, s.productIngredient.genericId))
        .where(inArray(s.productIngredient.productId, productIds))
    : [];
  // A doctor-added medicine's generics, keyed by its custom_medicine id (the client's safety.ts genericsFor does the same).
  const customIngredients = customIds.length
    ? ((await tx.execute(sql`
        select c.id::text as "productId", g.id::text as "genericId", g.name as "genericName", g.pregnancy_category as "pregnancyCategory"
        from custom_medicine c cross join unnest(c.generic_ids) as gid(id) join generic g on g.id = gid.id
        where c.id in (${sql.join(customIds.map((id) => sql`${id}::uuid`), sql`, `)})`)) as unknown as typeof productIngredients)
    : [];
  const ingredients = [...productIngredients, ...customIngredients];

  const byProduct = new Map<string, typeof ingredients>();
  for (const row of ingredients) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }

  const allergies = (patient.allergies ?? []).map(normAllergy).filter(Boolean);
  for (const it of doc.items) {
    const key = itemKey(it);
    if (!key) continue;
    const gens = byProduct.get(key) ?? [];
    for (const a of allergies) {
      const hit =
        gens.find((g) => normAllergy(g.genericName).includes(a) || a.includes(normAllergy(g.genericName))) ??
        (normAllergy(it.brandName).includes(a) ? { genericName: it.brandName } : null);
      if (hit) throw new Rejection(`allergy: patient allergic to ${a} (${hit.genericName})`);
    }
  }

  const genericIds = [...new Set(ingredients.map((i) => i.genericId))];
  if (genericIds.length > 1) {
    const pairs = await tx
      .select({
        a: s.genericInteraction.genericA,
        b: s.genericInteraction.genericB,
        severity: s.genericInteraction.severity,
        effect: s.genericInteraction.effect,
      })
      .from(s.genericInteraction)
      .where(and(inArray(s.genericInteraction.genericA, genericIds), inArray(s.genericInteraction.genericB, genericIds)));
    for (const p of pairs) {
      if (p.severity.toLowerCase() !== "contraindicated") continue;
      const nameA = ingredients.find((i) => i.genericId === p.a)?.genericName ?? "drug";
      const nameB = ingredients.find((i) => i.genericId === p.b)?.genericName ?? "drug";
      throw new Rejection(`contraindicated interaction: ${nameA} + ${nameB} (${p.effect})`);
    }
  }

  const pregnant = patient.pregnancyStatus === "pregnant" || patient.pregnancyStatus === "both";
  if (pregnant && (patient.sex === "female" || patient.sex === null)) {
    for (const it of doc.items) {
      const key = itemKey(it);
      if (!key) continue;
      for (const g of byProduct.get(key) ?? []) {
        const cat = (g.pregnancyCategory ?? "").trim().toUpperCase().replace(/^CATEGORY\s+/, "");
        if (cat === "X" || cat === "D") {
          throw new Rejection(`pregnancy category ${cat}: ${g.genericName} — cannot finalise`);
        }
      }
    }
  }
}

export async function applyUpload(session: Session & { tenantId: string }, batch: CrudOp[]): Promise<UploadResult> {
  const result: UploadResult = { applied: 0, rejected: [] };
  for (const op of batch) {
    try {
      await withTenant(appDb, { tenantId: session.tenantId, userId: session.userId }, async (tx) => {
        await applyOp(tx, session, op);
        await tx.insert(s.auditLog).values({
          actorUserId: session.userId,
          tenantId: session.tenantId,
          action: `sync.${op.table}.${op.op.toLowerCase()}`,
          entity: op.table,
          entityId: op.id,
          // Clinical content stays out of the audit log; record which fields changed.
          after: { fields: Object.keys(op.data ?? {}) },
        });
      });
      result.applied++;
    } catch (e) {
      const reason = e instanceof Rejection ? e.message : (e as Error).message.split("\n")[0]!;
      result.rejected.push({ table: op.table, id: op.id, reason });
      if (!(e instanceof Rejection)) console.error("sync upload op failed", op.table, op.id, e);
    }
  }
  return result;
}
