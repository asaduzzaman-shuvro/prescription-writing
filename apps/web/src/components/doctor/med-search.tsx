"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { searchMedicines, favoriteMedicines, type MedicineHit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";

/** Medicine autocomplete over the offline catalogue. Enter picks the highlighted row. */
export function MedicineSearch({ onPick }: { onPick: (m: MedicineHit) => void }) {
  const db = usePowerSync();
  const { userId } = useSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [ms, setMs] = useState<number>();
  // Query the current `hits` belong to; Enter before the debounce settles must not pick stale rows.
  const hitsFor = useRef("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const t0 = performance.now();
      const rows = q.trim().length >= 2 ? await searchMedicines(db, userId, q) : await favoriteMedicines(db, userId, 12);
      if (!cancelled) {
        hitsFor.current = q;
        setHits(rows);
        setActive(0);
        setMs(Math.round(performance.now() - t0));
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, db, userId]);

  function pick(m: MedicineHit) {
    onPick(m);
    setQ("");
    setOpen(false);
    ref.current?.focus();
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        className="input py-2 text-base"
        placeholder="Add medicine — type brand or generic (e.g. napa, paracetamol)"
        value={q}
        data-testid="med-search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (hitsFor.current === q) {
              if (hits[active]) pick(hits[active]);
            } else if (q.trim().length >= 2) {
              searchMedicines(db, userId, q).then((rows) => rows[0] && pick(rows[0]));
            }
          }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-xl" data-testid="med-results">
          {q.trim().length < 2 && <li className="px-3 py-1 text-xs font-semibold uppercase text-slate-400">Favourites</li>}
          {hits.map((m, i) => (
            <li key={m.id}>
              <button type="button" onMouseDown={() => pick(m)} className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left ${i === active ? "bg-brand-50" : ""}`}>
                {m.is_favorite ? <span className="text-amber-500">★</span> : null}
                <span className="text-slate-500">{m.form_label}</span>
                <b>{m.brand_name}</b>
                <span>{m.strength_text}</span>
                <span className="truncate text-slate-500">{m.generic_text}</span>
                {m.is_antibiotic ? <span className="badge bg-red-50 text-red-700">ABX</span> : null}
                <span className="ml-auto shrink-0 text-xs text-slate-400">{m.company_name}</span>
              </button>
            </li>
          ))}
          {ms !== undefined && <li className="px-3 py-1 text-right text-[10px] text-slate-300">{ms} ms · offline catalogue</li>}
        </ul>
      )}
    </div>
  );
}
