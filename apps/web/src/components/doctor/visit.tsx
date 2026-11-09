"use client";

import { useSession } from "@/lib/doctor/context";
import {
  applyTemplate,
  clearTemplate,
  COMPLAINT_SUGGESTIONS_QUERY,
  emptyDoc,
  ensureDraft,
  finalizePrescription,
  lastConsultationDate,
  lastFinalDoc,
  hiddenTemplateIds,
  newVersion,
  saveDoctorComplaint,
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
import { useMyProfile } from "@/lib/doctor/hooks";
import { PrescriptionLoading } from "@/components/loading-states";
import { SaveButton } from "@/components/save-button";
import { Link, navigate } from "@/lib/doctor/router";
import { checkSafety, type SafetyResult } from "@/lib/doctor/safety";
import {
  ageLabel,
  ageParts,
  parseJson,
  resumeEditAfterPrint,
  uuid,
} from "@/lib/doctor/util";
import { usePowerSync, useQuery } from "@powersync/react";
import {
  bmi,
  chamberWorkdays,
  classifyDosageForm,
  inFreeReportWindow,
  parseShortcut,
  type ChamberSlot,
  type PrescriptionDoc,
  type RxItem,
  type Sex,
  type Vitals,
} from "@rx/core";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChipList } from "./chips";
import { KeyValueList } from "./kv-list";
import { LabReports } from "./lab-reports";
import { MedicineSearch } from "./med-search";
import { NewPatientModal } from "./patient-form";
import { RxItemRow } from "./rx-item";
import { SpecialtyExam } from "./specialty-exam";
import { VisitPaneProvider, VisitSection } from "./visit-section";
import { VisitSidePanel, type VisitRxActions } from "./visit-side-panel";

function goVisitBack() {
  if (typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
    return;
  }
  navigate("/sakura-web");
}

function VisitBackButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={goVisitBack}
      data-testid="visit-back"
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Back
    </button>
  );
}

// ---------------------------------------------------------------------------
// Vitals (assistant or doctor)
// ---------------------------------------------------------------------------

function VitalsPanel({
  encounterId,
  initial,
  readOnly,
  embedded = false,
}: {
  encounterId: string;
  initial: Vitals;
  readOnly: boolean;
  /** Inside the patient card on tablet and phone. No section chrome, and no test ids (the editor copy keeps those). */
  embedded?: boolean;
}) {
  const db = usePowerSync();
  const [v, setV] = useState<Vitals>(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Vitals | null>(null);
  const incoming = JSON.stringify(initial);
  // The card and the editor each have a copy. Adopt a save from the other one when this copy is not mid-edit.
  useEffect(() => {
    if (!pending.current) setV(JSON.parse(incoming) as Vitals);
  }, [incoming]);
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
  const field = (k: keyof Vitals, label: string) => (
    <label className={`flex min-w-0 flex-col font-medium text-slate-500 ${embedded ? "text-[10px] leading-none lg:flex-1" : "w-[4.25rem] shrink-0 text-[11px]"}`}>
      {label}
      <input
        className={`input w-full min-w-0 px-1 py-0.5 tabular-nums ${embedded ? "mt-0.5 h-7 text-xs" : "h-7 text-sm"}`}
        inputMode="decimal"
        disabled={readOnly}
        value={v[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        data-testid={embedded ? undefined : `vital-${k}`}
      />
    </label>
  );
  const b = bmi(v.weightKg, v.heightCm);
  const filled = [
    v.bpSystolic,
    v.bpDiastolic,
    v.pulse,
    v.tempF,
    v.spo2,
    v.respRate,
    v.weightKg,
    v.heightCm,
  ].filter((x) => x != null).length;
  const fields = (
    <>
      <div className={embedded ? "grid grid-cols-4 items-end gap-1 lg:flex lg:flex-nowrap" : "flex flex-wrap items-end gap-1.5"}>
        <label className={`flex min-w-0 flex-col font-medium text-slate-500 ${embedded ? "col-span-2 text-[10px] leading-none lg:col-span-1 lg:flex-[1.55]" : "w-[7.25rem] shrink-0 text-[11px]"}`}>
          BP
          <span className={`flex items-center gap-0.5 ${embedded ? "mt-0.5" : ""}`}>
            <input
              className={`input min-w-0 flex-1 px-1 py-0.5 tabular-nums ${embedded ? "h-7 text-xs" : "h-7 text-sm"}`}
              inputMode="numeric"
              disabled={readOnly}
              value={v.bpSystolic ?? ""}
              onChange={(e) => set("bpSystolic", e.target.value)}
              aria-label="Systolic"
            />
            <span className="shrink-0 text-slate-300">/</span>
            <input
              className={`input min-w-0 flex-1 px-1 py-0.5 tabular-nums ${embedded ? "h-7 text-xs" : "h-7 text-sm"}`}
              inputMode="numeric"
              disabled={readOnly}
              value={v.bpDiastolic ?? ""}
              onChange={(e) => set("bpDiastolic", e.target.value)}
              aria-label="Diastolic"
            />
          </span>
        </label>
        {field("pulse", "Pulse")}
        {field("tempF", "Temp °F")}
        {field("spo2", "SpO₂")}
        {field("respRate", "RR")}
        {field("weightKg", "Wt")}
        {field("heightCm", "Ht")}
      </div>
      {b && !embedded && (
        <p className="mt-1 text-[11px] tabular-nums text-slate-500">BMI {b}</p>
      )}
    </>
  );
  if (embedded) {
    return (
      <div className="flex items-end gap-1 xl:hidden" data-testid="visit-oe-card">
        <div className="min-w-0 flex-1">{fields}</div>
        {b && (
          <span className="shrink-0 pb-1 text-[10px] font-medium tabular-nums text-slate-500">
            BMI {b}
          </span>
        )}
      </div>
    );
  }
  return (
    <VisitSection
      id="vitals"
      title="O/E — Vitals"
      badge={filled || (b ? `BMI ${b}` : null)}
      className="max-xl:hidden lg:col-span-2"
      inline
    >
      {fields}
    </VisitSection>
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
    // A doctor-added medicine is not a catalogue product yet; finalising links prescription_item to products only.
    productId: m.custom_status ? null : m.id,
    ...(m.custom_status ? { customMedicineId: m.id } : {}),
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
  if (unit === "drop")
    Object.assign(base, {
      doseQty: 2,
      frequency: { kind: "times_per_day", times: 3 },
    });
  else if (unit === "spray" || unit === "puff")
    Object.assign(base, {
      doseQty: 2,
      frequency: { kind: "times_per_day", times: 2 },
    });
  else if (unit === "tsf")
    Object.assign(base, {
      doseQty: 1,
      frequency: { kind: "pattern", slots: [1, 1, 1] },
    });
  else if (unit === "application")
    Object.assign(base, {
      frequency: { kind: "times_per_day", times: 2 },
      timing: "none",
    });
  // A favourite remembers the doctor's usual dose for this product.
  if (m.favorite_shortcut) {
    const p = parseShortcut(m.favorite_shortcut);
    Object.assign(
      base,
      Object.fromEntries(
        Object.entries(p).filter(
          ([k, v]) => k !== "unknown" && v !== undefined,
        ),
      ),
    );
  }
  return base;
}

function shortcutForFavorite(it: RxItem): string {
  const f = it.frequency;
  const parts: string[] = [];
  if (it.doseQty && it.doseUnit && !["tab", "cap"].includes(it.doseUnit))
    parts.push(`${it.doseQty} ${it.doseUnit}`);
  if (f.kind === "pattern") parts.push(f.slots.join("+"));
  else if (f.kind === "times_per_day")
    parts.push({ 1: "od", 2: "bd", 3: "tds", 4: "qds" }[f.times] ?? "tds");
  if (it.timing && it.timing !== "none")
    parts.push(
      {
        after_food: "af",
        before_food: "bf",
        with_food: "wf",
        empty_stomach: "es",
        bedtime: "hs",
        none: "",
      }[it.timing],
    );
  if (it.duration.kind === "fixed")
    parts.push(`${it.duration.value}${it.duration.unit[0]}`);
  if (it.duration.kind === "continue") parts.push("cont");
  return parts.join(" ");
}

/**
 * History suggestions for ChipList, params [specialty, doctor, patient, LIKE pattern]. This patient's earlier
 * lines come first (chronic history repeats every visit), then this doctor's own lines by how often they were
 * used, then the whole history library (specialty rows, then general ones), so the dropdown scrolls through it.
 */
const HISTORY_QUERY = `
  SELECT value AS label, value, CASE min(rank) WHEN 0 THEN 'previous visit' WHEN 1 THEN 'yours' ELSE max(category) END AS hint
  FROM (
    SELECT j.value AS value, 0 AS rank, count(*) AS uses, 0 AS ord, NULL AS category
      FROM prescription p, json_each(p.doc, '$.histories') j WHERE p.patient_id = ?3 AND j.type = 'text' GROUP BY j.value
    UNION ALL
    SELECT j.value, 1, count(*), 0, NULL
      FROM prescription p, json_each(p.doc, '$.histories') j WHERE p.doctor_user_id = ?2 AND j.type = 'text' GROUP BY j.value
    UNION ALL
    SELECT name, 2, 0, (specialty_code IS NULL) * 100000 + sort_order, category
      FROM history_item WHERE specialty_code IS NULL OR specialty_code = ?1
  )
  WHERE value LIKE ?4 AND trim(value) != ''
  GROUP BY value ORDER BY min(rank), max(uses) DESC, min(ord) LIMIT 100`;

const OE_LABELS = ["Pulse", "BP", "Anaemia", "Jaundice", "Oedema", "Cyanosis", "Heart", "Lungs", "Abdomen", "Skin condition", "Fundus", "Throat", "Lymph nodes"];

/** Builds a Plan line such as "Refd to Paediatric ophthalmology Dept., BSMMU, Dhaka — Dr. Tarek Reza Ali (01766683417)". */
function ReferralForm({ onAdd }: { onAdd: (line: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ to: "", doctor: "", phone: "" });
  if (!open)
    return (
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => setOpen(true)}
        data-testid="add-referral"
      >
        + Referral
      </button>
    );
  const add = () => {
    const where = f.to.trim() ? `Refd to ${f.to.trim()}` : "Refd to";
    const who = [f.doctor.trim(), f.phone.trim() && `(${f.phone.trim()})`]
      .filter(Boolean)
      .join(" ");
    if (f.to.trim() || who) onAdd([where, who].filter(Boolean).join(" — "));
    setF({ to: "", doctor: "", phone: "" });
    setOpen(false);
  };
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2">
      <input
        className="input"
        placeholder="Department / institution / address"
        value={f.to}
        onChange={(e) => setF({ ...f, to: e.target.value })}
        data-testid="referral-to"
      />
      <div className="flex gap-1">
        <input
          className="input flex-1"
          placeholder="Doctor (optional)"
          value={f.doctor}
          onChange={(e) => setF({ ...f, doctor: e.target.value })}
          data-testid="referral-doctor"
        />
        <input
          className="input w-36"
          placeholder="Phone (optional)"
          inputMode="tel"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
        />
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={add}
          data-testid="referral-add"
        >
          Add to plan
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Pre-filled reply letter to the referring doctor; the doctor edits it before finalising. */
function referralReply(doc: PrescriptionDoc): string {
  const to = doc.referredBy?.trim() || "Dr. ";
  const findings = doc.diagnoses.length
    ? `\n\n${doc.diagnoses.join("; ")}.`
    : "";
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
  const { data: rxRows } = useQuery<{
    id: string;
    status: string;
    doc: string;
    version: number;
  }>("SELECT id, status, doc, version FROM prescription WHERE id = ?", [
    prescriptionId,
  ]);
  const rx = rxRows[0];
  const [doc, setDoc] = useState<PrescriptionDoc | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  // Below the Ix list: where the exam's investigation sections (audiology) render.
  const [ixSlot, setIxSlot] = useState<HTMLDivElement | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const finalizingRef = useRef(false);
  /** Draft writes run one after another so a slow save cannot overlap the next one. */
  const draftSave = useRef<Promise<void>>(Promise.resolve());
  const [safety, setSafety] = useState<SafetyResult>({
    byItem: {},
    general: [],
    blockers: [],
  });
  const [error, setError] = useState<string>();
  /** Selected Apply-template value; `__none__` = clear template fields. */
  const [templateId, setTemplateId] = useState("");
  const loadedFor = useRef<string | null>(null);
  /** Ref By shows only when the prescription opened with one; it stays put if cleared while editing. */
  const [showRefBy, setShowRefBy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const readOnly = rx?.status === "final";

  // Load once per prescription; later sync echoes of our own writes must not clobber typing.
  useEffect(() => {
    if (rx && loadedFor.current !== rx.id) {
      loadedFor.current = rx.id;
      setTemplateId("");
      const loaded = { ...emptyDoc(), ...parseJson<PrescriptionDoc>(rx.doc, emptyDoc()) };
      setShowRefBy(!!loaded.referredBy?.trim());
      setDoc(loaded);
    }
  }, [rx]);

  const { data: favs } = useQuery<{ product_id: string }>(
    "SELECT product_id FROM doctor_favorite WHERE user_id = ?",
    [session.userId],
  );
  const favSet = new Set(favs.map((f) => f.product_id));
  const { data: templateRows } = useQuery<{
    id: string;
    name: string;
    payload: string;
    tenant_id: string | null;
  }>(
    "SELECT id, name, payload, tenant_id FROM rx_template WHERE is_active = 1 AND (specialty_code IS NULL OR specialty_code = ?) ORDER BY tenant_id IS NULL, name",
    [specialtyCode],
  );
  const [hiddenTemplates, setHiddenTemplates] = useState<string[]>([]);
  useEffect(() => {
    setHiddenTemplates(hiddenTemplateIds(session.userId));
  }, [session.userId]);
  const templates = templateRows.filter((t) => !hiddenTemplates.includes(t.id));
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
      if (pending.current)
        void saveDraftDoc(db, prescriptionId, pending.current);
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
        timer.current = setTimeout(() => {
          pending.current = null;
          draftSave.current = draftSave.current.then(async () => {
            if (finalizingRef.current) return;
            try {
              await saveDraftDoc(db, prescriptionId, next);
              if (!finalizingRef.current) setSaved("saved");
            } catch {
              if (!finalizingRef.current) setSaved("idle");
            }
          });
        }, 600);
        return next;
      });
    },
    [db, prescriptionId],
  );

  // Safety checks run against the local catalogue whenever items, allergies or weight change.
  const itemsKey = JSON.stringify(
    doc?.items.map((i) => [i.productId, i.frequency, i.doseQty, i.doseUnit]) ??
      [],
  );
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
  }, [
    itemsKey,
    patient.allergies.join(),
    vitals.weightKg,
    patient.ageYears,
    patient.sex,
    patient.pregnancyStatus,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalizeRef = useRef<() => void>(() => {});
  const editVersionRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "TEXTAREA" && e.key === "Enter") return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (!finalizingRef.current) finalizeRef.current();
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
      saving: finalizing,
      finalize: () => finalizeRef.current(),
      editVersion: () => editVersionRef.current(),
    });
    return () => onActionsChange(null);
  }, [
    rx?.id,
    rx?.status,
    rx?.version,
    safety.blockers.length,
    finalizing,
    prescriptionId,
    onActionsChange,
  ]);

  if (!rx || !doc)
    return <PrescriptionLoading />;

  const spec = [specialtyCode];
  const libQuery = (
    table: string,
    label: string,
    value = label,
    hint?: string,
  ) =>
    `SELECT ${label} AS label, ${value} AS value${hint ? `, ${hint} AS hint` : ""} FROM ${table}
      WHERE (specialty_code IS NULL OR specialty_code = ?) AND (${label} LIKE ?${hint ? ` OR ${hint} LIKE ?2` : ""})
      ORDER BY specialty_code IS NULL, sort_order LIMIT 12`;

  async function finalize() {
    if (!doc || readOnly || finalizingRef.current) return;
    setError(undefined);
    if (!doc.items.length) return setError("Add at least one medicine");
    const noDuration = doc.items.find(
      (i) => i.isAntibiotic && i.duration.kind !== "fixed",
    );
    if (noDuration)
      return setError(
        `Set a fixed duration for antibiotic ${noDuration.brandName}`,
      );
    if (safety.blockers.length) {
      return setError(
        safety.blockers[0] ?? "Resolve safety blockers before finalising",
      );
    }
    finalizingRef.current = true;
    setFinalizing(true);
    setSaved("saving");
    clearTimeout(timer.current);
    pending.current = null;
    try {
      await draftSave.current;
      await finalizePrescription(db, prescriptionId, doc, vitals);
      // The browser's Back from the print screen resumes editing in the next version (the link passes ?edit=1).
      resumeEditAfterPrint.set(encounterId);
      navigate(`/rx/${prescriptionId}/print`);
    } catch {
      finalizingRef.current = false;
      setFinalizing(false);
      setSaved("idle");
      setError("Could not save the prescription. Try again.");
    }
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
    if (t)
      update((d) =>
        applyTemplate(d, parseJson<TemplatePayload>(t.payload, {})),
      );
  }

  async function saveAsTemplate() {
    if (!doc || savingTemplate) return;
    const name = prompt(
      "Template name (e.g. Acute tonsillitis — adult)",
      doc.diagnoses[0] ?? "",
    );
    if (!name) return;
    const payload: TemplatePayload = {
      chiefComplaints: doc.chiefComplaints,
      investigations: doc.investigations,
      diagnoses: doc.diagnoses,
      items: doc.items,
      advice: doc.advice,
      followUp: doc.followUp,
    };
    setSavingTemplate(true);
    try {
      await saveTemplate(
        db,
        session.tenantId,
        session.userId,
        name,
        specialtyCode,
        payload,
      );
      alert("Template saved");
    } finally {
      setSavingTemplate(false);
    }
  }

  const items = doc.items;
  const setItems = (fn: (items: RxItem[]) => RxItem[]) =>
    update((d) => ({ ...d, items: fn(d.items) }));
  const fu = doc.followUp ?? { kind: "none" as const };

  return (
    <VisitPaneProvider>
    <div className="flex flex-col gap-1.5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1 xl:flex-nowrap"
        data-testid="rx-toolbar"
      >
        <VisitBackButton />
        <nav
          className="hidden shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5 xl:flex"
          aria-label="Visit sections"
          data-testid="visit-tabs"
        >
          <Link
            to={`/visit/${encounterId}`}
            className="rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-brand-700 shadow-sm"
            data-testid="visit-tab-rx"
          >
            Prescription
          </Link>
          <Link
            to={`/visit/${encounterId}/reports`}
            className="rounded-md px-2.5 py-1 text-xs whitespace-nowrap text-slate-600 hover:bg-white/60 hover:text-slate-900"
            data-testid="visit-tab-reports"
          >
            Reports
          </Link>
        </nav>
        {!readOnly ? (
          <>
            <select
              className="input h-7 min-w-0 w-full flex-1 basis-[10rem] py-0.5 text-xs xl:max-w-xs"
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
            <button
              type="button"
              className="btn-secondary h-7 shrink-0 whitespace-nowrap px-2 py-0 text-xs"
              onClick={copyLast}
            >
              Copy last Rx
            </button>
            <SaveButton
              type="button"
              className="btn-secondary h-7 shrink-0 whitespace-nowrap px-2 py-0 text-xs"
              saving={savingTemplate}
              onClick={saveAsTemplate}
            >
              Save as template
            </SaveButton>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <span
          className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-500 xl:ml-auto"
          data-testid="save-state"
          aria-live="polite"
        >
          {readOnly ? (
            `Finalised · v${rx.version}`
          ) : saved === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" aria-hidden />
              Saving…
            </span>
          ) : saved === "saved" ? (
            "Saved"
          ) : (
            `Draft v${rx.version}`
          )}
        </span>
      </div>

      {readOnly && (
        <div
          className="alert-warn flex flex-wrap items-center gap-2"
          data-testid="rx-locked"
        >
          <span>
            <b>Finalised &amp; printed (v{rx.version}).</b> Locked so the
            printed copy stays on record.
          </span>
          <button
            className="btn-primary ml-auto"
            onClick={editAsNewVersion}
            data-testid="edit-new-version"
          >
            Edit as v{rx.version + 1}
          </button>
        </div>
      )}
      {safety.blockers.map((b) => (
        <div key={b} className="alert-danger" data-testid="safety-blocker">
          <b>Blocked:</b> {b}
        </div>
      ))}
      {safety.general.map((g) => (
        <div key={g} className="alert-warn" data-testid="safety-warn">
          <b>Caution:</b> {g}
        </div>
      ))}

      {/* Phone and tablet, including landscape: natural height, the page scrolls. Laptop/desktop: columns fill the leftover height and scroll inside. */}
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] xl:min-h-0 xl:flex-1 xl:grid-rows-[auto_minmax(0,1fr)] xl:overflow-hidden">
        <VitalsPanel
          encounterId={encounterId}
          initial={vitals}
          readOnly={readOnly}
        />
        <VisitSection
          id="clinical"
          title="Clinical"
          className="xl:h-full xl:min-h-0 xl:row-start-2"
          badge={
            doc.chiefComplaints.length || doc.diagnoses.length
              ? [doc.chiefComplaints.length && `${doc.chiefComplaints.length} C/C`, doc.diagnoses.length && `${doc.diagnoses.length} Dx`].filter(Boolean).join(" · ")
              : null
          }
        >
          <div className="space-y-2.5" data-testid="rx-clinical-pane">
          {showRefBy && (
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ref By — Referring doctor
            </span>
            <input
              className="input"
              list="rx-referrers"
              disabled={readOnly}
              value={doc.referredBy ?? ""}
              placeholder="Referring doctor's name (blank: self)"
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  referredBy: e.target.value || undefined,
                }))
              }
              data-testid="ref-by"
            />
            <datalist id="rx-referrers">
              {referrers.map((r) => (
                <option key={r.r} value={r.r} />
              ))}
            </datalist>
          </label>
          )}
          <ChipList title="C/C — Chief complaints" values={doc.chiefComplaints} onChange={(v) => update((d) => ({ ...d, chiefComplaints: v }))}
            query={COMPLAINT_SUGGESTIONS_QUERY} params={spec} placeholder="Fever × 3 days" testId="cc-input" multiline voice
            saveLabel="my C/C list"
            durations
            onSaveCustom={session.tenantRole === "doctor" ? async (t) => void (await saveDoctorComplaint(db, session.tenantId, session.userId, { name: t })) : undefined} />
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
            <textarea className="input" rows={2} disabled={readOnly} value={doc.history ?? ""} onChange={(e) => update((d) => ({ ...d, history: e.target.value || undefined }))} placeholder="P/H, D/H, F/H…" />
          </section>
          <SpecialtyExam
            encounterId={encounterId}
            specialtyCode={specialtyCode}
            readOnly={readOnly}
            onFlatten={(groups, diagrams) =>
              update((d) => ({ ...d, specialtyFindings: groups, diagrams }))
            }
            ixSlot={ixSlot}
            after={{
              section: "neck",
              node: (
                <KeyValueList title="Other Findings" values={doc.oeFindings ?? []} suggestions={OE_LABELS} readOnly={readOnly}
                  onChange={(v) => update((d) => ({ ...d, oeFindings: v }))} testId="oe" />
              ),
            }}
          />
          <ChipList
            title="Ix — Investigations"
            values={doc.investigations}
            onChange={(v) => update((d) => ({ ...d, investigations: v }))}
            query={libQuery("investigation", "name", "name", "category")}
            params={spec}
            testId="ix-input"
          />
          <div ref={setIxSlot} className="empty:hidden" />
          <ChipList
            title="Dx — Diagnosis"
            values={doc.diagnoses}
            onChange={(v) => update((d) => ({ ...d, diagnoses: v }))}
            query={libQuery("diagnosis", "name", "name", "icd10")}
            params={spec}
            testId="dx-input"
          />
          <div className="space-y-1">
            <ChipList
              title="Plan — incl. referrals"
              values={doc.plan ?? []}
              onChange={(v) => update((d) => ({ ...d, plan: v }))}
              placeholder="Refd to … / Review with reports"
              testId="plan-input"
              multiline
            />
            {!readOnly && (
              <ReferralForm
                onAdd={(line) =>
                  update((d) => ({ ...d, plan: [...(d.plan ?? []), line] }))
                }
              />
            )}
          </div>
          <ChipList
            title="Note"
            values={doc.notes ?? []}
            onChange={(v) => update((d) => ({ ...d, notes: v }))}
            placeholder="Birth wt 1.7 kg / H/O PNA"
            testId="notes-input"
            multiline
          />
          </div>
        </VisitSection>

        <VisitSection
          id="medicines"
          title="℞ Medicines"
          className="xl:h-full xl:min-h-0 xl:row-start-2"
          badge={items.length || null}
        >
          <div className="space-y-2" data-testid="rx-meds-pane">
          {!readOnly && (
            <p className="text-xs text-slate-400">
              Shortcuts: 1+0+1 · tds · af/bf/es/hs · 7d/2w/1m/cont · 2 drop re/le/be
            </p>
          )}
          {!readOnly && (
            <MedicineSearch
              onPick={(m) => setItems((its) => [...its, itemFromMedicine(m)])}
            />
          )}
          <ol className="space-y-1.5">
            {items.map((it, i) => (
              <RxItemRow
                key={it.id}
                item={it}
                index={i}
                count={items.length}
                readOnly={readOnly}
                isFavorite={!!it.productId && favSet.has(it.productId)}
                onFavorite={
                  it.productId
                    ? () =>
                        toggleFavorite(
                          db,
                          session.tenantId,
                          session.userId,
                          it.productId!,
                          shortcutForFavorite(it),
                        )
                    : undefined
                }
                onChange={(n) =>
                  setItems((its) => its.map((x) => (x.id === it.id ? n : x)))
                }
                onRemove={() =>
                  setItems((its) => its.filter((x) => x.id !== it.id))
                }
                onMove={(dir) =>
                  setItems((its) => {
                    const n = [...its];
                    const j = i + dir;
                    [n[i], n[j]] = [n[j]!, n[i]!];
                    return n;
                  })
                }
                instructionSnippets={snippets.map((s) => s.t)}
                warning={safety.byItem[it.id]?.join(" · ")}
              />
            ))}
            {!items.length && (
              <li className="rounded border border-dashed border-slate-300 p-2.5 text-center text-sm text-slate-400">
                No medicines yet
              </li>
            )}
          </ol>
          <section className="space-y-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Note / letter (printed under the medicines)
              </h3>
              {!readOnly && (
                <button
                  type="button"
                  className="btn-ghost ml-auto text-xs"
                  data-testid="referral-reply"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      rxNote: d.rxNote?.trim()
                        ? `${d.rxNote}\n\n${referralReply(d)}`
                        : referralReply(d),
                    }))
                  }
                >
                  Referral reply
                </button>
              )}
            </div>
            <textarea
              className="input"
              rows={doc.rxNote ? 5 : 2}
              disabled={readOnly}
              value={doc.rxNote ?? ""}
              data-testid="rx-note"
              onChange={(e) =>
                update((d) => ({ ...d, rxNote: e.target.value || undefined }))
              }
              placeholder="Dear Dr. …, Thank you for the referral…"
            />
          </section>
          <ChipList
            title="উপদেশ — Advice"
            values={doc.advice}
            onChange={(v) => update((d) => ({ ...d, advice: v }))}
            query={libQuery("advice_snippet", "text_bn", "text_bn", "text_en")}
            params={spec}
            testId="advice-input"
            multiline
            voice
          />
          <section className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              পুনরায় সাক্ষাৎ — Follow-up
            </h3>
            <select
              className="input w-auto"
              disabled={readOnly}
              value={fu.kind}
              aria-label="Follow-up"
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  followUp:
                    e.target.value === "after"
                      ? { kind: "after", value: 7, unit: "day" }
                      : e.target.value === "date"
                        ? { kind: "date", date: "" }
                        : { kind: "none" },
                }))
              }
            >
              <option value="none">None</option>
              <option value="after">After…</option>
              <option value="date">On date</option>
            </select>
            {fu.kind === "after" && (
              <>
                <input
                  className="input w-16"
                  inputMode="numeric"
                  disabled={readOnly}
                  value={fu.value}
                  onChange={(e) =>
                    update((d) => ({
                      ...d,
                      followUp: {
                        ...fu,
                        value: Number(e.target.value.replace(/\D/g, "")) || 1,
                      },
                    }))
                  }
                  aria-label="Follow-up after"
                />
                <select
                  className="input w-auto"
                  disabled={readOnly}
                  value={fu.unit}
                  onChange={(e) =>
                    update((d) => ({
                      ...d,
                      followUp: { ...fu, unit: e.target.value as "day" },
                    }))
                  }
                >
                  <option value="day">দিন</option>
                  <option value="week">সপ্তাহ</option>
                  <option value="month">মাস</option>
                </select>
              </>
            )}
            {fu.kind === "date" && (
              <input
                type="date"
                className="input w-auto"
                disabled={readOnly}
                value={fu.date}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    followUp: { kind: "date", date: e.target.value },
                  }))
                }
              />
            )}
          </section>
          </div>
        </VisitSection>
      </div>

      {error && (
        <p className="alert-danger" role="alert">
          {error}
        </p>
      )}

      {/* Mobile / narrow: actions stay under the editor. Wide screens use the right panel footer. */}
      <div className="sticky bottom-0 z-20 -mx-1 mt-1.5 border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur print:hidden xl:hidden">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {readOnly ? (
            <>
              <button className="btn-secondary" onClick={editAsNewVersion}>
                Edit (v{rx.version + 1})
              </button>
              <Link to={`/rx/${prescriptionId}/print`} className="btn-primary">
                Print / PDF
              </Link>
            </>
          ) : (
            <>
              <Link
                to={`/rx/${prescriptionId}/print`}
                className="btn-secondary"
                title="Ctrl+P"
              >
                Preview
              </Link>
              <button
                className="btn-primary"
                onClick={() => void finalize()}
                disabled={!!safety.blockers.length || finalizing}
                aria-busy={finalizing}
                data-testid="finalize-mobile"
                title="Ctrl+Enter"
              >
                {finalizing ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    Saving…
                  </span>
                ) : (
                  "Finalise & print"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </VisitPaneProvider>
  );
}

// ---------------------------------------------------------------------------
// Visit screen
// ---------------------------------------------------------------------------

/** Visit type, plus a one-click "report showing — free" when the chamber's free window applies. */
function VisitTypeControl({
  encounterId,
  patientId,
  visitDate,
  chamberId,
  visitType,
  fee,
}: {
  encounterId: string;
  patientId: string;
  visitDate: string;
  chamberId: string | null;
  visitType: VisitType | null;
  fee: number | null;
}) {
  const db = usePowerSync();
  const { data: chambers } = useQuery<{
    free_report_days: number | null;
    report_fee: number | null;
    schedule: string | null;
  }>("SELECT free_report_days, report_fee, schedule FROM chamber WHERE id = ?", [
    chamberId ?? "",
  ]);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    lastConsultationDate(db, patientId, visitDate).then(setLast);
  }, [db, patientId, visitDate]);
  const ch = chambers[0];
  const free = inFreeReportWindow(
    last,
    visitDate,
    ch?.free_report_days,
    chamberWorkdays(parseJson<ChamberSlot[]>(ch?.schedule, [])),
  );
  const seeded = useRef(false);
  // Report visits pick up this chamber's report fee (৳0 inside the free window).
  // Any visit whose fee is still empty shows that same fee, so the amount set in Settings appears on the card.
  useEffect(() => {
    if (!ch) return;
    if (visitType === "report") {
      const next = free ? 0 : ch.report_fee;
      if (next == null || next === fee) return;
      if (fee != null && !free) return;
      seeded.current = true;
      void saveFee(db, encounterId, next);
      return;
    }
    if (seeded.current || fee != null || ch.report_fee == null) return;
    seeded.current = true;
    void saveFee(db, encounterId, ch.report_fee);
  }, [visitType, ch, fee, free, db, encounterId]);
  return (
    <>
      <select
        className="input w-auto text-xs"
        value={visitType ?? ""}
        aria-label="Visit type"
        data-testid="visit-type"
        onChange={(e) => {
          const next = e.target.value as VisitType;
          if (next === "report") {
            const fee = free ? 0 : ch?.report_fee;
            void saveVisitType(db, encounterId, next, fee == null ? undefined : fee);
          } else void saveVisitType(db, encounterId, next);
        }}
      >
        {!visitType && <option value="">Visit type…</option>}
        <option value="new">New</option>
        <option value="followup">Follow-up</option>
        <option value="report">Report showing</option>
      </select>
      {free && visitType !== "report" && (
        <button
          type="button"
          className="badge bg-green-100 text-green-800"
          data-testid="free-report"
          title={`Last consultation ${last}; this chamber shows reports free within ${ch?.free_report_days} working days`}
          onClick={() => saveVisitType(db, encounterId, "report", 0)}
        >
          Report showing — free (seen {last})
        </button>
      )}
    </>
  );
}

export function VisitScreen({
  encounterId,
  tab = "rx",
}: {
  encounterId: string;
  tab?: "rx" | "reports";
}) {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const [rxActions, setRxActions] = useState<VisitRxActions | null>(null);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const { data: encs } = useQuery<{
    id: string;
    patient_id: string;
    status: string;
    vitals: string;
    visit_date: string;
    serial_no: number;
    specialty_code: string;
    doctor_user_id: string;
    fee: number | null;
    chamber_id: string | null;
    visit_type: VisitType | null;
  }>(
    "SELECT id, patient_id, status, vitals, visit_date, serial_no, specialty_code, doctor_user_id, fee, chamber_id, visit_type FROM encounter WHERE id = ?",
    [encounterId],
  );
  const enc = encs[0];
  const { data: pts } = useQuery<{
    id: string;
    name: string;
    dob: string | null;
    sex: string | null;
    mobile: string | null;
    code: string | null;
    allergies: string | null;
    pregnancy_status: string | null;
  }>(
    "SELECT id, name, dob, sex, mobile, code, allergies, pregnancy_status FROM patient WHERE id = ?",
    [enc?.patient_id ?? ""],
  );
  const p = pts[0];
  const params = new URLSearchParams(
    typeof window !== "undefined"
      ? (window.location.hash.split("?")[1] ?? "")
      : "",
  );
  const explicitRx = params.get("rx");
  /** Coming back from printing: open the next version for editing instead of the locked printed one. */
  const resumeEdit =
    params.get("edit") === "1" || resumeEditAfterPrint.has(encounterId);
  const resuming = useRef(false);
  const { data: rxs } = useQuery<{
    id: string;
    status: string;
    version: number;
  }>(
    "SELECT id, status, version FROM prescription WHERE encounter_id = ? ORDER BY version DESC",
    [encounterId],
  );
  const isDoctor = session.tenantRole === "doctor";
  const [rxId, setRxId] = useState<string | null>(null);
  const qs =
    typeof window !== "undefined"
      ? (window.location.hash.split("?")[1] ?? "")
      : "";
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
    else if (enc.status !== "cancelled")
      ensureDraft(db, encounterId, session.userId).then(setRxId);
  }, [enc?.id, rxs.length, rxs[0]?.status, explicitRx, resumeEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enc || !p)
    return <PrescriptionLoading label="Loading visit" />;
  const allergies = parseJson<string[]>(p.allergies, []);
  const vitals = parseJson<Vitals>(enc.vitals, {});
  const age = ageParts(p.dob);
  const tabClass = (on: boolean) =>
    `rounded-md px-3.5 py-2 text-sm whitespace-nowrap ${on ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"}`;

  const newPatientButton = (className: string) => (
    <button
      type="button"
      className={className}
      data-testid="visit-new-patient"
      onClick={() => setNewPatientOpen(true)}
    >
      + New patient
    </button>
  );

  const railBtn =
    "flex w-full min-h-0 flex-1 basis-0 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-center text-xs font-semibold leading-tight";
  const sectionTabClass = (on: boolean) =>
    `${railBtn} border ${on ? "border-brand-700 bg-brand-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"}`;

  const patientInfo = (
      <section
        className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-white"
        data-testid="visit-patient"
      >
        <div className="hidden items-center justify-between gap-1.5 border-b border-brand-100 bg-brand-50/80 px-2 py-1 xl:flex">
          <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            #{enc.serial_no}
          </span>
          <span className="text-[11px] tabular-nums text-slate-500">
            {enc.visit_date}
          </span>
        </div>
        <div className="space-y-1 px-2 py-1 xl:space-y-1.5 xl:p-2">
          <div className="grid grid-cols-2 items-start gap-2 xl:grid-cols-1 xl:gap-1.5">
          <div className="min-w-0">
            <div className="mb-0.5 flex h-4 items-center xl:hidden">
              <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                #{enc.serial_no}
              </span>
            </div>
            <Link
              to={`/patients/${p.id}`}
              className="block truncate text-sm font-semibold leading-none text-brand-700 hover:underline xl:text-[15px] xl:leading-tight"
            >
              {p.name}
            </Link>
            <p className="mt-px truncate text-[11px] leading-none text-slate-500 xl:mt-0.5 xl:leading-snug">
              {ageLabel(p.dob)} · {p.sex ?? "—"} · {p.mobile}
            </p>
            <p className="truncate text-[11px] leading-none text-slate-400 xl:leading-normal">
              {p.code ?? "ID pending"}
            </p>
          </div>
          <div className="min-w-0">
            <div className="mb-0.5 flex h-4 items-center justify-end xl:hidden">
              <span className="text-[11px] tabular-nums text-slate-500">
                {enc.visit_date}
              </span>
            </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="min-w-0">
              <span className="label mb-0 text-[10px]">{enc.visit_type === "report" ? "Report fee ৳" : "Fee ৳"}</span>
              <input
                className="input h-6 w-full py-0.5 text-sm tabular-nums xl:h-7"
                inputMode="numeric"
                defaultValue={enc.fee ?? ""}
                key={`fee-${enc.id}-${enc.fee}`}
                data-testid="visit-fee"
                onBlur={(e) =>
                  saveFee(
                    db,
                    encounterId,
                    e.target.value
                      ? Number(e.target.value.replace(/\D/g, ""))
                      : null,
                  )
                }
              />
            </label>
            <label className="min-w-0">
              <span className="label mb-0 text-[10px]">Type</span>
              <div className="flex flex-col gap-0.5 [&_select]:h-6 [&_select]:w-full [&_select]:py-0.5 [&_select]:text-xs xl:[&_select]:h-7">
                  <VisitTypeControl
                  encounterId={encounterId}
                  patientId={p.id}
                  visitDate={enc.visit_date}
                  chamberId={enc.chamber_id}
                  visitType={enc.visit_type}
                  fee={enc.fee}
                />
              </div>
            </label>
          </div>
          </div>
          </div>
          <VitalsPanel
            encounterId={encounterId}
            initial={vitals}
            readOnly={enc.status === "done"}
            embedded
          />
          {(allergies.length > 0 ||
            (p.pregnancy_status && p.pregnancy_status !== "none")) && (
            <div className="flex flex-wrap gap-1">
              {allergies.length > 0 && (
                <span className="badge bg-red-100 text-alert">
                  ⚠ {allergies.join(", ")}
                </span>
              )}
              {p.pregnancy_status && p.pregnancy_status !== "none" && (
                <span className="badge bg-sakura-100 text-sakura-600">
                  {p.pregnancy_status === "both"
                    ? "Pregnant + lactating"
                    : p.pregnancy_status === "pregnant"
                      ? "Pregnant"
                      : "Lactating"}
                </span>
              )}
            </div>
          )}
          {rxs.length > 1 && (
            <select
              className="input h-7 w-full py-0.5 text-xs"
              value={rxId ?? ""}
              onChange={(e) => setRxId(e.target.value)}
              aria-label="Version"
            >
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

  const patientCard = (
    <div className="space-y-1">
      {newPatientButton("btn-sakura w-full py-1.5 text-sm font-semibold shadow-sm")}
      {patientInfo}
    </div>
  );

  const sectionTabs = (
    <nav
      className="flex w-[7.75rem] shrink-0 flex-col gap-1 self-stretch"
      aria-label="Visit sections"
    >
      {newPatientButton(`${railBtn} bg-sakura-500 text-white shadow-sm hover:bg-sakura-600`)}
      <Link
        to={`/visit/${encounterId}${rxQuery}`}
        className={sectionTabClass(tab !== "reports")}
      >
        Prescription
      </Link>
      <Link
        to={`/visit/${encounterId}/reports`}
        className={sectionTabClass(tab === "reports")}
      >
        Reports
      </Link>
    </nav>
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
    <div
      data-visit-fill
      className="flex flex-col gap-2 xl:grid xl:h-full xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_16.5rem] xl:grid-rows-1 xl:overflow-hidden"
    >
      <div className="flex min-w-0 flex-col gap-1.5 xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        {/* Below xl the patient block sits above the editor: actions on the left, identity on the right. */}
        <div className="flex shrink-0 items-stretch gap-1.5 xl:hidden">
          {sectionTabs}
          {patientInfo}
        </div>
        {/* Phone: collapsed under the editor. Tablet: open row, so alerts and history stay on screen. */}
        <div className="order-last shrink-0 md:order-none xl:hidden">
          <VisitSidePanel
            variant="band"
            patientId={p.id}
            encounterId={encounterId}
            allergies={allergies}
            pregnancyStatus={p.pregnancy_status}
            actions={rxActions}
            testIdSuffix="-band"
          />
        </div>
        {tab === "reports" ? (
          <div className="card min-h-0 flex-1 overflow-y-auto p-2">
            <LabReports
              encounterId={encounterId}
              patientId={p.id}
              sex={(p.sex as Sex | null) ?? null}
              leading={
                <div className="hidden shrink-0 items-center gap-1.5 xl:flex">
                  <VisitBackButton />
                  <nav
                    className="flex shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5"
                    aria-label="Visit sections"
                    data-testid="visit-tabs"
                  >
                    <Link
                      to={`/visit/${encounterId}${rxQuery}`}
                      className="rounded-md px-2.5 py-1 text-xs whitespace-nowrap text-slate-600 hover:bg-white/60 hover:text-slate-900"
                      data-testid="visit-tab-rx"
                    >
                      Prescription
                    </Link>
                    <Link
                      to={`/visit/${encounterId}/reports`}
                      className="rounded-md bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-brand-700 shadow-sm"
                      data-testid="visit-tab-reports"
                    >
                      Reports
                    </Link>
                  </nav>
                </div>
              }
            />
          </div>
        ) : (
          <>
            <div className={`card shrink-0 flex-col gap-2 p-2 lg:flex-row lg:items-start lg:gap-3 ${isDoctor ? "hidden" : "flex"}`}>
              <div className="hidden w-full shrink-0 items-center gap-1.5 xl:flex xl:w-auto">
                <VisitBackButton />
                <nav
                  className="flex w-full shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5 xl:w-auto"
                  aria-label="Visit sections"
                  data-testid="visit-tabs"
                >
                  <Link
                    to={`/visit/${encounterId}${rxQuery}`}
                    className={`${tabClass(true)} flex-1 text-center lg:flex-none`}
                    data-testid="visit-tab-rx"
                  >
                    Prescription
                  </Link>
                  <Link
                    to={`/visit/${encounterId}/reports`}
                    className={`${tabClass(false)} flex-1 text-center lg:flex-none`}
                    data-testid="visit-tab-reports"
                  >
                    Reports
                  </Link>
                </nav>
              </div>
              {/* Assistants: vitals here. Doctors: §1 inside RxEditor (accordion on phone/tablet). */}
              {!isDoctor && (
                <div className="hidden min-w-0 w-full border-slate-100 xl:block xl:border-l xl:border-t-0 xl:pt-0 xl:pl-3">
                  <VitalsPanel
                    encounterId={encounterId}
                    initial={vitals}
                    readOnly={enc.status === "done"}
                  />
                </div>
              )}
            </div>
            {isDoctor ? (
              rxId ? (
                <div className="flex flex-col xl:min-h-0 xl:flex-1 xl:overflow-hidden">
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
                      pregnancyStatus:
                        (p.pregnancy_status as PatientCtx["pregnancyStatus"]) ??
                        null,
                    }}
                    vitals={vitals}
                    onActionsChange={setRxActions}
                  />
                </div>
              ) : (
                <div className="text-sm text-slate-500">
                  Preparing prescription…
                </div>
              )
            ) : (
              <div className="card p-2.5 text-sm text-slate-600">
                Vitals are saved automatically. The doctor will write the
                prescription.
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
      <div className="hidden min-h-0 xl:flex xl:flex-col">{sidePanel}</div>
      <NewPatientModal
        open={newPatientOpen}
        onClose={() => setNewPatientOpen(false)}
      />
    </div>
  );
}
