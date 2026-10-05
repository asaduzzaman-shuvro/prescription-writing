"use client";

import { useState, useTransition } from "react";
import { AsyncPicker, type Option } from "@/components/admin/generic-picker";
import { createGeneric, saveProduct, searchGenerics, type ProductInputT } from "./actions";

type Ingredient = { generic: Option | null; strengthValue: string; strengthUnit: string; basis: string };
type Pack = { description: string; packSize: string; mrp: string; govtFixed: boolean };

export interface ProductFormValue {
  id?: string;
  brandName: string;
  formId: string;
  companyId: string;
  strengthText: string;
  darNumber: string;
  medicineSystem: ProductInputT["medicineSystem"];
  isActive: boolean;
  ingredients: Ingredient[];
  packs: Pack[];
}

export function ProductForm({
  initial,
  forms,
  companies,
}: {
  initial: ProductFormValue;
  forms: Option[];
  companies: Option[];
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductFormValue>(k: K, val: ProductFormValue[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const res = await saveProduct({
        id: v.id,
        brandName: v.brandName,
        formId: v.formId,
        companyId: v.companyId,
        strengthText: v.strengthText,
        darNumber: v.darNumber,
        medicineSystem: v.medicineSystem,
        isActive: v.isActive,
        ingredients: v.ingredients
          .filter((i) => i.generic)
          .map((i) => ({ genericId: i.generic!.id, strengthValue: i.strengthValue, strengthUnit: i.strengthUnit, basis: i.basis })),
        packs: v.packs.filter((p) => p.description.trim()),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card grid gap-4 p-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="label">Brand name *</label>
          <input className="input" value={v.brandName} onChange={(e) => set("brandName", e.target.value)} required />
        </div>
        <div>
          <label className="label">Strength (as printed)</label>
          <input className="input" value={v.strengthText} onChange={(e) => set("strengthText", e.target.value)} placeholder="500 mg" />
        </div>
        <div>
          <label className="label">Dosage form *</label>
          <select className="input" value={v.formId} onChange={(e) => set("formId", e.target.value)} required>
            <option value="">Choose…</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Company *</label>
          <select className="input" value={v.companyId} onChange={(e) => set("companyId", e.target.value)} required>
            <option value="">Choose…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">DGDA DAR number</label>
          <input className="input" value={v.darNumber} onChange={(e) => set("darNumber", e.target.value)} placeholder="e.g. 353-0026-039" />
        </div>
        <div>
          <label className="label">System</label>
          <select className="input" value={v.medicineSystem} onChange={(e) => set("medicineSystem", e.target.value as ProductFormValue["medicineSystem"])}>
            {["allopathic", "herbal", "ayurvedic", "unani", "homeopathic"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (shown to doctors)
        </label>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Generics / ingredients</h2>
          <button type="button" className="btn-ghost" onClick={() => set("ingredients", [...v.ingredients, { generic: null, strengthValue: "", strengthUnit: "", basis: "" }])}>+ Add ingredient</button>
        </div>
        <div className="space-y-2">
          {v.ingredients.map((ing, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <AsyncPicker
                value={ing.generic}
                onChange={(g) => set("ingredients", v.ingredients.map((x, j) => (j === i ? { ...x, generic: g } : x)))}
                search={searchGenerics}
                create={createGeneric}
                placeholder="Search generic…"
              />
              <input className="input" placeholder="Value (500)" value={ing.strengthValue} onChange={(e) => set("ingredients", v.ingredients.map((x, j) => (j === i ? { ...x, strengthValue: e.target.value } : x)))} />
              <input className="input" placeholder="Unit (mg)" value={ing.strengthUnit} onChange={(e) => set("ingredients", v.ingredients.map((x, j) => (j === i ? { ...x, strengthUnit: e.target.value } : x)))} />
              <input className="input" placeholder="Per (5 ml)" value={ing.basis} onChange={(e) => set("ingredients", v.ingredients.map((x, j) => (j === i ? { ...x, basis: e.target.value } : x)))} />
              <button type="button" className="btn-ghost text-red-600" onClick={() => set("ingredients", v.ingredients.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Packs & prices</h2>
          <button type="button" className="btn-ghost" onClick={() => set("packs", [...v.packs, { description: "", packSize: "", mrp: "", govtFixed: false }])}>+ Add pack</button>
        </div>
        <div className="space-y-2">
          {v.packs.map((p, i) => (
            <div key={i} className="grid items-center gap-2 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
              <input className="input" placeholder="Description (20's pack)" value={p.description} onChange={(e) => set("packs", v.packs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <input className="input" placeholder="Size" value={p.packSize} onChange={(e) => set("packs", v.packs.map((x, j) => (j === i ? { ...x, packSize: e.target.value } : x)))} />
              <input className="input" placeholder="MRP ৳" value={p.mrp} onChange={(e) => set("packs", v.packs.map((x, j) => (j === i ? { ...x, mrp: e.target.value } : x)))} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.govtFixed} onChange={(e) => set("packs", v.packs.map((x, j) => (j === i ? { ...x, govtFixed: e.target.checked } : x)))} /> Govt. fixed</label>
              <button type="button" className="btn-ghost text-red-600" onClick={() => set("packs", v.packs.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          {!v.packs.length && <p className="text-sm text-slate-500">No packs.</p>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save medicine"}</button>
    </form>
  );
}
