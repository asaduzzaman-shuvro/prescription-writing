"use client";

import {
  formatInstruction,
  parsePattern,
  parseShortcut,
  type DoseUnit,
  type Duration,
  type Frequency,
  type Route,
  type RxItem,
  type Side,
  type Timing,
} from "@rx/core";
import { useEffect, useRef, useState } from "react";

/** Common BD dose slots. Arrow up/down walks this list; anything else the doctor types is kept. */
const DOSE_PATTERNS = ["1+1+1", "1+0+1", "1+1+0", "0+1+1", "1+0+0", "0+1+0", "0+0+1", "2+0+2", "0+0+2", "1+1+1+1", "½+0+½", "½+½+½"];
const DAY_OPTIONS = ["1", "2", "3", "5", "7", "10", "14", "15", "21", "28", "30"];

/** Searchable dropdown. A value that is not in the list is kept when the doctor leaves the field. */
function SearchSelect({
  value,
  options,
  onPick,
  accept,
  ariaLabel,
  testId,
  className,
  boxClassName,
  inputMode,
  placeholder,
}: {
  value: string;
  options: string[];
  onPick: (value: string) => void;
  /** Canonical custom value, or null when the typed text should be discarded. */
  accept: (text: string) => string | null;
  ariaLabel: string;
  testId: string;
  className?: string;
  boxClassName?: string;
  inputMode?: "numeric" | "text";
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  const choices = value && !options.includes(value) ? [value, ...options] : options;
  const q = text.trim().toLowerCase();
  const searching = text.trim() !== value;
  const shown = searching && q ? choices.filter((o) => o.toLowerCase().includes(q)) : choices;

  function commit(raw: string) {
    const trimmed = raw.trim();
    const hit = choices.find((o) => o.toLowerCase() === trimmed.toLowerCase());
    if (hit) {
      onPick(hit);
      setText(hit);
      return;
    }
    const custom = accept(trimmed);
    if (custom) {
      onPick(custom);
      setText(custom);
      return;
    }
    setText(value);
  }

  return (
    <div className={`relative min-w-0 ${boxClassName ?? "w-full"}`}>
      <input
        className={className ?? "input w-full font-mono"}
        aria-label={ariaLabel}
        data-testid={testId}
        inputMode={inputMode}
        placeholder={placeholder}
        title="Type to search. Arrow up or down to move. A value that is not listed is kept."
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { focused.current = true; setOpen(true); }}
        onBlur={() => { focused.current = false; setOpen(false); commit(text); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const list = shown.length ? shown : choices;
            if (!list.length) return;
            const i = list.indexOf(text);
            const step = e.key === "ArrowDown" ? 1 : -1;
            const next = list[(i < 0 ? (step > 0 ? 0 : list.length - 1) : i + step + list.length) % list.length];
            if (!next) return;
            onPick(next);
            setText(next);
            setOpen(true);
            setActive(Math.max(0, list.indexOf(next)));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const typed = text.trim().toLowerCase();
            const highlighted = shown[active];
            commit(highlighted && typed && highlighted.toLowerCase().includes(typed) ? highlighted : text);
            setOpen(false);
          } else if (e.key === "Escape") {
            setText(value);
            setOpen(false);
          }
        }}
      />
      {open && shown.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-48 w-full min-w-[5.5rem] overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {shown.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                className={`block w-full px-2 py-1 text-left font-mono ${i === active ? "bg-brand-50" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); commit(o); setOpen(false); }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TIMINGS: { v: Timing; label: string }[] = [
  { v: "none", label: "—" },
  { v: "after_food", label: "খাবারের পরে" },
  { v: "before_food", label: "খাবারের আগে" },
  { v: "with_food", label: "খাবারের সাথে" },
  { v: "empty_stomach", label: "খালি পেটে" },
  { v: "bedtime", label: "ঘুমানোর আগে" },
];

const UNITS: DoseUnit[] = ["tab", "cap", "tsf", "ml", "drop", "puff", "spray", "sachet", "amp", "vial", "supp", "application", "unit"];
const SIDED: Route[] = ["ear", "nose", "eye"];

function shortcutOf(it: RxItem): string {
  const f = it.frequency;
  const parts: string[] = [];
  if (it.doseQty && it.doseUnit && !["tab", "cap"].includes(it.doseUnit)) parts.push(`${it.doseQty} ${it.doseUnit}`);
  if (f.kind === "pattern") parts.push(f.slots.join("+"));
  else if (f.kind === "times_per_day") parts.push({ 1: "od", 2: "bd", 3: "tds", 4: "qds" }[f.times] ?? `${f.times}x`);
  else if (f.kind === "every_hours") parts.push(`q${f.hours}h`);
  else parts.push(f.kind);
  if (it.side) parts.push({ right: "re", left: "le", both: "be" }[it.side]);
  if (it.timing && it.timing !== "none") parts.push({ after_food: "af", before_food: "bf", with_food: "wf", empty_stomach: "es", bedtime: "hs", none: "" }[it.timing]);
  if (it.duration.kind === "fixed") parts.push(`${it.duration.value}${it.duration.unit[0]}`);
  if (it.duration.kind === "continue") parts.push("cont");
  return parts.join(" ");
}

export function RxItemRow({
  item,
  index,
  count,
  onChange,
  onRemove,
  onMove,
  onFavorite,
  isFavorite,
  readOnly,
  instructionSnippets,
  warning,
}: {
  item: RxItem;
  index: number;
  count: number;
  onChange: (it: RxItem) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  readOnly?: boolean;
  instructionSnippets: string[];
  warning?: string;
}) {
  const [shortcut, setShortcut] = useState(() => shortcutOf(item));
  const [unknown, setUnknown] = useState<string[]>([]);
  const set = (patch: Partial<RxItem>) => onChange({ ...item, ...patch });

  function applyShortcut(text: string) {
    const p = parseShortcut(text);
    setUnknown(p.unknown);
    const patch: Partial<RxItem> = {};
    if (p.frequency) patch.frequency = p.frequency;
    if (p.duration) patch.duration = p.duration;
    if (p.timing) patch.timing = p.timing;
    if (p.doseQty !== undefined) patch.doseQty = p.doseQty;
    if (p.doseUnit) patch.doseUnit = p.doseUnit;
    if (p.side) patch.side = p.side;
    set(patch);
  }

  function pickPattern(text: string) {
    const slots = parsePattern(text);
    if (!slots) return;
    const frequency: Frequency = { kind: "pattern", slots };
    set({ frequency });
    setShortcut(shortcutOf({ ...item, frequency }));
  }

  function applyDuration(duration: Duration) {
    set({ duration });
    setShortcut(shortcutOf({ ...item, duration }));
  }

  function pickDays(text: string) {
    const v = Number(text.replace(/\D/g, ""));
    if (!v) return;
    const unit = item.duration.kind === "fixed" ? item.duration.unit : "day";
    applyDuration({ kind: "fixed", value: v, unit });
  }

  const freq = item.frequency;
  const durationMissing = item.isAntibiotic && item.duration.kind !== "fixed";

  return (
    <li className={`rounded-md border p-2 ${warning || durationMissing ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`} data-testid="rx-item">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="w-5 text-right text-sm text-slate-400">{index + 1}.</span>
        <span className="text-sm text-slate-500">{item.form}</span>
        <b className="uppercase">{item.brandName}</b>
        <span className="text-sm">{item.strength}</span>
        {item.genericName && <span className="text-xs text-slate-500">({item.genericName})</span>}
        {item.isAntibiotic && <span className="badge bg-red-50 text-red-700">Antibiotic</span>}
        {!readOnly && (
          <span className="ml-auto flex gap-0.5">
            {onFavorite && (
              <button type="button" onClick={onFavorite} className={`btn-ghost px-1.5 ${isFavorite ? "text-amber-500" : "text-slate-300"}`} title="Favourite (remembers this dose)">★</button>
            )}
            <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="btn-ghost px-1.5" aria-label="Move up">↑</button>
            <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="btn-ghost px-1.5" aria-label="Move down">↓</button>
            <button type="button" onClick={onRemove} className="btn-ghost px-1.5 text-red-600" aria-label="Remove">✕</button>
          </span>
        )}
      </div>
      {!readOnly && (
        <div className="mt-1.5 grid gap-1.5 pl-7 sm:grid-cols-[minmax(9rem,1.3fr)_minmax(5rem,0.8fr)_minmax(7rem,1fr)_minmax(8rem,1fr)]">
          <input
            className="input font-mono"
            value={shortcut}
            placeholder="1+0+1 af 7d"
            title="Shortcut: 1+0+1 / tds / q6h / sos · af bf es hs · 7d 2w 1m cont · 2 drop re/le/be"
            data-testid="rx-shortcut"
            onChange={(e) => setShortcut(e.target.value)}
            onBlur={() => applyShortcut(shortcut)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyShortcut(shortcut))}
          />
          <SearchSelect
            value={freq.kind === "pattern" ? freq.slots.join("+") : ""}
            options={DOSE_PATTERNS}
            onPick={pickPattern}
            accept={(raw) => {
              const slots = parsePattern(raw);
              return slots ? slots.join("+") : null;
            }}
            ariaLabel="Dose pattern"
            testId="rx-pattern"
            placeholder="1+0+1"
          />
          <select className="input" aria-label="Timing" value={item.timing ?? "none"} onChange={(e) => set({ timing: e.target.value as Timing })}>
            {TIMINGS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <div className="flex gap-1">
            {item.duration.kind === "continue" ? (
              <button type="button" className="btn-secondary flex-1" onClick={() => applyDuration({ kind: "fixed", value: 7, unit: "day" })}>চলবে</button>
            ) : (
              <>
                <SearchSelect
                  value={item.duration.kind === "fixed" ? String(item.duration.value) : ""}
                  options={DAY_OPTIONS}
                  onPick={pickDays}
                  accept={(raw) => {
                    const n = Number(raw.replace(/\D/g, ""));
                    return n > 0 && n < 1000 ? String(n) : null;
                  }}
                  ariaLabel="Duration"
                  testId="rx-days"
                  inputMode="numeric"
                  placeholder="7"
                  className="input w-full font-mono"
                  boxClassName="w-16 shrink-0"
                />
                <select
                  className="input"
                  aria-label="Duration unit"
                  value={item.duration.kind === "fixed" ? item.duration.unit : "day"}
                  onChange={(e) => {
                    if (e.target.value === "continue") return applyDuration({ kind: "continue" });
                    const value = item.duration.kind === "fixed" ? item.duration.value : 1;
                    applyDuration({ kind: "fixed", value, unit: e.target.value as "day" | "week" | "month" });
                  }}
                >
                  <option value="day">দিন</option><option value="week">সপ্তাহ</option><option value="month">মাস</option><option value="continue">চলবে</option>
                </select>
              </>
            )}
          </div>
          {(SIDED.includes(item.route as Route) || (item.doseUnit && !["tab", "cap"].includes(item.doseUnit))) && (
            <div className="flex flex-wrap gap-1 sm:col-span-4">
              {SIDED.includes(item.route as Route) && (
                <select className="input w-auto" aria-label="Side" value={item.side ?? ""} onChange={(e) => set({ side: (e.target.value || undefined) as Side | undefined })}>
                  <option value="">Side…</option><option value="right">Right / ডান</option><option value="left">Left / বাম</option><option value="both">Both / উভয়</option>
                </select>
              )}
              <input className="input w-16" inputMode="decimal" aria-label="Amount per dose" value={item.doseQty ?? ""} onChange={(e) => set({ doseQty: Number(e.target.value) || undefined })} placeholder="qty" />
              <select className="input w-auto" aria-label="Unit" value={item.doseUnit ?? ""} onChange={(e) => set({ doseUnit: (e.target.value || undefined) as DoseUnit })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select className="input w-auto" aria-label="Frequency" value={freq.kind === "times_per_day" ? String(freq.times) : ""} onChange={(e) => e.target.value && set({ frequency: { kind: "times_per_day", times: Number(e.target.value) } })}>
                <option value="">times/day…</option>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}× daily</option>)}
              </select>
            </div>
          )}
          <input
            className="input text-sm sm:col-span-4"
            list={`instr-${item.id}`}
            placeholder="Note / instruction (optional)"
            value={item.note ?? ""}
            onChange={(e) => set({ note: e.target.value || undefined })}
          />
          <datalist id={`instr-${item.id}`}>{instructionSnippets.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      )}
      <div className="mt-1 pl-7 text-sm text-brand-700" data-testid="rx-instruction">{formatInstruction(item, "bn", "bn")}</div>
      {item.note && readOnly && <div className="pl-7 text-xs text-slate-600">{item.note}</div>}
      {unknown.length > 0 && <div className="pl-7 text-xs text-amber-700">Didn’t understand: {unknown.join(" ")}</div>}
      {durationMissing && <div className="pl-7 text-xs text-amber-800">Antibiotic: set a fixed duration (প্রেসক্রিপশনে “সম্পূর্ণ কোর্স শেষ করুন” ছাপা হবে)</div>}
      {warning && <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-warn">⚠ {warning}</div>}
    </li>
  );
}
