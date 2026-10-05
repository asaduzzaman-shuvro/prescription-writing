"use client";

import type { ExamFindingLine } from "@rx/core";
import { useId } from "react";

/** Editor for "Label : value" lines (O/E findings), with suggested labels. */
export function KeyValueList({
  title,
  values,
  onChange,
  suggestions,
  readOnly,
  testId,
}: {
  title: string;
  values: ExamFindingLine[];
  onChange: (v: ExamFindingLine[]) => void;
  suggestions: string[];
  readOnly?: boolean;
  testId?: string;
}) {
  const listId = useId();
  const set = (i: number, patch: Partial<ExamFindingLine>) => onChange(values.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {values.map((l, i) => (
        <div key={i} className="flex items-center gap-1">
          <input className="input w-40" list={listId} disabled={readOnly} value={l.label} placeholder="Pulse" aria-label="Finding"
            onChange={(e) => set(i, { label: e.target.value })} data-testid={testId ? `${testId}-label` : undefined} />
          <span className="text-slate-400">:</span>
          <input className="input flex-1" disabled={readOnly} value={l.value} placeholder="Normal" aria-label={`${l.label || "Finding"} value`}
            onChange={(e) => set(i, { value: e.target.value })} data-testid={testId ? `${testId}-value` : undefined} />
          {!readOnly && (
            <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Remove finding">×</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="btn-ghost text-xs" onClick={() => onChange([...values, { label: "", value: "" }])} data-testid={testId ? `${testId}-add` : undefined}>
          + Add finding
        </button>
      )}
    </section>
  );
}
