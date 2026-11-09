"use client";

import {
  COMPLAINT_DURATION_PRESETS,
  COMPLAINT_DURATION_UNITS,
  complaintDuration,
  formatComplaintDuration,
  isBanglaText,
  withComplaintDuration,
  type ComplaintDurationUnit,
} from "@rx/core";
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
  durations,
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
  /**
   * Chips are editable (tap the text) and offer quick durations ("× 3 days", "× ৩ দিন"): right after one is added,
   * or from its clock button.
   */
  durations?: boolean;
}) {
  const db = usePowerSync();
  const [text, setText] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  /** The chip whose duration picker is open, and the chip being edited. */
  const [durationAt, setDurationAt] = useState<number | null>(null);
  const [editAt, setEditAt] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  /** Escape cancels an edit; the blur that follows must not save it. */
  const cancelEdit = useRef(false);
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
    if (clean && !values.includes(clean)) {
      onChange([...values, clean]);
      // Offer a duration for the new complaint, unless it already says how long.
      if (durations) setDurationAt(complaintDuration(clean) ? null : values.length);
    }
    setText("");
    inputRef.current?.focus();
  }

  /** Changes or removes chip i; any open picker or editor closes, since indexes may shift. */
  function setAt(i: number, v: string | null) {
    const n = [...values];
    if (v === null || !v.trim()) n.splice(i, 1);
    else n[i] = v.trim();
    onChange(n);
    setDurationAt(null);
    setEditAt(null);
  }

  function startEdit(i: number) {
    cancelEdit.current = false;
    setEditAt(i);
    setEditText(values[i] ?? "");
    setDurationAt(null);
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
            className={`group flex flex-wrap items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-sm ${multiline ? "" : ""}`}
            data-testid={durations && testId ? `${testId}-chip` : undefined}
          >
            {durations && editAt === i ? (
              <input
                className="input min-w-0 flex-1 py-0.5 text-sm"
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => {
                  if (cancelEdit.current) cancelEdit.current = false;
                  else setAt(i, editText);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setAt(i, editText);
                  } else if (e.key === "Escape") {
                    cancelEdit.current = true;
                    setEditAt(null);
                  }
                }}
                aria-label={`Edit ${v}`}
                data-testid={testId ? `${testId}-chip-edit` : undefined}
              />
            ) : durations ? (
              <button type="button" className="flex-1 text-left hover:text-brand-700" onClick={() => startEdit(i)} title="Tap to edit">
                {v}
              </button>
            ) : (
              <span className="flex-1">{v}</span>
            )}
            {durations && editAt !== i && (
              <button
                type="button"
                className={`text-xs ${durationAt === i ? "text-brand-700" : "text-slate-400 hover:text-slate-700"}`}
                onClick={() => setDurationAt(durationAt === i ? null : i)}
                aria-label={`Duration of ${v}`}
                title="How long?"
              >
                ⏱
              </button>
            )}
            {multiline && i > 0 && (
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={() => {
                  const n = [...values];
                  [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                  onChange(n);
                  setDurationAt(null);
                  setEditAt(null);
                }}
                aria-label="Move up"
              >
                ↑
              </button>
            )}
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => setAt(i, null)}
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
            {durations && durationAt === i && (
              <DurationPicker
                text={v}
                onPick={(n, unit) => setAt(i, withComplaintDuration(v, n, unit))}
                onClose={() => setDurationAt(null)}
                testId={testId ? `${testId}-duration` : undefined}
              />
            )}
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

const UNIT_LABEL: Record<ComplaintDurationUnit, [string, string]> = {
  day: ["days", "দিন"],
  week: ["weeks", "সপ্তাহ"],
  month: ["months", "মাস"],
  year: ["years", "বছর"],
};

/** Quick durations for one complaint (in Bangla on a Bangla line), and any other number of days, weeks, months or years. */
function DurationPicker({
  text,
  onPick,
  onClose,
  testId,
}: {
  text: string;
  onPick: (n: number, unit: ComplaintDurationUnit) => void;
  onClose: () => void;
  testId?: string;
}) {
  const bangla = isBanglaText(text);
  const [n, setN] = useState("");
  const [unit, setUnit] = useState<ComplaintDurationUnit>("day");
  const custom = Number(n);
  const pickCustom = () => custom > 0 && onPick(custom, unit);
  return (
    <div className="flex w-full flex-wrap items-center gap-1 pb-0.5 pt-1" data-testid={testId}>
      {COMPLAINT_DURATION_PRESETS.map((p) => (
        <button
          key={`${p.n}${p.unit}`}
          type="button"
          className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs hover:border-brand-400 hover:bg-brand-50"
          onClick={() => onPick(p.n, p.unit)}
        >
          {formatComplaintDuration(p.n, p.unit, bangla)}
        </button>
      ))}
      <span className="flex items-center gap-1">
        <input
          className="input w-14 px-1.5 py-0.5 text-xs"
          type="number"
          min={1}
          inputMode="numeric"
          placeholder={bangla ? "অন্য" : "Other"}
          value={n}
          onChange={(e) => setN(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pickCustom();
            } else if (e.key === "Escape") onClose();
          }}
          aria-label="Other duration"
          data-testid={testId ? `${testId}-n` : undefined}
        />
        <select
          className="input w-auto px-1 py-0.5 text-xs"
          value={unit}
          onChange={(e) => setUnit(e.target.value as ComplaintDurationUnit)}
          aria-label="Duration unit"
          data-testid={testId ? `${testId}-unit` : undefined}
        >
          {COMPLAINT_DURATION_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u][bangla ? 1 : 0]}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary h-6 px-2 text-xs" disabled={!(custom > 0)} onClick={pickCustom} data-testid={testId ? `${testId}-set` : undefined}>
          Set
        </button>
      </span>
      <button type="button" className="ml-auto text-xs text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close duration">
        ✕
      </button>
    </div>
  );
}
