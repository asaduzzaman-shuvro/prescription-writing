"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { VoiceButton } from "./voice";

export interface Suggestion {
  label: string;
  /** Text inserted when picked. */
  value: string;
  hint?: string;
  /** Small label after the suggestion, e.g. "Mine". */
  tag?: string | null;
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
  maxSuggestions = 8,
  onSaveCustom,
  saveLabel = "my list",
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
  /** How many suggestions the dropdown lists; it scrolls past about eight. */
  maxSuggestions?: number;
  /** When set, typed text with no exact suggestion can also be saved for next time ("＋ Save … to my list"). */
  onSaveCustom?: (text: string) => Promise<void>;
  /** Where saved text goes, as the save row names it. */
  saveLabel?: string;
}) {
  const db = usePowerSync();
  const [text, setText] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await db.getAll<Suggestion>(query, [
        ...params,
        `%${text.trim()}%`,
      ]);
      if (!cancelled) {
        setSugs(rows.filter((r) => !values.includes(r.value)).slice(0, maxSuggestions));
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

  const typed = text.trim();
  const canSave = !!onSaveCustom && typed.length > 0 && !sugs.some((s) => s.value.toLowerCase() === typed.toLowerCase());

  async function addAndSave() {
    if (!onSaveCustom) return;
    const t = typed;
    add(t);
    setSaveError(undefined);
    try {
      await onSaveCustom(t);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Not saved");
    }
  }

  return (
    <section className="space-y-1">
      <div className="flex items-center gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        {voice && (
          <span className="ml-auto flex">
            <VoiceButton lang="bn-BD" onText={add} />
            <VoiceButton lang="en-US" onText={add} />
          </span>
        )}
      </div>
      <ul className={multiline ? "space-y-1" : "flex flex-wrap gap-1"}>
        {values.map((v, i) => (
          <li
            key={v + i}
            className={`group flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-sm ${multiline ? "" : ""}`}
          >
            <span className="flex-1">{v}</span>
            {multiline && i > 0 && (
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={() => {
                  const n = [...values];
                  [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                  onChange(n);
                }}
                aria-label="Move up"
              >
                ↑
              </button>
            )}
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
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
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setSaveError(undefined);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, sugs.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (
                open &&
                text.trim() &&
                sugs[active] &&
                sugs[active].label
                  .toLowerCase()
                  .includes(text.trim().toLowerCase())
              )
                add(sugs[active].value);
              else add(text);
            }
          }}
        />
        {open &&
          (sugs.length > 0 || canSave) &&
          (text.trim().length > 0 || values.length === 0) && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
              {sugs.map((s, i) => (
                <li key={s.value}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left ${i === active ? "bg-brand-50" : ""}`}
                    onMouseDown={() => add(s.value)}
                  >
                    {s.label}{" "}
                    {s.hint && (
                      <span className="text-xs text-slate-400">{s.hint}</span>
                    )}
                    {s.tag && (
                      <span className="badge ml-1 bg-brand-50 text-[10px] text-brand-700">{s.tag}</span>
                    )}
                  </button>
                </li>
              ))}
              {canSave && (
                <li className="border-t border-slate-100">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-brand-700 hover:bg-brand-50"
                    onMouseDown={() => void addAndSave()}
                    data-testid={testId ? `${testId}-save` : undefined}
                  >
                    ＋ Save “{typed}” to {saveLabel}
                  </button>
                </li>
              )}
            </ul>
          )}
      </div>
      {saveError && <p className="text-xs text-red-700">{saveError}</p>}
    </section>
  );
}
