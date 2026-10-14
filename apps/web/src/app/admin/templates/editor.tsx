"use client";

import { classifyDosageForm, formatInstruction, parseShortcut, type RxItem } from "@rx/core";
import { useRef, useState, useTransition } from "react";
import { SaveButton } from "@/components/save-button";
import { findProducts, saveSharedTemplate, type SharedTemplateInput } from "./actions";

type Hit = Awaited<ReturnType<typeof findProducts>>[number];

function Lines({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className="label">{label} (one per line)</label>
      <textarea className="input" rows={3} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n").map((x) => x.trimStart()).filter((x, i, a) => x || i < a.length - 1))} />
    </div>
  );
}

export function TemplateEditor({ initial, specialties }: { initial: SharedTemplateInput; specialties: { code: string; name: string }[] }) {
  const [t, setT] = useState(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function search(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setHits(v.trim().length >= 2 ? await findProducts(v) : []), 200);
  }

  function add(h: Hit) {
    const f = classifyDosageForm(h.formName ?? "");
    const item: RxItem = {
      id: crypto.randomUUID(),
      productId: h.id,
      form: h.formLabel ?? f.shortLabel,
      brandName: h.brandName,
      genericName: h.genericText,
      strength: h.strengthText ?? undefined,
      route: (h.defaultRoute ?? f.route) as RxItem["route"],
      doseUnit: (h.defaultUnit ?? f.unit) as RxItem["doseUnit"],
      isAntibiotic: h.isAntibiotic,
      frequency: { kind: "pattern", slots: [1, 0, 1] },
      timing: "after_food",
      duration: { kind: "fixed", value: 7, unit: "day" },
    };
    setT((p) => ({ ...p, items: [...p.items, item] }));
    setQ("");
    setHits([]);
  }

  function shortcut(i: number, text: string) {
    const p = parseShortcut(text);
    setT((prev) => ({
      ...prev,
      items: prev.items.map((it, j) =>
        j === i
          ? {
              ...it,
              ...(p.frequency && { frequency: p.frequency }),
              ...(p.duration && { duration: p.duration }),
              ...(p.timing && { timing: p.timing }),
              ...(p.doseQty !== undefined && { doseQty: p.doseQty }),
              ...(p.doseUnit && { doseUnit: p.doseUnit }),
              ...(p.side && { side: p.side }),
            }
          : it,
      ),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 md:grid-cols-3">
        <div className="md:col-span-2"><label className="label">Template name</label><input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></div>
        <div>
          <label className="label">Specialty</label>
          <select className="input" value={t.specialtyCode ?? ""} onChange={(e) => setT({ ...t, specialtyCode: e.target.value || null })}>
            <option value="">All specialties</option>
            {specialties.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <Lines label="Chief complaints" value={t.chiefComplaints} onChange={(v) => setT({ ...t, chiefComplaints: v })} />
        <Lines label="Diagnoses" value={t.diagnoses} onChange={(v) => setT({ ...t, diagnoses: v })} />
        <Lines label="Investigations" value={t.investigations} onChange={(v) => setT({ ...t, investigations: v })} />
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Medicines</h2>
        <div className="relative">
          <input className="input" placeholder="Search brand or generic…" value={q} onChange={(e) => search(e.target.value)} />
          {hits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
              {hits.map((h) => (
                <li key={h.id}><button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-brand-50" onClick={() => add(h)}>{h.formLabel} <b>{h.brandName}</b> {h.strengthText} <span className="text-slate-500">{h.genericText} · {h.companyName}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <ol className="space-y-2">
          {t.items.map((it, i) => (
            <li key={it.id} className="rounded border border-slate-200 p-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{i + 1}.</span><span className="text-slate-500">{it.form}</span><b>{it.brandName}</b><span>{it.strength}</span>
                <button type="button" className="btn-ghost ml-auto text-xs text-red-600" onClick={() => setT({ ...t, items: t.items.filter((_, j) => j !== i) })}>Remove</button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input className="input w-56 font-mono" placeholder="1+0+1 af 7d" onBlur={(e) => shortcut(i, e.target.value)} />
                <span className="text-brand-700">{formatInstruction(it, "bn", "bn")}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="card p-4"><Lines label="উপদেশ / Advice" value={t.advice} onChange={(v) => setT({ ...t, advice: v })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.isActive} onChange={(e) => setT({ ...t, isActive: e.target.checked })} /> Active</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <SaveButton className="btn-primary" saving={pending} onClick={() => start(async () => { const r = await saveSharedTemplate(t); if (r?.error) setError(r.error); })}>Save template</SaveButton>
    </div>
  );
}
