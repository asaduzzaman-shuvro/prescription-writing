"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { classifyDosageForm, formatInstruction, parseShortcut, type RxItem } from "@rx/core";
import { useEffect, useState } from "react";
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

  return (
    <form
      className="card space-y-3 p-3"
      data-testid="new-template"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{existing ? "Edit template" : "New template"}</h2>
        <button type="button" className="btn-ghost text-xs" onClick={onClose}>Cancel</button>
      </div>
      {copying && <p className="text-sm text-slate-500">This one is shared by RxPad. Saving replaces it with your own copy.</p>}
      <div>
        <label className="label" htmlFor="tpl-name">Name</label>
        <input id="tpl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acute tonsillitis — adult" data-testid="tpl-name" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="tpl-cc">Chief complaints (one per line)</label>
          <textarea id="tpl-cc" className="input" rows={3} value={complaints} onChange={(e) => setComplaints(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tpl-dx">Diagnoses (one per line)</label>
          <textarea id="tpl-dx" className="input" rows={3} value={diagnoses} onChange={(e) => setDiagnoses(e.target.value)} data-testid="tpl-dx" />
        </div>
        <div>
          <label className="label" htmlFor="tpl-ix">Investigations (one per line)</label>
          <textarea id="tpl-ix" className="input" rows={3} value={investigations} onChange={(e) => setInvestigations(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">℞ Medicines</h3>
        <p className="text-xs text-slate-400">Shortcuts: 1+0+1 · tds · af/bf/es/hs · 7d/2w/1m/cont · 2 drop re/le/be</p>
        <MedicineSearch onPick={(m) => setItems((list) => [...list, itemFromMedicine(m)])} />
        <ol className="space-y-1.5">
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
          {!items.length && <li className="rounded border border-dashed border-slate-300 p-2.5 text-center text-sm text-slate-400">No medicines yet</li>}
        </ol>
        <ChipList
          title="উপদেশ — Advice"
          values={advice}
          onChange={setAdvice}
          query={adviceQuery}
          params={[specialty]}
          testId="tpl-advice"
          multiline
          voice
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SaveButton type="submit" className="btn-primary" saving={saving} data-testid="tpl-save">{copying ? "Save my copy" : "Save template"}</SaveButton>
    </form>
  );
}

function DeleteDialog({ name, onCancel, onDelete }: { name: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="tpl-delete-title" data-testid="tpl-delete-dialog">
      <div className="card w-full max-w-sm space-y-3 p-4 shadow-xl">
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Prescription templates</h1>
          <p className="text-sm text-slate-500">Your templates apply from the prescription. ★ = shared by RxPad admin.</p>
        </div>
        {!creating && !editing && (
          <button type="button" className="btn-primary shrink-0" onClick={() => { setEditing(null); setCreating(true); }} data-testid="tpl-new">
            + New template
          </button>
        )}
      </div>
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
      <div className="grid gap-1.5 md:grid-cols-2">
        {visible.map((t) => {
          const p = parseJson<TemplatePayload>(t.payload, {});
          return (
            <div key={t.id} className="card p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <b className="min-w-0">{t.tenant_id ? "" : "★ "}{t.name}</b>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-ghost text-xs" data-testid="tpl-edit" onClick={() => { setCreating(false); setPendingDelete(null); setEditing(t); }}>Edit</button>
                  <button type="button" className="btn-ghost text-xs text-red-600" data-testid="tpl-delete" onClick={() => setPendingDelete(t)}>Delete</button>
                </div>
              </div>
              {p.diagnoses?.length ? <div className="text-slate-500">Dx: {p.diagnoses.join(", ")}</div> : null}
              <ol className="mt-1 list-decimal pl-5">
                {(p.items ?? []).map((i) => <li key={i.id}><b>{i.brandName}</b> {i.strength} — <span className="text-slate-600">{formatInstruction(i, "bn", "bn")}</span></li>)}
              </ol>
              {p.advice?.length ? <div className="mt-1 text-slate-500">{p.advice.join(" · ")}</div> : null}
            </div>
          );
        })}
        {!visible.length && <p className="text-sm text-slate-500">No templates yet.</p>}
      </div>
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
