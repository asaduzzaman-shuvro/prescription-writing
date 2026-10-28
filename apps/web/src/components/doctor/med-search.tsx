"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { searchMedicines, favoriteMedicines, type MedicineHit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { AddMedicineModal } from "./add-medicine-modal";

/** How a doctor-added medicine is labelled in the list: only they see it until the platform admin approves it. */
export function CustomMedicineBadge({ m }: { m: Pick<MedicineHit, "custom_status" | "review_note"> }) {
  if (!m.custom_status) return null;
  if (m.custom_status === "rejected")
    return (
      <span className="badge shrink-0 bg-slate-100 text-slate-600" title={m.review_note ?? undefined} data-testid="custom-med-badge">
        Private · not approved{m.review_note ? ` — ${m.review_note}` : ""}
      </span>
    );
  if (m.custom_status === "approved") return <span className="badge shrink-0 bg-emerald-50 text-emerald-700" data-testid="custom-med-badge">Approved</span>;
  return <span className="badge shrink-0 bg-amber-50 text-amber-700" data-testid="custom-med-badge">Private · pending review</span>;
}

/**
 * Medicine autocomplete over the offline catalogue. Enter picks the highlighted row; the last row adds a medicine
 * the catalogue does not have.
 */
export function MedicineSearch({ onPick }: { onPick: (m: MedicineHit) => void }) {
  const db = usePowerSync();
  const { userId } = useSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [ms, setMs] = useState<number>();
  const [adding, setAdding] = useState<string | null>(null);
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

  const canAdd = q.trim().length >= 2;
  function startAdding() {
    setAdding(q.trim());
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        className="input"
        placeholder="Add medicine — type brand or generic (e.g. napa, paracetamol)"
        value={q}
        data-testid="med-search"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, canAdd ? hits.length : hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (hitsFor.current === q) {
              if (hits[active]) pick(hits[active]);
              else if (canAdd) startAdding();
            } else if (q.trim().length >= 2) {
              searchMedicines(db, userId, q).then((rows) => rows[0] && pick(rows[0]));
            }
          }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (hits.length > 0 || canAdd) && (
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
                <CustomMedicineBadge m={m} />
                <span className="ml-auto shrink-0 text-xs text-slate-400">{m.company_name}</span>
              </button>
            </li>
          ))}
          {canAdd && (
            <li>
              <button
                type="button"
                onMouseDown={startAdding}
                className={`flex w-full items-baseline gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-brand-700 ${active === hits.length ? "bg-brand-50" : ""}`}
                data-testid="med-add-new"
              >
                + Add “{q.trim()}” as a new medicine
              </button>
            </li>
          )}
          {ms !== undefined && <li className="px-3 py-1 text-right text-[10px] text-slate-300">{ms} ms · offline catalogue</li>}
        </ul>
      )}
      {adding !== null && (
        <AddMedicineModal
          initialName={adding}
          onClose={() => setAdding(null)}
          onAdded={(m) => {
            setAdding(null);
            pick(m);
          }}
        />
      )}
    </div>
  );
}
