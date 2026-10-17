"use client";

import { validateTemplateSchema, type SpecialtyTemplateSchema } from "@rx/core";
import { useActionState, useMemo, useState } from "react";
import { publishTemplate } from "../actions";

export function SchemaEditor({ initial, specialties }: { initial: { specialtyCode: string; name: string; schema: string }; specialties: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(publishTemplate, undefined);
  const [text, setText] = useState(initial.schema);
  const check = useMemo(() => {
    try {
      const parsed = JSON.parse(text) as SpecialtyTemplateSchema;
      return { parsed, errors: validateTemplateSchema(parsed) };
    } catch (e) {
      return { parsed: null, errors: [(e as Error).message] };
    }
  }, [text]);
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <select name="specialtyCode" defaultValue={initial.specialtyCode} className="input w-auto">{specialties.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          <input name="name" defaultValue={initial.name} placeholder="Template name" className="input" required />
        </div>
        <textarea name="schema" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="input h-[60vh] font-mono text-xs" />
        {[...(check.errors ?? []), ...(state?.errors ?? [])].map((e) => <p key={e} className="text-sm text-red-600">{e}</p>)}
        <button className="btn-primary" disabled={pending || check.errors.length > 0}>Publish new version</button>
      </div>
      <aside className="card h-fit p-3 text-sm">
        <h3 className="mb-2 font-semibold">Outline</h3>
        {check.parsed?.sections?.map((s) => (
          <div key={s.id} className="mb-2">
            <b>{s.title}</b>
            <ul className="text-xs text-slate-600">{s.fields?.map((f) => <li key={f.id}>{f.label} <span className="text-slate-400">· {f.type}{f.lateral ? " · R/L" : ""}{f.group ? ` · group: ${f.group}` : ""}</span></li>)}</ul>
          </div>
        ))}
        <p className="mt-3 text-xs text-slate-500">Field types: select, multiselect, text, number, eardrum, audiogram. Add <code>lateral: true</code> for right/left answers, <code>normal</code> to hide the normal option from print, and the same <code>group</code> on neighbouring fields to fold them under a collapsible heading.</p>
      </aside>
    </form>
  );
}
