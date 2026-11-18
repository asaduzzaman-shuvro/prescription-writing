"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import {
  classifyDosageForm,
  formatInstruction,
  HISTORY_PICKS,
  historyHas,
  parseShortcut,
  toggleHistoryPick,
  type Diagram,
  type ExamFindingLine,
  type Findings,
  type PrescriptionDoc,
  type RxItem,
} from "@rx/core";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  classifyTemplatePayload,
  COMPLAINT_SUGGESTIONS_QUERY,
  deleteTemplate,
  hiddenTemplateIds,
  hideTemplate,
  saveTemplate,
  templateKindLabel,
  templatePayloadEmpty,
  templatePayloadFromParts,
  toggleFavorite,
  updateTemplate,
  type MedicineHit,
  type TemplatePayload,
  type TemplateSaveKind,
} from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useMyProfile } from "@/lib/doctor/hooks";
import { parseJson, uuid } from "@/lib/doctor/util";
import { SaveButton } from "@/components/save-button";
import { ChipList } from "./chips";
import { KeyValueList } from "./kv-list";
import { MedicineSearch } from "./med-search";
import { RxItemRow } from "./rx-item";
import { SpecialtyExam } from "./specialty-exam";

const OE_LABELS = [
  "Pulse",
  "BP",
  "Anaemia",
  "Jaundice",
  "Oedema",
  "Cyanosis",
  "Heart",
  "Lungs",
  "Abdomen",
  "Skin condition",
  "Fundus",
  "Throat",
  "Lymph nodes",
];

/** Same referral helper as the visit Clinical pane. */
function ReferralForm({ onAdd }: { onAdd: (line: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ to: "", doctor: "", phone: "" });
  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)} data-testid="tpl-add-referral">
        + Referral
      </button>
    );
  }
  const add = () => {
    const where = f.to.trim() ? `Refd to ${f.to.trim()}` : "Refd to";
    const who = [f.doctor.trim(), f.phone.trim() && `(${f.phone.trim()})`].filter(Boolean).join(" ");
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
      />
      <div className="flex gap-1">
        <input
          className="input flex-1"
          placeholder="Doctor (optional)"
          value={f.doctor}
          onChange={(e) => setF({ ...f, doctor: e.target.value })}
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
        <button type="button" className="btn-secondary text-xs" onClick={add}>
          Add to plan
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

interface TemplateRow {
  id: string;
  name: string;
  payload: string;
  tenant_id: string | null;
  owner_user_id: string | null;
  specialty_code: string | null;
}

/** Same chrome as the visit Clinical / Medicines panes; body scrolls vertically. */
function TemplatePane({
  title,
  badge,
  actions,
  children,
  testId,
  className = "",
}: {
  title: string;
  badge?: string | number | null;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white ${className}`}
      data-testid={testId}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{title}</span>
        {badge != null && badge !== "" && badge !== 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
            {badge}
          </span>
        )}
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2.5 py-2">
        <div className="space-y-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Same defaults as the prescription screen, including a favourite's remembered dose. */
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
  if (unit === "drop") Object.assign(base, { doseQty: 2, frequency: { kind: "times_per_day", times: 3 } });
  else if (unit === "spray" || unit === "puff") Object.assign(base, { doseQty: 2, frequency: { kind: "times_per_day", times: 2 } });
  else if (unit === "tsf") Object.assign(base, { doseQty: 1, frequency: { kind: "pattern", slots: [1, 1, 1] } });
  else if (unit === "application") Object.assign(base, { frequency: { kind: "times_per_day", times: 2 }, timing: "none" });
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
  if (it.timing && it.timing !== "none") {
    parts.push({ after_food: "af", before_food: "bf", with_food: "wf", empty_stomach: "es", bedtime: "hs", none: "" }[it.timing]);
  }
  if (it.duration.kind === "fixed") parts.push(`${it.duration.value}${it.duration.unit[0]}`);
  if (it.duration.kind === "continue") parts.push("cont");
  return parts.join(" ");
}

const KIND_OPTIONS: { id: TemplateSaveKind; label: string; hint: string }[] = [
  { id: "clinical", label: "Clinical", hint: "Full Clinical pane" },
  { id: "medicine", label: "Medicines", hint: "℞ · advice · follow-up" },
  { id: "both", label: "Both", hint: "Clinical + medicines" },
];

function TemplateForm({ existing, mine, onClose }: { existing?: TemplateRow; mine: boolean; onClose: () => void }) {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const initial = existing ? parseJson<TemplatePayload>(existing.payload, {}) : {};
  const copying = !!existing && !mine;
  const inferred = classifyTemplatePayload(initial);
  const [kind, setKind] = useState<TemplateSaveKind>(inferred === "empty" ? "both" : inferred);
  const [name, setName] = useState(existing?.name ?? "");
  const [diagnoses, setDiagnoses] = useState<string[]>(initial.diagnoses ?? []);
  const [complaints, setComplaints] = useState<string[]>(initial.chiefComplaints ?? []);
  const [investigations, setInvestigations] = useState<string[]>(initial.investigations ?? []);
  const [history, setHistory] = useState(initial.history ?? "");
  const [oeFindings, setOeFindings] = useState<ExamFindingLine[]>(initial.oeFindings ?? []);
  const [specialtyFindings, setSpecialtyFindings] = useState<NonNullable<PrescriptionDoc["specialtyFindings"]>>(
    initial.specialtyFindings ?? [],
  );
  const [diagrams, setDiagrams] = useState<Diagram[]>(initial.diagrams ?? []);
  const [examFindings, setExamFindings] = useState<Findings>(
    (initial.examFindings as Findings | undefined) ?? {},
  );
  const [plan, setPlan] = useState<string[]>(initial.plan ?? []);
  const [notes, setNotes] = useState<string[]>(initial.notes ?? []);
  const [advice, setAdvice] = useState<string[]>(initial.advice ?? []);
  const [items, setItems] = useState<RxItem[]>(initial.items ?? []);
  const [followUp, setFollowUp] = useState<NonNullable<TemplatePayload["followUp"]>>(
    initial.followUp ?? { kind: "none" },
  );
  const [ixSlot, setIxSlot] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const specialty = profile?.specialty_code ?? existing?.specialty_code ?? "";
  const spec = [specialty];
  const { data: favs } = useQuery<{ product_id: string }>("SELECT product_id FROM doctor_favorite WHERE user_id = ?", [session.userId]);
  const favSet = new Set(favs.map((f) => f.product_id));
  const { data: snippets } = useQuery<{ t: string }>(
    "SELECT text_bn AS t FROM instruction_snippet WHERE specialty_code IS NULL OR specialty_code = ? ORDER BY sort_order",
    [specialty],
  );

  const libQuery = (table: string, label: string, value = label, hint?: string) =>
    `SELECT ${label} AS label, ${value} AS value${hint ? `, ${hint} AS hint` : ""} FROM ${table}
      WHERE (specialty_code IS NULL OR specialty_code = ?) AND (${label} LIKE ?${hint ? ` OR ${hint} LIKE ?2` : ""})
      ORDER BY specialty_code IS NULL, sort_order LIMIT 12`;

  async function save() {
    const title = name.trim();
    if (!title) {
      setError("Give the template a name.");
      return;
    }
    const payload = templatePayloadFromParts(kind, {
      chiefComplaints: complaints,
      diagnoses,
      investigations,
      history,
      oeFindings,
      specialtyFindings,
      diagrams,
      plan,
      notes,
      examFindings,
      advice,
      items,
      followUp,
    });
    if (templatePayloadEmpty(payload)) {
      setError(
        kind === "medicine"
          ? "Add at least one medicine, advice, or follow-up."
          : kind === "clinical"
            ? "Add something in the Clinical pane (C/C, history, exam, Ix, Dx, plan, or notes)."
            : "Add clinical findings or medicines.",
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (existing && mine) await updateTemplate(db, existing.id, title, existing.specialty_code, payload);
      else {
        await saveTemplate(db, session.tenantId, session.userId, title, existing?.specialty_code ?? profile?.specialty_code ?? null, payload);
        if (existing) hideTemplate(session.userId, existing.id);
      }
      onClose();
    } catch {
      setError("Could not save the template.");
      setSaving(false);
    }
  }

  const dxN = diagnoses.length;
  const medN = items.length;
  const ccN = complaints.length;
  const clinicalBadge =
    ccN || dxN
      ? [ccN && `${ccN} C/C`, dxN && `${dxN} Dx`].filter(Boolean).join(" · ")
      : null;
  const includeClinical = kind === "clinical" || kind === "both";
  const includeMedicine = kind === "medicine" || kind === "both";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-1.5 xl:h-full xl:overflow-hidden"
      data-testid="new-template"
      data-visit-fill
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1">
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
          onClick={onClose}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <span className="text-xs font-semibold text-slate-800">
          {existing ? "Edit template" : "New template"}
        </span>
        <input
          id="tpl-name"
          className="input h-7 min-w-0 flex-1 basis-[12rem] py-0.5 text-sm font-medium xl:max-w-md"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acute tonsillitis — adult"
          data-testid="tpl-name"
          autoFocus
        />
        <div
          className="flex shrink-0 gap-0.5 rounded-md bg-slate-100 p-0.5"
          role="radiogroup"
          aria-label="Template kind"
          data-testid="tpl-kind"
        >
          {KIND_OPTIONS.map((opt) => {
            const on = kind === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={opt.hint}
                data-testid={`tpl-kind-${opt.id}`}
                className={`rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap transition ${
                  on
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
                onClick={() => setKind(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {copying && (
        <p className="rounded border border-amber-200 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900">
          Shared — save to make your copy.
        </p>
      )}

      {/* Same two-pane layout as the visit; each pane scrolls inside a viewport-bounded height. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:grid-rows-1 xl:overflow-hidden">
        <TemplatePane
          title="Clinical"
          badge={clinicalBadge}
          testId="tpl-clinical"
          className="max-h-[calc(100dvh-11rem)] min-h-[18rem] xl:h-full xl:max-h-none"
          actions={
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                includeClinical ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-400"
              }`}
            >
              {includeClinical ? "Saving" : "Skipped"}
            </span>
          }
        >
          <div className={includeClinical ? "space-y-2.5" : "pointer-events-none space-y-2.5 opacity-40"}>
            <ChipList
              title="C/C — Chief complaints"
              values={complaints}
              onChange={setComplaints}
              query={COMPLAINT_SUGGESTIONS_QUERY}
              params={spec}
              placeholder="Fever - 3 days"
              testId="tpl-cc"
              multiline
              voice
              durations
            />
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
              <div className="flex flex-wrap gap-1" data-testid="tpl-history-picks">
                {HISTORY_PICKS.map((p) => {
                  const on = historyHas(history, p.code);
                  return (
                    <button
                      key={p.code}
                      type="button"
                      aria-pressed={on}
                      title={p.name}
                      className={`rounded-full border px-2 py-0.5 text-xs transition ${
                        on
                          ? "border-brand-500 bg-brand-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                      }`}
                      onClick={() => setHistory(toggleHistoryPick(history, p.code))}
                    >
                      {p.code}
                    </button>
                  );
                })}
              </div>
              <textarea
                className="input"
                rows={2}
                value={history}
                onChange={(e) => setHistory(e.target.value)}
                placeholder="P/H, D/H, F/H…"
                data-testid="tpl-history-text"
              />
            </section>
            {specialty ? (
              <SpecialtyExam
                specialtyCode={specialty}
                readOnly={false}
                initialFindings={examFindings}
                onFindingsChange={setExamFindings}
                onFlatten={(groups, nextDiagrams) => {
                  setSpecialtyFindings(groups);
                  setDiagrams(nextDiagrams);
                }}
                ixSlot={ixSlot}
                after={{
                  section: "neck",
                  node: (
                    <KeyValueList
                      title="Other Findings"
                      values={oeFindings}
                      suggestions={OE_LABELS}
                      onChange={setOeFindings}
                      testId="tpl-oe"
                    />
                  ),
                }}
              />
            ) : (
              <KeyValueList
                title="Other Findings"
                values={oeFindings}
                suggestions={OE_LABELS}
                onChange={setOeFindings}
                testId="tpl-oe"
              />
            )}
            <ChipList
              title="Ix — Investigations"
              values={investigations}
              onChange={setInvestigations}
              query={libQuery("investigation", "name", "name", "category")}
              params={spec}
              testId="tpl-ix"
            />
            <div ref={setIxSlot} className="empty:hidden" />
            <ChipList
              title="Dx — Diagnosis"
              values={diagnoses}
              onChange={setDiagnoses}
              query={libQuery("diagnosis", "name", "name", "icd10")}
              params={spec}
              testId="tpl-dx"
            />
            <div className="space-y-1">
              <ChipList
                title="Plan — incl. referrals"
                values={plan}
                onChange={setPlan}
                placeholder="Refd to … / Review with reports"
                testId="tpl-plan"
                multiline
              />
              <ReferralForm onAdd={(line) => setPlan((p) => [...p, line])} />
            </div>
            <ChipList
              title="Note"
              values={notes}
              onChange={setNotes}
              placeholder="Birth wt 1.7 kg / H/O PNA"
              testId="tpl-notes"
              multiline
            />
          </div>
        </TemplatePane>

        <TemplatePane
          title="℞ Medicines"
          badge={medN || null}
          testId="tpl-medicines"
          className="max-h-[calc(100dvh-11rem)] min-h-[18rem] xl:h-full xl:max-h-none"
          actions={
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                includeMedicine ? "bg-brand-50 text-brand-800" : "bg-slate-100 text-slate-400"
              }`}
            >
              {includeMedicine ? "Saving" : "Skipped"}
            </span>
          }
        >
          <div className={includeMedicine ? "space-y-2" : "pointer-events-none space-y-2 opacity-40"}>
            <p className="text-xs text-slate-400">
              Shortcuts: 1+0+1 · tds · af/bf/es/hs · 7d/2w/1m/cont · 2 drop re/le/be
            </p>
            <MedicineSearch onPick={(m) => setItems((list) => [...list, itemFromMedicine(m)])} />
            <ol className="space-y-1.5" data-testid="tpl-meds">
              {items.map((it, i) => (
                <RxItemRow
                  key={it.id}
                  item={it}
                  index={i}
                  count={items.length}
                  isFavorite={!!it.productId && favSet.has(it.productId)}
                  onFavorite={
                    it.productId
                      ? () => {
                          void toggleFavorite(
                            db,
                            session.tenantId,
                            session.userId,
                            it.productId!,
                            shortcutForFavorite(it),
                          );
                        }
                      : undefined
                  }
                  onChange={(n) => setItems((list) => list.map((x) => (x.id === it.id ? n : x)))}
                  onRemove={() => setItems((list) => list.filter((x) => x.id !== it.id))}
                  onMove={(dir) =>
                    setItems((list) => {
                      const n = [...list];
                      const j = i + dir;
                      const a = n[i];
                      const b = n[j];
                      if (!a || !b) return list;
                      n[i] = b;
                      n[j] = a;
                      return n;
                    })
                  }
                  instructionSnippets={snippets.map((s) => s.t)}
                />
              ))}
              {!items.length && (
                <li className="rounded border border-dashed border-slate-300 p-2.5 text-center text-sm text-slate-400">
                  No medicines yet
                </li>
              )}
            </ol>
            <ChipList
              title="উপদেশ — Advice"
              values={advice}
              onChange={setAdvice}
              query={libQuery("advice_snippet", "text_bn", "text_bn", "text_en")}
              params={spec}
              testId="tpl-advice"
              multiline
              voice
            />
            <section className="flex flex-wrap items-center gap-2" data-testid="tpl-follow-up">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                পুনরায় সাক্ষাৎ — Follow-up
              </h3>
              <select
                className="input w-auto"
                value={followUp.kind}
                aria-label="Follow-up"
                onChange={(e) =>
                  setFollowUp(
                    e.target.value === "after"
                      ? { kind: "after", value: 7, unit: "day" }
                      : e.target.value === "date"
                        ? { kind: "date", date: "" }
                        : { kind: "none" },
                  )
                }
              >
                <option value="none">None</option>
                <option value="after">After…</option>
                <option value="date">On date</option>
              </select>
              {followUp.kind === "after" && (
                <>
                  <input
                    className="input w-16"
                    inputMode="numeric"
                    value={followUp.value}
                    aria-label="Follow-up after"
                    onChange={(e) =>
                      setFollowUp({
                        ...followUp,
                        value: Number(e.target.value.replace(/\D/g, "")) || 1,
                      })
                    }
                  />
                  <select
                    className="input w-auto"
                    value={followUp.unit}
                    onChange={(e) =>
                      setFollowUp({ ...followUp, unit: e.target.value as "day" | "week" | "month" })
                    }
                  >
                    <option value="day">দিন</option>
                    <option value="week">সপ্তাহ</option>
                    <option value="month">মাস</option>
                  </select>
                </>
              )}
              {followUp.kind === "date" && (
                <input
                  type="date"
                  className="input w-auto"
                  value={followUp.date}
                  onChange={(e) => setFollowUp({ kind: "date", date: e.target.value })}
                />
              )}
            </section>
          </div>
        </TemplatePane>
      </div>

      {error && (
        <p className="alert-danger" role="alert">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-10 flex shrink-0 flex-wrap items-center justify-end gap-1.5 border-t border-slate-200 bg-white/95 py-1.5 backdrop-blur-sm">
        <button type="button" className="btn-ghost h-7 px-2 text-xs order-last sm:order-first" onClick={onClose}>
          Cancel
        </button>
        <SaveButton type="submit" className="btn-primary h-7 px-3 text-xs" saving={saving} data-testid="tpl-save">
          {copying ? "Save my copy" : "Save template"}
        </SaveButton>
      </div>
    </form>
  );
}

function DeleteDialog({ name, onCancel, onDelete }: { name: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="tpl-delete-title" data-testid="tpl-delete-dialog">
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
        <h2 id="tpl-delete-title" className="font-semibold">Delete template?</h2>
        <p className="text-sm text-slate-600">Delete “{name}”? This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} data-testid="tpl-delete-cancel">Cancel</button>
          <button type="button" className="btn-danger" onClick={onDelete} data-testid="tpl-delete-confirm">Delete</button>
        </div>
      </div>
    </div>
  );
}

export function TemplatesScreen() {
  const db = usePowerSync();
  const session = useSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TemplateRow | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    setHidden(hiddenTemplateIds(session.userId));
  }, [session.userId]);
  const { data } = useQuery<TemplateRow>(
    "SELECT id, name, payload, tenant_id, owner_user_id, specialty_code FROM rx_template WHERE is_active = 1 ORDER BY tenant_id IS NULL, name",
  );
  const visible = data.filter((t) => !hidden.includes(t.id));
  const mine = visible.filter((t) => t.owner_user_id === session.userId).length;
  const shared = visible.length - mine;
  const formOpen = creating || editing;

  return (
    <div className={formOpen ? "flex min-h-0 flex-1 flex-col xl:h-full" : "space-y-2"}>
      {!formOpen && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900">Templates</h1>
              <p className="text-xs text-slate-500">
                Apply from Clinical / Medicines on a visit ·{" "}
                <span className="tabular-nums font-medium text-slate-700">{visible.length}</span> visible
                {shared > 0 && (
                  <>
                    {" "}
                    (<span className="tabular-nums">{shared}</span> shared ★)
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary inline-flex h-8 shrink-0 items-center gap-1 px-2.5 text-xs"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
            data-testid="tpl-new"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New template
          </button>
        </header>
      )}
      {creating && <TemplateForm mine={false} onClose={() => setCreating(false)} />}
      {editing && (
        <TemplateForm
          key={editing.id}
          existing={editing}
          mine={editing.owner_user_id === session.userId}
          onClose={() => {
            setEditing(null);
            setHidden(hiddenTemplateIds(session.userId));
          }}
        />
      )}
      {!formOpen && <div className="grid gap-2 lg:grid-cols-2">
        {visible.map((t) => {
          const p = parseJson<TemplatePayload>(t.payload, {});
          const isShared = !t.tenant_id;
          const medCount = (p.items ?? []).length;
          const kind = classifyTemplatePayload(p);
          const kindLabel = templateKindLabel(kind);
          return (
            <article key={t.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    {isShared && (
                      <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-100">★ Shared</span>
                    )}
                    {kindLabel && (
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">{kindLabel}</span>
                    )}
                  </div>
                  {p.diagnoses?.length ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Dx:</span> {p.diagnoses.join(", ")}
                    </p>
                  ) : p.chiefComplaints?.length ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">C/C:</span> {p.chiefComplaints.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button type="button" className="btn-ghost h-7 px-2 text-xs" data-testid="tpl-edit" onClick={() => { setCreating(false); setPendingDelete(null); setEditing(t); }}>Edit</button>
                  <button type="button" className="btn-ghost h-7 px-2 text-xs text-red-600" data-testid="tpl-delete" onClick={() => setPendingDelete(t)}>Delete</button>
                </div>
              </div>
              {medCount > 0 && (
                <ol className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs">
                  {(p.items ?? []).map((i) => (
                    <li key={i.id} className="text-slate-700">
                      <span className="font-medium text-slate-900">{i.brandName}</span>
                      {i.strength ? ` ${i.strength}` : ""}
                      <span className="text-slate-500"> — {formatInstruction(i, "bn", "bn")}</span>
                    </li>
                  ))}
                </ol>
              )}
              {p.advice?.length ? (
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">{p.advice.join(" · ")}</p>
              ) : null}
              {kind === "empty" && (
                <p className="mt-2 text-xs text-slate-400">Empty template</p>
              )}
            </article>
          );
        })}
        {!visible.length && (
          <p className="col-span-full rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-sm text-slate-500">
            No templates yet. Create one to speed up prescribing.
          </p>
        )}
      </div>}
      {pendingDelete && (
        <DeleteDialog
          name={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onDelete={() => {
            const row = pendingDelete;
            setPendingDelete(null);
            if (editing?.id === row.id) setEditing(null);
            if (row.owner_user_id === session.userId) void deleteTemplate(db, row.id);
            else {
              hideTemplate(session.userId, row.id);
              setHidden(hiddenTemplateIds(session.userId));
            }
          }}
        />
      )}
    </div>
  );
}
