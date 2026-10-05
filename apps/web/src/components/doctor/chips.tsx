"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "./voice";

export interface Suggestion {
  label: string;
  /** Text inserted when picked. */
  value: string;
  hint?: string;
}

/**
 * Tag-style list editor with library suggestions from the local DB.
 * `query` must return rows with `label`, `value` and optional `hint` for a LIKE pattern.
 */
export function ChipList({
  title,
  values,
  onChange,
  query,
  params = [],
  placeholder,
  testId,
  multiline,
  voice,
}: {
  title: string;
  values: string[];
  onChange: (v: string[]) => void;
  query?: string;
  params?: unknown[];
  placeholder?: string;
  testId?: string;
  multiline?: boolean;
  /** Show dictation buttons (Bangla / English). */
  voice?: boolean;
}) {
  const db = usePowerSync();
  const [text, setText] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await db.getAll<Suggestion>(query, [...params, `%${text.trim()}%`]);
      if (!cancelled) {
        setSugs(rows.filter((r) => !values.includes(r.value)).slice(0, 8));
        setActive(0);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, query, values.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(v: string) {
    const clean = v.trim();
    if (clean && !values.includes(clean)) onChange([...values, clean]);
    setText("");
    inputRef.current?.focus();
  }

  return (
    <section className="space-y-1">
      <div className="flex items-center gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {voice && (
          <span className="ml-auto flex">
            <VoiceButton lang="bn-BD" onText={add} />
            <VoiceButton lang="en-US" onText={add} />
          </span>
        )}
      </div>
      <ul className={multiline ? "space-y-1" : "flex flex-wrap gap-1"}>
        {values.map((v, i) => (
          <li key={v + i} className={`group flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-sm ${multiline ? "" : ""}`}>
            <span className="flex-1">{v}</span>
            {multiline && i > 0 && (
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => { const n = [...values]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; onChange(n); }} aria-label="Move up">↑</button>
            )}
            <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label={`Remove ${v}`}>×</button>
          </li>
        ))}
      </ul>
      <div className="relative">
        <input
          ref={inputRef}
          className="input"
          value={text}
          placeholder={placeholder ?? "Type and press Enter"}
          data-testid={testId}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, sugs.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (open && text.trim() && sugs[active] && sugs[active].label.toLowerCase().includes(text.trim().toLowerCase())) add(sugs[active].value);
              else add(text);
            }
          }}
        />
        {open && sugs.length > 0 && (text.trim().length > 0 || values.length === 0) && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
            {sugs.map((s, i) => (
              <li key={s.value}>
                <button type="button" className={`block w-full px-3 py-1.5 text-left ${i === active ? "bg-brand-50" : ""}`} onMouseDown={() => add(s.value)}>
                  {s.label} {s.hint && <span className="text-xs text-slate-400">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
