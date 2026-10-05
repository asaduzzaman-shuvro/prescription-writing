"use client";

import { useActionState } from "react";
import { saveGeneric } from "../actions";

export interface GenericFormValue {
  id: string;
  name: string;
  synonyms: string;
  isAntibiotic: boolean;
  awareGroup: string;
  pregnancyCategory: string;
  paedMaxMgPerKgDay: string;
  adultMaxMgPerDay: string;
  classes: string;
  isActive: boolean;
}

export function GenericForm({ g }: { g: GenericFormValue }) {
  const [state, action, pending] = useActionState(saveGeneric, undefined);
  return (
    <form action={action} className="card grid gap-4 p-4 md:grid-cols-2">
      <input type="hidden" name="id" value={g.id} />
      <div><label className="label">Name</label><input className="input" name="name" defaultValue={g.name} required /></div>
      <div><label className="label">Synonyms (comma separated)</label><input className="input" name="synonyms" defaultValue={g.synonyms} /></div>
      <div><label className="label">Drug classes (comma separated)</label><input className="input" name="classes" defaultValue={g.classes} /></div>
      <div><label className="label">Pregnancy category</label><input className="input" name="pregnancyCategory" defaultValue={g.pregnancyCategory} placeholder="A / B / C / D / X" /></div>
      <div><label className="label">Paediatric max (mg/kg/day)</label><input className="input" name="paedMaxMgPerKgDay" defaultValue={g.paedMaxMgPerKgDay} inputMode="decimal" /></div>
      <div><label className="label">Adult max (mg/day)</label><input className="input" name="adultMaxMgPerDay" defaultValue={g.adultMaxMgPerDay} inputMode="decimal" /></div>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isAntibiotic" defaultChecked={g.isAntibiotic} /> Antibiotic (prints “complete the course”, requires duration)</label>
        <label className="flex items-center gap-2 text-sm">WHO AWaRe
          <select name="awareGroup" defaultValue={g.awareGroup} className="input w-auto">
            <option value="">—</option><option value="access">Access</option><option value="watch">Watch</option><option value="reserve">Reserve</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={g.isActive} /> Active</label>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state && "ok" in state && <span className="text-sm text-green-700">Saved.</span>}
        {state && "error" in state && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
