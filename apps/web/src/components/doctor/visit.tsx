"use client";

import { bmi, chamberWorkdays, classifyDosageForm, inFreeReportWindow, parseShortcut, type ChamberSlot, type PrescriptionDoc, type RxItem, type Sex, type Vitals } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTemplate,
  clearTemplate,
  emptyDoc,
  ensureDraft,
  finalizePrescription,
  lastConsultationDate,
  lastFinalDoc,
  newVersion,
  saveDraftDoc,
  saveFee,
  saveTemplate,
  saveVisitType,
  saveVitals,
  toggleFavorite,
  type MedicineHit,
  type TemplatePayload,
  type VisitType,
} from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useMyProfile } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { checkSafety, type SafetyResult } from "@/lib/doctor/safety";
import { ageLabel, ageParts, parseJson, resumeEditAfterPrint, uuid } from "@/lib/doctor/util";
import { ChipList } from "./chips";
import { KeyValueList } from "./kv-list";
import { LabReports } from "./lab-reports";
import { MedicineSearch } from "./med-search";
import { RxItemRow } from "./rx-item";
import { SpecialtyExam } from "./specialty-exam";
import { VisitSidePanel, type VisitRxActions } from "./visit-side-panel";

// ---------------------------------------------------------------------------
// Vitals (assistant or doctor)
// ---------------------------------------------------------------------------

function VitalsPanel({ encounterId, initial, readOnly }: { encounterId: string; initial: Vitals; readOnly: boolean }) {
  const db = usePowerSync();
  const [v, setV] = useState<Vitals>(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Vitals | null>(null);
  useEffect(() => setV(initial), [encounterId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) void saveVitals(db, encounterId, pending.current);
    },
    [db, encounterId],
  );
  const set = (k: keyof Vitals, raw: string) => {
    const n = raw === "" ? undefined : Number(raw);
    const next = { ...v, [k]: Number.isFinite(n) ? n : undefined };
    setV(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      void saveVitals(db, encounterId, next);
    }, 500);
  };
  const field = (k: keyof Vitals, label: string, width = "w-14") => (
    <label className="flex shrink-0 flex-col text-[11px] text-slate-500">
      {label}
      <input className={`input ${width} py-1`} inputMode="decimal" disabled={readOnly} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} data-testid={`vital-${k}`} />
    </label>
  );
  const b = bmi(v.weightKg, v.heightCm);
  return (
    <section className="min-w-0 w-full sm:w-auto sm:max-w-none">
      <div className="mb-1 flex items-baseline justify-between gap-2 sm:justify-end">
        <h3 className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">O/E — Vitals</h3>
        {b && <span className="text-[11px] tabular-nums text-slate-500">BMI {b}</span>}
      </div>
      <div className="flex flex-wrap items-end justify-start gap-x-1.5 gap-y-1 sm:flex-nowrap sm:justify-end">
        <label className="flex flex-col text-[11px] text-slate-500">
          BP
          <span className="flex items-center gap-0.5">
            <input className="input w-12 py-1" inputMode="numeric" disabled={readOnly} value={v.bpSystolic ?? ""} onChange={(e) => set("bpSystolic", e.target.value)} aria-label="Systolic" />
            <span className="text-slate-300">/</span>
            <input className="input w-12 py-1" inputMode="numeric" disabled={readOnly} value={v.bpDiastolic ?? ""} onChange={(e) => set("bpDiastolic", e.target.value)} aria-label="Diastolic" />
          </span>
        </label>
        {field("pulse", "Pulse")}
        {field("tempF", "Temp °F")}
        {field("spo2", "SpO₂")}
        {field("respRate", "RR")}
        {field("weightKg", "Wt")}
        {field("heightCm", "Ht")}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prescription editor (doctor)
// ---------------------------------------------------------------------------

function itemFromMedicine(m: MedicineHit): RxItem {
  const form = classifyDosageForm(m.form_name ?? "");
  const unit = (m.default_unit ?? form.unit) as RxItem["doseUnit"];
  const route = (m.default_route ?? form.route) as RxItem["route"];
  const base: RxItem = {
    id: uuid(),
    productId: m.id,
    form: m.form_label ?? form.shortLabel,
    brandName: m.brand_name,
    genericName: m.generic_text,
    strength: m.strength_text ?? undefined,
    route,
    doseUnit: unit,
    isAntibiotic: !!m.is_antibiotic,
    frequency: { kind: "pattern", slots: [1, 0, 1] },
    timing: route === "oral" ? "after_food" : "none",
    duration: { kind: "fixed", value: 7, unit: "day" },
  };
  if (unit === "drop") Object.assign(base, { doseQty: 2, frequency: { kind: "times_per_day", times: 3 } });
  else if (unit === "spray" || unit === "puff") Object.assign(base, { doseQty: 2, frequency: { kind: "times_per_day", times: 2 } });
  else if (unit === "tsf") Object.assign(base, { doseQty: 1, frequency: { kind: "pattern", slots: [1, 1, 1] } });
  else if (unit === "application") Object.assign(base, { frequency: { kind: "times_per_day", times: 2 }, timing: "none" });
  // A favourite remembers the doctor's usual dose for this product.
  if (m.favorite_shortcut) {
    const p = parseShortcut(m.favorite_shortcut);
    Object.assign(base, Object.fromEntries(Object.entries(p).filter(([k, v]) => k !== "unknown" && v !== undefined)));
  }
  return base;
}

function shortcutForFavorite(it: RxItem): string {
  const f = it.frequency;
  const parts: string[] = [];
  if (it.doseQty && it.doseUnit && !["tab", "cap"].includes(it.doseUnit)) parts.push(`${it.doseQty} ${it.doseUnit}`);
  if (f.kind === "pattern") parts.push(f.slots.join("+"));
  else if (f.kind === "times_per_day") parts.push({ 1: "od", 2: "bd", 3: "tds", 4: "qds" }[f.times] ?? "tds");
  if (it.timing && it.timing !== "none") parts.push({ after_food: "af", before_food: "bf", with_food: "wf", empty_stomach: "es", bedtime: "hs", none: "" }[it.timing]);
  if (it.duration.kind === "fixed") parts.push(`${it.duration.value}${it.duration.unit[0]}`);
  if (it.duration.kind === "continue") parts.push("cont");
  return parts.join(" ");
}

const OE_LABELS = ["Pulse", "BP", "Anaemia", "Jaundice", "Oedema", "Cyanosis", "Heart", "Lungs", "Abdomen", "Skin condition", "Fundus", "Throat", "Lymph nodes"];

/** Builds a Plan line such as "Refd to Paediatric ophthalmology Dept., BSMMU, Dhaka — Dr. Tarek Reza Ali (01766683417)". */
function ReferralForm({ onAdd }: { onAdd: (line: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ to: "", doctor: "", phone: "" });
  if (!open) return <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)} data-testid="add-referral">+ Referral</button>;
  const add = () => {
    const where = f.to.trim() ? `Refd to ${f.to.trim()}` : "Refd to";
    const who = [f.doctor.trim(), f.phone.trim() && `(${f.phone.trim()})`].filter(Boolean).join(" ");
    if (f.to.trim() || who) onAdd([where, who].filter(Boolean).join(" — "));
    setF({ to: "", doctor: "", phone: "" });
    setOpen(false);
  };
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2">
      <input className="input" placeholder="Department / institution / address" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} data-testid="referral-to" />
      <div className="flex gap-1">
        <input className="input flex-1" placeholder="Doctor (optional)" value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })} data-testid="referral-doctor" />
        <input className="input w-36" placeholder="Phone (optional)" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      <div className="flex gap-1">
        <button type="button" className="btn-secondary text-xs" onClick={add} data-testid="referral-add">Add to plan</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** Pre-filled reply letter to the referring doctor; the doctor edits it before finalising. */
function referralReply(doc: PrescriptionDoc): string {
  const to = doc.referredBy?.trim() || "Dr. ";
  const findings = doc.diagnoses.length ? `\n\n${doc.diagnoses.join("; ")}.` : "";
  return `Dear ${to},\nThank you for the referral.${findings}\n\nReferred back to ${to}.`;
}

interface PatientCtx {
  id: string;
  allergies: string[];
  ageYears: number | null;
  sex: "male" | "female" | "other" | null;
  pregnancyStatus: "none" | "pregnant" | "lactating" | "both" | null;
}

function RxEditor({
  prescriptionId,
  encounterId,
  patient,
  specialtyCode,
  vitals,
  onActionsChange,
}: {
  prescriptionId: string;
  encounterId: string;
  patient: PatientCtx;
  specialtyCode: string;
  vitals: Vitals;
  onActionsChange?: (actions: VisitRxActions | null) => void;
}) {
  const db = usePowerSync();
  const session = useSession();
  const { data: rxRows } = useQuery<{ id: string; status: string; doc: string; version: number }>(
    "SELECT id, status, doc, version FROM prescription WHERE id = ?",
    [prescriptionId],
  );
  const rx = rxRows[0];
  const [doc, setDoc] = useState<PrescriptionDoc | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [safety, setSafety] = useState<SafetyResult>({ byItem: {}, general: [], blockers: [] });
  const [error, setError] = useState<string>();
  /** Selected Apply-template value; `__none__` = clear template fields. */
  const [templateId, setTemplateId] = useState("");
  const loadedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readOnly = rx?.status === "final";

  // Load once per prescription; later sync echoes of our own writes must not clobber typing.
  useEffect(() => {
    if (rx && loadedFor.current !== rx.id) {
      loadedFor.current = rx.id;
      setTemplateId("");
      setDoc({ ...emptyDoc(), ...parseJson<PrescriptionDoc>(rx.doc, emptyDoc()) });
    }
  }, [rx]);

  const { data: favs } = useQuery<{ product_id: string }>("SELECT product_id FROM doctor_favorite WHERE user_id = ?", [session.userId]);
  const favSet = new Set(favs.map((f) => f.product_id));
  const { data: templates } = useQuery<{ id: string; name: string; payload: string; tenant_id: string | null }>(
    "SELECT id, name, payload, tenant_id FROM rx_template WHERE is_active = 1 AND (specialty_code IS NULL OR specialty_code = ?) ORDER BY tenant_id IS NULL, name",
    [specialtyCode],
  );
  const { data: referrers } = useQuery<{ r: string }>(
    "SELECT DISTINCT json_extract(doc, '$.referredBy') AS r FROM prescription WHERE json_extract(doc, '$.referredBy') IS NOT NULL ORDER BY r LIMIT 200",
  );
  const { data: snippets } = useQuery<{ t: string }>(
    "SELECT text_bn AS t FROM instruction_snippet WHERE specialty_code IS NULL OR specialty_code = ? ORDER BY sort_order",
    [specialtyCode],
  );

  // Latest unsaved doc; flushed immediately if the editor unmounts before the debounce fires.
  const pending = useRef<PrescriptionDoc | null>(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) void saveDraftDoc(db, prescriptionId, pending.current);
    },
    [db, prescriptionId],
  );

  const update = useCallback(
    (fn: (d: PrescriptionDoc) => PrescriptionDoc) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        setSaved("saving");
        pending.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          pending.current = null;
          await saveDraftDoc(db, prescriptionId, next);
          setSaved("saved");
        }, 600);
        return next;
      });
    },
    [db, prescriptionId],
  );

  // Safety checks run against the local catalogue whenever items, allergies or weight change.
  const itemsKey = JSON.stringify(doc?.items.map((i) => [i.productId, i.frequency, i.doseQty, i.doseUnit]) ?? []);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    checkSafety(db, doc, {
      allergies: patient.allergies,
      ageYears: patient.ageYears,
      weightKg: vitals.weightKg ?? null,
      sex: patient.sex,
      pregnancyStatus: patient.pregnancyStatus,
    }).then((r) => {
      if (!cancelled) setSafety(r);
    });
    return () => {
      cancelled = true;
    };
  }, [itemsKey, patient.allergies.join(), vitals.weightKg, patient.ageYears, patient.sex, patient.pregnancyStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalizeRef = useRef<() => void>(() => {});
  const editVersionRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "TEXTAREA" && e.key === "Enter") return;
      if (e.key === "Enter") {
        e.preventDefault();
        finalizeRef.current();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        navigate(`/rx/${prescriptionId}/print`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prescriptionId]);

  useEffect(() => {
    if (!rx || !onActionsChange) return;
    onActionsChange({
      prescriptionId,
      readOnly: rx.status === "final",
      version: rx.version,
      blocked: safety.blockers.length > 0,
      finalize: () => finalizeRef.current(),
      editVersion: () => editVersionRef.current(),
    });
    return () => onActionsChange(null);
  }, [rx?.id, rx?.status, rx?.version, safety.blockers.length, prescriptionId, onActionsChange]);

  if (!rx || !doc) return <div className="text-sm text-slate-500">Loading prescription…</div>;

  const spec = [specialtyCode];
  const libQuery = (table: string, label: string, value = label, hint?: string) =>
    `SELECT ${label} AS label, ${value} AS value${hint ? `, ${hint} AS hint` : ""} FROM ${table}
      WHERE (specialty_code IS NULL OR specialty_code = ?) AND (${label} LIKE ?${hint ? ` OR ${hint} LIKE ?2` : ""})
      ORDER BY specialty_code IS NULL, sort_order LIMIT 12`;

  async function finalize() {
    if (!doc || readOnly) return;
    setError(undefined);
    if (!doc.items.length) return setError("Add at least one medicine");
    const noDuration = doc.items.find((i) => i.isAntibiotic && i.duration.kind !== "fixed");
    if (noDuration) return setError(`Set a fixed duration for antibiotic ${noDuration.brandName}`);
    if (safety.blockers.length) {
      return setError(safety.blockers[0] ?? "Resolve safety blockers before finalising");
    }
    clearTimeout(timer.current);
    pending.current = null;
    await finalizePrescription(db, prescriptionId, doc, vitals);
    // The browser's Back from the print screen resumes editing in the next version (the link passes ?edit=1).
    resumeEditAfterPrint.set(encounterId);
    navigate(`/rx/${prescriptionId}/print`);
  }
  finalizeRef.current = () => {
    void finalize();
  };

  async function editAsNewVersion() {
    const id = await newVersion(db, prescriptionId);
    navigate(`/visit/${encounterId}?rx=${id}`);
  }
  editVersionRef.current = () => {
    void editAsNewVersion();
  };

  async function copyLast() {
    const last = await lastFinalDoc(db, patient.id, encounterId);
    if (!last) return alert("No previous prescription for this patient");
    setTemplateId("");
    update((d) => applyTemplate(d, last));
  }

  function onPickTemplate(id: string) {
    setTemplateId(id);
    if (id === "__none__") {
      update((d) => clearTemplate(d));
      return;
    }
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (t) update((d) => applyTemplate(d, parseJson<TemplatePayload>(t.payload, {})));
  }

  async function saveAsTemplate() {
    if (!doc) return;
    const name = prompt("Template name (e.g. Acute tonsillitis — adult)", doc.diagnoses[0] ?? "");
    if (!name) return;
    const payload: TemplatePayload = {
      chiefComplaints: doc.chiefComplaints,
      investigations: doc.investigations,
      diagnoses: doc.diagnoses,
      items: doc.items,
      advice: doc.advice,
      followUp: doc.followUp,
    };
    await saveTemplate(db, session.tenantId, session.userId, name, specialtyCode, payload);
    alert("Template saved");
  }

  const items = doc.items;
  const setItems = (fn: (items: RxItem[]) => RxItem[]) => update((d) => ({ ...d, items: fn(d.items) }));
  const fu = doc.followUp ?? { kind: "none" as const };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 sm:flex-nowrap"
        data-testid="rx-toolbar"
      >
        {!readOnly ? (
          <>
            <select
              className="input min-w-0 flex-1 basis-[12rem] py-1.5"
              value={templateId}
              aria-label="Apply template"
              data-testid="apply-template"
              onChange={(e) => onPickTemplate(e.target.value)}
            >
              <option value="">Apply template…</option>
              <option value="__none__">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenant_id ? "" : "★ "}
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary shrink-0 whitespace-nowrap px-3 py-1.5" onClick={copyLast}>
              Copy last Rx
            </button>
            <button type="button" className="btn-secondary shrink-0 whitespace-nowrap px-3 py-1.5" onClick={saveAsTemplate}>
              Save as template
            </button>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <span
          className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-500 sm:ml-0"
          data-testid="save-state"
        >
          {readOnly ? `Finalised · v${rx.version}` : saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : `Draft v${rx.version}`}
        </span>
      </div>

      {readOnly && (
        <div className="alert-warn flex flex-wrap items-center gap-2" data-testid="rx-locked">
          <span><b>Finalised &amp; printed (v{rx.version}).</b> Locked so the printed copy stays on record.</span>
          <button className="btn-primary ml-auto" onClick={editAsNewVersion} data-testid="edit-new-version">Edit as v{rx.version + 1}</button>
        </div>
      )}
      {safety.blockers.map((b) => (
        <div key={b} className="alert-danger" data-testid="safety-blocker"><b>Blocked:</b> {b}</div>
      ))}
      {safety.general.map((g) => (
        <div key={g} className="alert-warn" data-testid="safety-warn"><b>Caution:</b> {g}</div>
      ))}

      {/* Clinical (left) and Rx (right) fill remaining height and scroll independently. */}
      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-stretch">
        <div
          className="card min-h-0 space-y-2.5 overflow-y-auto overscroll-y-contain p-2.5 lg:h-full"
          data-testid="rx-clinical-pane"
        >
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ref By — Referring doctor</span>
            <input className="input" list="rx-referrers" disabled={readOnly} value={doc.referredBy ?? ""} placeholder="Dr. Imran"
              onChange={(e) => update((d) => ({ ...d, referredBy: e.target.value || undefined }))} data-testid="ref-by" />
            <datalist id="rx-referrers">{referrers.map((r) => <option key={r.r} value={r.r} />)}</datalist>
          </label>
          <ChipList title="C/C — Chief complaints" values={doc.chiefComplaints} onChange={(v) => update((d) => ({ ...d, chiefComplaints: v }))}
            query={libQuery("complaint", "name", "name", "name_bn")} params={spec} placeholder="Fever × 3 days" testId="cc-input" multiline voice />
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
            <textarea className="input" rows={2} disabled={readOnly} value={doc.history ?? ""} onChange={(e) => update((d) => ({ ...d, history: e.target.value || undefined }))} placeholder="P/H, D/H, F/H…" />
          </section>
          <KeyValueList title="O/E — Findings" values={doc.oeFindings ?? []} suggestions={OE_LABELS} readOnly={readOnly}
            onChange={(v) => update((d) => ({ ...d, oeFindings: v }))} testId="oe" />
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Examination notes</h3>
            <textarea className="input" rows={2} disabled={readOnly} value={doc.examination ?? ""} onChange={(e) => update((d) => ({ ...d, examination: e.target.value || undefined }))} placeholder="Anaemia –, Jaundice –, Heart: S1 S2 normal…" />
          </section>
          <SpecialtyExam encounterId={encounterId} specialtyCode={specialtyCode} readOnly={readOnly}
            onFlatten={(groups, diagrams) => update((d) => ({ ...d, specialtyFindings: groups, diagrams }))} />
          <ChipList title="Ix — Investigations" values={doc.investigations} onChange={(v) => update((d) => ({ ...d, investigations: v }))}
            query={libQuery("investigation", "name", "name", "category")} params={spec} testId="ix-input" />
          <ChipList title="Dx — Diagnosis" values={doc.diagnoses} onChange={(v) => update((d) => ({ ...d, diagnoses: v }))}
            query={libQuery("diagnosis", "name", "name", "icd10")} params={spec} testId="dx-input" />
          <div className="space-y-1">
            <ChipList title="Plan — incl. referrals" values={doc.plan ?? []} onChange={(v) => update((d) => ({ ...d, plan: v }))}
              placeholder="Refd to … / Review with reports" testId="plan-input" multiline />
            {!readOnly && <ReferralForm onAdd={(line) => update((d) => ({ ...d, plan: [...(d.plan ?? []), line] }))} />}
          </div>
          <ChipList title="Note" values={doc.notes ?? []} onChange={(v) => update((d) => ({ ...d, notes: v }))}
            placeholder="Birth wt 1.7 kg / H/O PNA" testId="notes-input" multiline />
        </div>

        <div
          className="card min-h-0 space-y-2 overflow-y-auto overscroll-y-contain p-2.5 lg:h-full"
          data-testid="rx-meds-pane"
        >
          <div className="flex items-baseline gap-1.5"><span className="text-xl font-bold">℞</span>{!readOnly && <span className="text-xs text-slate-400">Shortcuts: 1+0+1 · tds · af/bf/es/hs · 7d/2w/1m/cont · 2 drop re/le/be</span>}</div>
          {!readOnly && <MedicineSearch onPick={(m) => setItems((its) => [...its, itemFromMedicine(m)])} />}
          <ol className="space-y-1.5">
            {items.map((it, i) => (
              <RxItemRow
                key={it.id}
                item={it}
                index={i}
                count={items.length}
                readOnly={readOnly}
                isFavorite={!!it.productId && favSet.has(it.productId)}
                onFavorite={it.productId ? () => toggleFavorite(db, session.tenantId, session.userId, it.productId!, shortcutForFavorite(it)) : undefined}
                onChange={(n) => setItems((its) => its.map((x) => (x.id === it.id ? n : x)))}
                onRemove={() => setItems((its) => its.filter((x) => x.id !== it.id))}
                onMove={(dir) => setItems((its) => { const n = [...its]; const j = i + dir; [n[i], n[j]] = [n[j]!, n[i]!]; return n; })}
                instructionSnippets={snippets.map((s) => s.t)}
                warning={safety.byItem[it.id]?.join(" · ")}
              />
            ))}
            {!items.length && <li className="rounded border border-dashed border-slate-300 p-2.5 text-center text-sm text-slate-400">No medicines yet</li>}
          </ol>
          <section className="space-y-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note / letter (printed under the medicines)</h3>
              {!readOnly && (
                <button type="button" className="btn-ghost ml-auto text-xs" data-testid="referral-reply"
                  onClick={() => update((d) => ({ ...d, rxNote: d.rxNote?.trim() ? `${d.rxNote}\n\n${referralReply(d)}` : referralReply(d) }))}>
                  Referral reply
                </button>
              )}
            </div>
            <textarea className="input" rows={doc.rxNote ? 5 : 2} disabled={readOnly} value={doc.rxNote ?? ""} data-testid="rx-note"
              onChange={(e) => update((d) => ({ ...d, rxNote: e.target.value || undefined }))} placeholder="Dear Dr. …, Thank you for the referral…" />
          </section>
          <ChipList title="উপদেশ — Advice" values={doc.advice} onChange={(v) => update((d) => ({ ...d, advice: v }))}
            query={libQuery("advice_snippet", "text_bn", "text_bn", "text_en")} params={spec} testId="advice-input" multiline voice />
          <section className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">পুনরায় সাক্ষাৎ — Follow-up</h3>
            <select className="input w-auto" disabled={readOnly} value={fu.kind} aria-label="Follow-up"
              onChange={(e) => update((d) => ({ ...d, followUp: e.target.value === "after" ? { kind: "after", value: 7, unit: "day" } : e.target.value === "date" ? { kind: "date", date: "" } : { kind: "none" } }))}>
              <option value="none">None</option><option value="after">After…</option><option value="date">On date</option>
            </select>
            {fu.kind === "after" && (
              <>
                <input className="input w-16" inputMode="numeric" disabled={readOnly} value={fu.value} onChange={(e) => update((d) => ({ ...d, followUp: { ...fu, value: Number(e.target.value.replace(/\D/g, "")) || 1 } }))} aria-label="Follow-up after" />
                <select className="input w-auto" disabled={readOnly} value={fu.unit} onChange={(e) => update((d) => ({ ...d, followUp: { ...fu, unit: e.target.value as "day" } }))}>
                  <option value="day">দিন</option><option value="week">সপ্তাহ</option><option value="month">মাস</option>
                </select>
              </>
            )}
            {fu.kind === "date" && <input type="date" className="input w-auto" disabled={readOnly} value={fu.date} onChange={(e) => update((d) => ({ ...d, followUp: { kind: "date", date: e.target.value } }))} />}
          </section>
        </div>
      </div>

      {error && <p className="alert-danger" role="alert">{error}</p>}

      {/* Mobile / narrow: actions stay under the editor. Wide screens use the right panel footer. */}
      <div className="sticky bottom-0 z-20 -mx-1 mt-1.5 border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur print:hidden xl:hidden">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {readOnly ? (
            <>
              <button className="btn-secondary" onClick={editAsNewVersion}>Edit (v{rx.version + 1})</button>
              <Link to={`/rx/${prescriptionId}/print`} className="btn-primary">Print / PDF</Link>
            </>
          ) : (
            <>
              <Link to={`/rx/${prescriptionId}/print`} className="btn-secondary" title="Ctrl+P">Preview</Link>
              <button
                className="btn-primary"
                onClick={() => void finalize()}
                disabled={!!safety.blockers.length}
                data-testid="finalize-mobile"
                title="Ctrl+Enter"
              >
                Finalise & print
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visit screen
// ---------------------------------------------------------------------------

/** Visit type, plus a one-click "report showing — free" when the chamber's free window applies. */
function VisitTypeControl({ encounterId, patientId, visitDate, chamberId, visitType }: { encounterId: string; patientId: string; visitDate: string; chamberId: string | null; visitType: VisitType | null }) {
  const db = usePowerSync();
  const { data: chambers } = useQuery<{ free_report_days: number | null; schedule: string | null }>("SELECT free_report_days, schedule FROM chamber WHERE id = ?", [chamberId ?? ""]);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    lastConsultationDate(db, patientId, visitDate).then(setLast);
  }, [db, patientId, visitDate]);
  const ch = chambers[0];
  const free = inFreeReportWindow(last, visitDate, ch?.free_report_days, chamberWorkdays(parseJson<ChamberSlot[]>(ch?.schedule, [])));
  return (
    <>
      <select className="input w-auto text-xs" value={visitType ?? ""} aria-label="Visit type" data-testid="visit-type"
        onChange={(e) => saveVisitType(db, encounterId, e.target.value as VisitType)}>
        {!visitType && <option value="">Visit type…</option>}
        <option value="new">New</option><option value="followup">Follow-up</option><option value="report">Report showing</option>
      </select>
      {free && visitType !== "report" && (
        <button type="button" className="badge bg-green-100 text-green-800" data-testid="free-report"
          title={`Last consultation ${last}; this chamber shows reports free within ${ch?.free_report_days} working days`}
          onClick={() => saveVisitType(db, encounterId, "report", 0)}>
          Report showing — free (seen {last})
        </button>
      )}
    </>
  );
}

export function VisitScreen({ encounterId, tab = "rx" }: { encounterId: string; tab?: "rx" | "reports" }) {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const [rxActions, setRxActions] = useState<VisitRxActions | null>(null);
  const { data: encs } = useQuery<{ id: string; patient_id: string; status: string; vitals: string; visit_date: string; serial_no: number; specialty_code: string; doctor_user_id: string; fee: number | null; chamber_id: string | null; visit_type: VisitType | null }>(
    "SELECT id, patient_id, status, vitals, visit_date, serial_no, specialty_code, doctor_user_id, fee, chamber_id, visit_type FROM encounter WHERE id = ?",
    [encounterId],
  );
  const enc = encs[0];
  const { data: pts } = useQuery<{ id: string; name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null; allergies: string | null; pregnancy_status: string | null }>(
    "SELECT id, name, dob, sex, mobile, code, allergies, pregnancy_status FROM patient WHERE id = ?",
    [enc?.patient_id ?? ""],
  );
  const p = pts[0];
  const params = new URLSearchParams(typeof window !== "undefined" ? (window.location.hash.split("?")[1] ?? "") : "");
  const explicitRx = params.get("rx");
  /** Coming back from printing: open the next version for editing instead of the locked printed one. */
  const resumeEdit = params.get("edit") === "1" || resumeEditAfterPrint.has(encounterId);
  const resuming = useRef(false);
  const { data: rxs } = useQuery<{ id: string; status: string; version: number }>(
    "SELECT id, status, version FROM prescription WHERE encounter_id = ? ORDER BY version DESC",
    [encounterId],
  );
  const isDoctor = session.tenantRole === "doctor";
  const [rxId, setRxId] = useState<string | null>(null);
  const qs = typeof window !== "undefined" ? (window.location.hash.split("?")[1] ?? "") : "";
  const rxQuery = qs ? `?${qs}` : "";

  useEffect(() => {
    if (!enc || !isDoctor) return;
    if (resumeEdit && !explicitRx && rxs[0]?.status === "final") {
      if (resuming.current) return;
      resuming.current = true;
      resumeEditAfterPrint.clear(encounterId);
      // Reuses a draft already open for this visit, so a reload or a second Back never adds versions.
      void newVersion(db, rxs[0].id).then(setRxId);
      return;
    }
    const pick = explicitRx ?? rxs[0]?.id ?? null;
    if (pick) setRxId(pick);
    else if (enc.status !== "cancelled") ensureDraft(db, encounterId, session.userId).then(setRxId);
  }, [enc?.id, rxs.length, rxs[0]?.status, explicitRx, resumeEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enc || !p) return <div className="text-sm text-slate-500">Loading visit…</div>;
  const allergies = parseJson<string[]>(p.allergies, []);
  const vitals = parseJson<Vitals>(enc.vitals, {});
  const age = ageParts(p.dob);
  const tabClass = (on: boolean) =>
    `rounded px-3 py-1.5 text-sm whitespace-nowrap ${on ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`;

  const patientCard = (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white" data-testid="visit-patient">
      <div className="flex items-center justify-between gap-1.5 border-b border-brand-100 bg-brand-50/80 px-2 py-1">
        <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">#{enc.serial_no}</span>
        <span className="text-[11px] tabular-nums text-slate-500">{enc.visit_date}</span>
      </div>
      <div className="space-y-1.5 p-2">
        <div>
          <Link to={`/patients/${p.id}`} className="block text-[15px] font-semibold leading-tight text-brand-700 hover:underline">
            {p.name}
          </Link>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {ageLabel(p.dob)} · {p.sex ?? "—"} · {p.mobile}
            <span className="block text-slate-400">{p.code ?? "ID pending"}</span>
          </p>
        </div>
        {(allergies.length > 0 || (p.pregnancy_status && p.pregnancy_status !== "none")) && (
          <div className="flex flex-wrap gap-1">
            {allergies.length > 0 && <span className="badge bg-red-100 text-alert">⚠ {allergies.join(", ")}</span>}
            {p.pregnancy_status && p.pregnancy_status !== "none" && (
              <span className="badge bg-sakura-100 text-sakura-600">
                {p.pregnancy_status === "both" ? "Pregnant + lactating" : p.pregnancy_status === "pregnant" ? "Pregnant" : "Lactating"}
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1 border-t border-slate-100 pt-1.5">
          <span className="text-[11px] font-medium text-slate-500">Fee ৳</span>
          <input
            className="input h-7 w-full py-0.5 text-sm"
            inputMode="numeric"
            defaultValue={enc.fee ?? ""}
            key={`fee-${enc.id}-${enc.fee}`}
            data-testid="visit-fee"
            onBlur={(e) => saveFee(db, encounterId, e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)}
          />
          <span className="text-[11px] font-medium text-slate-500">Type</span>
          <div className="min-w-0 [&_select]:w-full [&_select]:text-xs">
            <VisitTypeControl
              encounterId={encounterId}
              patientId={p.id}
              visitDate={enc.visit_date}
              chamberId={enc.chamber_id}
              visitType={enc.visit_type}
            />
          </div>
        </div>
        {rxs.length > 1 && (
          <select className="input h-7 w-full py-0.5 text-xs" value={rxId ?? ""} onChange={(e) => setRxId(e.target.value)} aria-label="Version">
            {rxs.map((r) => (
              <option key={r.id} value={r.id}>
                v{r.version} · {r.status}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );

  const sidePanel = (
    <VisitSidePanel
      patientId={p.id}
      encounterId={encounterId}
      allergies={allergies}
      pregnancyStatus={p.pregnancy_status}
      patientCard={patientCard}
      actions={rxActions}
    />
  );

  return (
    <div className="grid min-h-0 flex-1 gap-2 overflow-hidden xl:h-full xl:grid-cols-[minmax(0,1fr)_16.5rem] xl:grid-rows-1">
      <div className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden">
        {/* Narrow screens: patient sits above the editor (wide screens use the right rail). */}
        <div className="shrink-0 xl:hidden">{patientCard}</div>
        {tab === "reports" ? (
          <>
            <div className="card flex items-center p-1.5">
              <nav
                className="flex w-fit shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5"
                aria-label="Visit sections"
                data-testid="visit-tabs"
              >
                <Link to={`/visit/${encounterId}${rxQuery}`} className={tabClass(false)} data-testid="visit-tab-rx">
                  Prescription
                </Link>
                <Link to={`/visit/${encounterId}/reports`} className={tabClass(true)} data-testid="visit-tab-reports">
                  Reports
                </Link>
              </nav>
            </div>
            <div className="card p-2.5">
              <LabReports encounterId={encounterId} patientId={p.id} sex={(p.sex as Sex | null) ?? null} />
            </div>
          </>
        ) : (
          <>
            <div className="card flex shrink-0 flex-col gap-2 p-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <nav
                className="flex w-fit shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5"
                aria-label="Visit sections"
                data-testid="visit-tabs"
              >
                <Link to={`/visit/${encounterId}${rxQuery}`} className={tabClass(true)} data-testid="visit-tab-rx">
                  Prescription
                </Link>
                <Link to={`/visit/${encounterId}/reports`} className={tabClass(false)} data-testid="visit-tab-reports">
                  Reports
                </Link>
              </nav>
              <div className="min-w-0 sm:ml-auto">
                <VitalsPanel encounterId={encounterId} initial={vitals} readOnly={enc.status === "done" && !isDoctor} />
              </div>
            </div>
            {isDoctor ? (
              rxId ? (
                <RxEditor
                  key={rxId}
                  prescriptionId={rxId}
                  encounterId={encounterId}
                  specialtyCode={profile?.specialty_code ?? enc.specialty_code}
                  patient={{
                    id: p.id,
                    allergies,
                    ageYears: age?.years ?? null,
                    sex: (p.sex as PatientCtx["sex"]) ?? null,
                    pregnancyStatus: (p.pregnancy_status as PatientCtx["pregnancyStatus"]) ?? null,
                  }}
                  vitals={vitals}
                  onActionsChange={setRxActions}
                />
              ) : (
                <div className="text-sm text-slate-500">Preparing prescription…</div>
              )
            ) : (
              <div className="card p-2.5 text-sm text-slate-600">
                Vitals are saved automatically. The doctor will write the prescription.
                <div className="mt-1.5">
                  <Link to="/" className="btn-secondary">
                    Back to queue
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="shrink-0 xl:hidden">
        <details className="card group" data-testid="visit-context-mobile">
          <summary className="cursor-pointer list-none px-2.5 py-2 text-sm font-medium text-slate-700">
            History & labs
            {allergies.length > 0 && <span className="ml-2 badge bg-red-100 text-alert">Allergy</span>}
            <span className="float-right text-xs font-normal text-slate-400 group-open:hidden">Show</span>
          </summary>
          <div className="border-t border-slate-100 p-2">
            <VisitSidePanel
              patientId={p.id}
              encounterId={encounterId}
              allergies={allergies}
              pregnancyStatus={p.pregnancy_status}
              actions={rxActions}
              testIdSuffix="-context"
            />
          </div>
        </details>
      </div>
      <div className="hidden min-h-0 xl:flex xl:flex-col">{sidePanel}</div>
    </div>
  );
}
