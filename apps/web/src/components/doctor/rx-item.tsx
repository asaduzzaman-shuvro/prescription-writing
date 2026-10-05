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
import { useState } from "react";

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
          <input
            className="input font-mono"
            aria-label="Dose pattern"
            value={freq.kind === "pattern" ? freq.slots.join("+") : ""}
            placeholder={freq.kind === "pattern" ? "1+0+1" : freq.kind.replaceAll("_", " ")}
            onChange={(e) => {
              const slots = parsePattern(e.target.value);
              if (slots) set({ frequency: { kind: "pattern", slots } as Frequency });
            }}
          />
          <select className="input" aria-label="Timing" value={item.timing ?? "none"} onChange={(e) => set({ timing: e.target.value as Timing })}>
            {TIMINGS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <div className="flex gap-1">
            {item.duration.kind === "continue" ? (
              <button type="button" className="btn-secondary flex-1" onClick={() => set({ duration: { kind: "fixed", value: 7, unit: "day" } })}>চলবে</button>
            ) : (
              <>
                <input
                  className="input w-14"
                  inputMode="numeric"
                  aria-label="Duration"
                  value={item.duration.kind === "fixed" ? item.duration.value : ""}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ""));
                    set({ duration: v ? { kind: "fixed", value: v, unit: item.duration.kind === "fixed" ? item.duration.unit : "day" } : { kind: "none" } });
                  }}
                />
                <select
                  className="input"
                  aria-label="Duration unit"
                  value={item.duration.kind === "fixed" ? item.duration.unit : "day"}
                  onChange={(e) => {
                    if (e.target.value === "continue") return set({ duration: { kind: "continue" } });
                    const value = item.duration.kind === "fixed" ? item.duration.value : 1;
                    set({ duration: { kind: "fixed", value, unit: e.target.value as "day" } as Duration });
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
      {warning && <div className="pl-7 text-xs font-medium text-amber-800">⚠ {warning}</div>}
    </li>
  );
}
