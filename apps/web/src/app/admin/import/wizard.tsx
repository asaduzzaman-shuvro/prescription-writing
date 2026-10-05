"use client";

import { useState, useTransition } from "react";
import type { ColumnMapping } from "@rx/db/import";
import { commitImport, previewImport, type PreviewResult } from "./actions";

type Field = { key: string; label: string; required: boolean };

const KIND_STYLE: Record<string, string> = {
  new: "bg-green-50 text-green-700",
  changed: "bg-blue-50 text-blue-700",
  conflict: "bg-amber-50 text-amber-800",
};

export function ImportWizard({ fields }: { fields: Field[] }) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<PreviewResult>();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [done, setDone] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setDone(undefined);
    setError(undefined);
    const text = await f.text();
    setCsv(text);
    setFilename(f.name);
    start(async () => {
      const p = await previewImport(text, null);
      setPreview(p);
      setMapping(p.mapping);
    });
  }

  function remap() {
    start(async () => setPreview(await previewImport(csv, mapping)));
  }

  function commit() {
    setError(undefined);
    start(async () => {
      const r = await commitImport(csv, mapping, source, filename);
      if ("error" in r && r.error) return setError(r.error);
      if ("result" in r && r.result) {
        const x = r.result;
        setDone(`Committed: ${x.inserted} new, ${x.updated} updated, ${x.skippedConflicts} conflicts skipped; created ${x.createdCompanies} companies, ${x.createdForms} forms, ${x.createdGenerics} generics.`);
        setPreview(undefined);
        setCsv("");
      }
    });
  }

  const s = preview?.summary;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label">1. Choose CSV file (UTF-8)</label>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        {pending && <p className="mt-2 text-sm text-slate-500">Working…</p>}
        {done && <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-800">{done}</p>}
      </div>

      {preview && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">2. Map columns</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <span className="w-64 shrink-0">{f.label}{f.required && " *"}</span>
                <select
                  className="input"
                  value={mapping[f.key as keyof ColumnMapping] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                >
                  <option value="">— not in file —</option>
                  {preview.headers.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="btn-secondary mt-3" onClick={remap} disabled={pending}>Re-run preview</button>
          {preview.error && <p className="mt-2 text-sm text-red-600">{preview.error}</p>}
        </div>
      )}

      {s && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">3. Preview (dry run)</h2>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="badge bg-slate-100">Rows {s.total}</span>
            <span className="badge bg-green-50 text-green-700">New {s.new}</span>
            <span className="badge bg-blue-50 text-blue-700">Changed {s.changed}</span>
            <span className="badge bg-slate-100">Unchanged {s.unchanged}</span>
            <span className="badge bg-amber-50 text-amber-800">Conflicts {s.conflict}</span>
            <span className="badge bg-red-50 text-red-700">Invalid {s.errors}</span>
          </div>
          {(preview.newCompanies?.length || preview.newForms?.length || preview.newGenerics?.length) ? (
            <p className="mb-3 text-sm text-slate-600">
              Will create {preview.newCompanies?.length} companies, {preview.newForms?.length} dosage forms, {preview.newGenerics?.length} generics.
              {preview.newGenerics?.length ? <span className="block text-xs text-slate-500">Generics: {preview.newGenerics.slice(0, 30).join(", ")}{preview.newGenerics.length > 30 ? "…" : ""}</span> : null}
            </p>
          ) : null}
          <div className="max-h-96 overflow-auto rounded border border-slate-200">
            <table className="table">
              <thead><tr><th>Row</th><th>Kind</th><th>Brand</th><th>Detail</th></tr></thead>
              <tbody>
                {preview.errors?.map((e) => (
                  <tr key={`e${e.row}`}><td>{e.row}</td><td><span className="badge bg-red-50 text-red-700">invalid</span></td><td></td><td>{e.message}</td></tr>
                ))}
                {preview.samples?.map((r) => (
                  <tr key={`${r.kind}${r.row}`}><td>{r.row}</td><td><span className={`badge ${KIND_STYLE[r.kind]}`}>{r.kind}</span></td><td>{r.brand}</td><td className="text-xs">{r.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-500">Showing up to 100 rows per kind. Conflicts and invalid rows are skipped on commit.</p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Source label (recorded on every row)</label>
              <input className="input w-72" value={source} onChange={(e) => setSource(e.target.value)} placeholder="dgda-2026-10 / medex-licensed-2026" />
            </div>
            <button className="btn-primary" onClick={commit} disabled={pending || !(s.new + s.changed)}>
              Commit {s.new + s.changed} rows
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
