"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { favoriteMedicines, searchMedicines, type MedicineHit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";

/** Offline medicine master list — browse / search the synced catalogue. */
export function MedicinesScreen() {
  const db = usePowerSync();
  const { userId } = useSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = q.trim().length >= 2 ? await searchMedicines(db, userId, q) : await favoriteMedicines(db, userId, 40);
      if (!cancelled) setHits(rows);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, db, userId]);

  return (
    <div className="space-y-2">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Medicine database</h1>
        <p className="text-sm text-slate-500">Search the offline catalogue by brand or generic. Favourites show when the box is empty.</p>
      </div>
      <input
        className="input max-w-xl"
        placeholder="Search brand or generic…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="meds-browse-search"
        autoFocus
      />
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Generic</th>
              <th>Form / strength</th>
              <th>Company</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.brand_name}</td>
                <td className="text-slate-600">{m.generic_text}</td>
                <td className="text-slate-500">{[m.form_label ?? m.form_name, m.strength_text].filter(Boolean).join(" · ")}</td>
                <td className="text-slate-500">{m.company_name ?? "—"}</td>
              </tr>
            ))}
            {!hits.length && (
              <tr>
                <td colSpan={4} className="text-slate-500">
                  {q.trim().length >= 2 ? "No match." : "Type at least 2 letters, or star medicines from a visit to see favourites here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
