"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { classifyDosageForm, formatInstruction, parseShortcut, type RxItem } from "@rx/core";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { deleteTemplate, hiddenTemplateIds, hideTemplate, saveTemplate, toggleFavorite, updateTemplate, type MedicineHit, type TemplatePayload } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useMyProfile } from "@/lib/doctor/hooks";
import { parseJson, uuid } from "@/lib/doctor/util";
import { SaveButton } from "@/components/save-button";
import { ChipList } from "./chips";
import { MedicineSearch } from "./med-search";
import { RxItemRow } from "./rx-item";

interface TemplateRow {
  id: string;
  name: string;
  payload: string;
  tenant_id: string | null;
  owner_user_id: string | null;
  specialty_code: string | null;
}

function linesOf(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200/80 bg-white p-2">
      <div className="mb-1">
        <h3 className="text-[11px] font-semibold text-slate-700">{title}</h3>
        {hint ? <p className="text-[10px] leading-snug text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Same defaults as the prescription screen, including a favourite's remembered dose. */
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

function TemplateForm({ existing, mine, onClose }: { existing?: TemplateRow; mine: boolean; onClose: () => void }) {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const initial = existing ? parseJson<TemplatePayload>(existing.payload, {}) : {};
  const copying = !!existing && !mine;
  const [name, setName] = useState(existing?.name ?? "");
  const [diagnoses, setDiagnoses] = useState((initial.diagnoses ?? []).join("\n"));
  const [complaints, setComplaints] = useState((initial.chiefComplaints ?? []).join("\n"));
  const [investigations, setInvestigations] = useState((initial.investigations ?? []).join("\n"));
  const [advice, setAdvice] = useState<string[]>(initial.advice ?? []);
  const [items, setItems] = useState<RxItem[]>(initial.items ?? []);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const specialty = profile?.specialty_code ?? existing?.specialty_code ?? "";
  const { data: favs } = useQuery<{ product_id: string }>("SELECT product_id FROM doctor_favorite WHERE user_id = ?", [session.userId]);
  const favSet = new Set(favs.map((f) => f.product_id));
  const { data: snippets } = useQuery<{ t: string }>(
    "SELECT text_bn AS t FROM instruction_snippet WHERE specialty_code IS NULL OR specialty_code = ? ORDER BY sort_order",
    [specialty],
  );
  const adviceQuery = `SELECT text_bn AS label, text_bn AS value, text_en AS hint FROM advice_snippet
      WHERE (specialty_code IS NULL OR specialty_code = ?) AND (text_bn LIKE ? OR text_en LIKE ?2)
      ORDER BY specialty_code IS NULL, sort_order LIMIT 12`;

  async function save() {
    const title = name.trim();
    if (!title) {
      setError("Give the template a name.");
      return;
    }
    const payload: TemplatePayload = {
      chiefComplaints: linesOf(complaints),
      diagnoses: linesOf(diagnoses),
      investigations: linesOf(investigations),
      advice,
      items,
      ...(initial.followUp ? { followUp: initial.followUp } : {}),
    };
    if (!payload.chiefComplaints?.length && !payload.diagnoses?.length && !payload.investigations?.length && !payload.advice?.length && !payload.items?.length) {
      setError("Add a diagnosis, a medicine, or some advice.");
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

  const dxN = linesOf(diagnoses).length;
  const medN = items.length;
  const adviceN = advice.length;

  return (
    <form
      className="flex flex-col gap-1 pb-0.5"
      data-testid="new-template"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <span className="text-xs font-semibold text-slate-800">{existing ? "Edit template" : "New template"}</span>
        <div className="flex flex-wrap items-center gap-1 text-[10px] tabular-nums text-slate-500">
          {dxN > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">{dxN} Dx</span>}
          {medN > 0 && <span className="rounded bg-brand-50 px-1 py-0.5 text-brand-800">{medN} ℞</span>}
          {adviceN > 0 && <span className="rounded bg-slate-100 px-1 py-0.5">{adviceN} adv</span>}
        </div>
      </div>

      <div className="space-y-1 [&_.input]:h-8 [&_.input]:py-0.5 [&_.input]:text-sm [&_.label]:mb-0 [&_.label]:text-[10px]">
        {copying && (
          <p className="rounded border border-amber-200 bg-amber-50/80 px-1.5 py-0.5 text-[11px] text-amber-900">
            Shared — save to make your copy.
          </p>
        )}

        <FormSection title="Name">
          <input
            id="tpl-name"
            className="input max-w-xl font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acute tonsillitis — adult"
            data-testid="tpl-name"
            autoFocus
          />
        </FormSection>

        <FormSection title="Clinical" hint="One line each · need Dx, ℞, or advice">
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-12 lg:col-span-4 min-w-0">
              <label className="label" htmlFor="tpl-cc">C/C</label>
              <textarea id="tpl-cc" className="input !h-auto min-h-[3.25rem] resize-y py-1" rows={2} value={complaints} onChange={(e) => setComplaints(e.target.value)} placeholder={"Fever 3 days\nSore throat"} />
            </div>
            <div className="col-span-12 lg:col-span-4 min-w-0">
              <label className="label" htmlFor="tpl-dx">Diagnosis</label>
              <textarea id="tpl-dx" className="input !h-auto min-h-[3.25rem] resize-y py-1" rows={2} value={diagnoses} onChange={(e) => setDiagnoses(e.target.value)} placeholder="Acute pharyngitis" data-testid="tpl-dx" />
            </div>
            <div className="col-span-12 lg:col-span-4 min-w-0">
              <label className="label" htmlFor="tpl-ix">Investigations</label>
              <textarea id="tpl-ix" className="input !h-auto min-h-[3.25rem] resize-y py-1" rows={2} value={investigations} onChange={(e) => setInvestigations(e.target.value)} placeholder={"CBC\nCRP"} />
            </div>
          </div>
        </FormSection>

        <FormSection title="Medicines" hint="1+0+1 · tds · af/bf · 7d">
          <div className="mb-1 rounded border border-slate-200 bg-slate-50/50 p-1">
            <MedicineSearch onPick={(m) => setItems((list) => [...list, itemFromMedicine(m)])} />
          </div>
          <ol className="space-y-1">
            {items.map((it, i) => (
              <RxItemRow
                key={it.id}
                item={it}
                index={i}
                count={items.length}
                isFavorite={!!it.productId && favSet.has(it.productId)}
                onFavorite={it.productId ? () => { void toggleFavorite(db, session.tenantId, session.userId, it.productId!, shortcutForFavorite(it)); } : undefined}
                onChange={(n) => setItems((list) => list.map((x) => (x.id === it.id ? n : x)))}
                onRemove={() => setItems((list) => list.filter((x) => x.id !== it.id))}
                onMove={(dir) => setItems((list) => {
                  const n = [...list];
                  const j = i + dir;
                  const a = n[i];
                  const b = n[j];
                  if (!a || !b) return list;
                  n[i] = b;
                  n[j] = a;
                  return n;
                })}
                instructionSnippets={snippets.map((s) => s.t)}
              />
            ))}
            {!items.length && (
              <li className="rounded border border-dashed border-slate-200 py-2 text-center text-[11px] text-slate-500">
                No medicines — search above
              </li>
            )}
          </ol>
        </FormSection>

        <FormSection title="Advice (উপদেশ)">
          <ChipList
            title=""
            values={advice}
            onChange={setAdvice}
            query={adviceQuery}
            params={[specialty]}
            testId="tpl-advice"
            multiline
            voice
          />
        </FormSection>
      </div>

      {error && <p className="alert-danger">{error}</p>}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-200 bg-white/95 py-1 backdrop-blur-sm">
        <button type="button" className="btn-ghost h-7 px-2 text-xs order-last sm:order-first" onClick={onClose}>Cancel</button>
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
    <div className="space-y-2">
      {!formOpen && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900">Templates</h1>
              <p className="text-xs text-slate-500">
                Apply from the prescription screen ·{" "}
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
          return (
            <article key={t.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    {isShared && (
                      <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-100">★ Shared</span>
                    )}
                  </div>
                  {p.diagnoses?.length ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Dx:</span> {p.diagnoses.join(", ")}
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
              {!medCount && !p.diagnoses?.length && !p.advice?.length && (
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
