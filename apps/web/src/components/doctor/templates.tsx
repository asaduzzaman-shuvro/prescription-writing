"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { formatInstruction } from "@rx/core";
import { deleteTemplate, type TemplatePayload } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { parseJson } from "@/lib/doctor/util";

export function TemplatesScreen() {
  const db = usePowerSync();
  const session = useSession();
  const { data } = useQuery<{ id: string; name: string; payload: string; tenant_id: string | null; owner_user_id: string | null; specialty_code: string | null }>(
    "SELECT id, name, payload, tenant_id, owner_user_id, specialty_code FROM rx_template WHERE is_active = 1 ORDER BY tenant_id IS NULL, name",
  );
  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-lg font-semibold">Prescription templates</h1>
        <p className="text-sm text-slate-500">Create one from any prescription with “Save as template”. ★ = shared by RxPad admin.</p>
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {data.map((t) => {
          const p = parseJson<TemplatePayload>(t.payload, {});
          const mine = t.owner_user_id === session.userId;
          return (
            <div key={t.id} className="card p-2 text-sm">
              <div className="flex items-start justify-between">
                <b>{t.tenant_id ? "" : "★ "}{t.name}</b>
                {mine && <button className="btn-ghost text-xs text-red-600" onClick={() => confirm(`Delete “${t.name}”?`) && deleteTemplate(db, t.id)}>Delete</button>}
              </div>
              {p.diagnoses?.length ? <div className="text-slate-500">Dx: {p.diagnoses.join(", ")}</div> : null}
              <ol className="mt-1 list-decimal pl-5">
                {(p.items ?? []).map((i) => <li key={i.id}><b>{i.brandName}</b> {i.strength} — <span className="text-slate-600">{formatInstruction(i, "bn", "bn")}</span></li>)}
              </ol>
              {p.advice?.length ? <div className="mt-1 text-slate-500">{p.advice.join(" · ")}</div> : null}
            </div>
          );
        })}
        {!data.length && <p className="text-sm text-slate-500">No templates yet.</p>}
      </div>
    </div>
  );
}
