"use client";

import { useState, useTransition } from "react";
import { AsyncPicker, type Option } from "@/components/admin/generic-picker";
import { saveInteraction, searchGenericOptions } from "./actions";

export function InteractionForm() {
  const [a, setA] = useState<Option | null>(null);
  const [b, setB] = useState<Option | null>(null);
  const [severity, setSeverity] = useState<"minor" | "moderate" | "major" | "contraindicated">("moderate");
  const [effect, setEffect] = useState("");
  const [management, setManagement] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="card grid gap-2 p-3 md:grid-cols-6">
      <div className="md:col-span-2"><label className="label">Generic A</label><AsyncPicker value={a} onChange={setA} search={searchGenericOptions} placeholder="e.g. Clarithromycin" /></div>
      <div className="md:col-span-2"><label className="label">Generic B</label><AsyncPicker value={b} onChange={setB} search={searchGenericOptions} placeholder="e.g. Simvastatin" /></div>
      <div><label className="label">Severity</label><select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}><option>minor</option><option>moderate</option><option>major</option><option>contraindicated</option></select></div>
      <div><label className="label">Reviewed by</label><input className="input" value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} placeholder="Pharmacist name" /></div>
      <div className="md:col-span-3"><label className="label">Effect</label><input className="input" value={effect} onChange={(e) => setEffect(e.target.value)} placeholder="↑ statin levels — risk of myopathy" /></div>
      <div className="md:col-span-3"><label className="label">Management</label><input className="input" value={management} onChange={(e) => setManagement(e.target.value)} placeholder="Avoid; withhold statin during the course" /></div>
      <div className="flex items-center gap-2 md:col-span-6">
        <button className="btn-primary" disabled={pending || !a || !b} onClick={() => start(async () => {
          const r = await saveInteraction({ a: a!.id, b: b!.id, severity, effect, management, reviewedBy });
          setMsg(r.error ?? "Saved — doctors receive it on next sync");
          if (!r.error) { setA(null); setB(null); setEffect(""); setManagement(""); }
        })}>Save interaction</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
