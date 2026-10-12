"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { listMedicines, medicineCount, searchMedicineCount, searchMedicines, type MedicineHit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";

const PAGE = 20;

function pageWindow(current: number, pages: number): (number | "gap")[] {
  const keep = new Set([0, pages - 1, current - 1, current, current + 1, current + 2]);
  const nums = [...keep].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

/** Offline medicine master list — browse / search the synced catalogue. */
export function MedicinesScreen() {
  const db = usePowerSync();
  const { userId } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [catalogue, setCatalogue] = useState<number | null>(null);
  const [matched, setMatched] = useState(0);
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const searching = q.trim().length >= 2;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const [rows, all, found] = await Promise.all([
        searching ? searchMedicines(db, userId, q, PAGE, page * PAGE) : listMedicines(db, userId, page * PAGE, PAGE),
        medicineCount(db),
        searching ? searchMedicineCount(db, q) : Promise.resolve(0),
      ]);
      if (!cancelled) {
        setHits(rows);
        setCatalogue(all);
        setMatched(found);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, page, searching, db, userId]);

  const total = searching ? matched : (catalogue ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const safePage = Math.min(page, pages - 1);
  const from = hits.length ? safePage * PAGE + 1 : 0;
  const to = safePage * PAGE + hits.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Medicine database</h1>
          <p className="text-sm text-slate-500">
            {catalogue == null
              ? "Loading the offline catalogue…"
              : catalogue === 0
                ? "The catalogue is still downloading to this device."
                : "Search by brand or generic. The list stays on this device."}
          </p>
        </div>
        {catalogue != null && catalogue > 0 && (
          <p className="rounded-md bg-brand-50 px-2.5 py-1 text-sm font-medium tabular-nums text-brand-700">
            {catalogue.toLocaleString("en-IN")} medicines
          </p>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
          <input
            className="input bg-white"
            placeholder="Search brand or generic…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            data-testid="meds-browse-search"
            autoFocus
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-14">#</th>
                <th>Brand</th>
                <th>Generic</th>
                <th>Form</th>
                <th>Strength</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((m, i) => (
                <tr key={m.id} className="hover:bg-brand-50/40">
                  <td className="tabular-nums text-slate-400">{safePage * PAGE + i + 1}</td>
                  <td className="font-medium text-slate-900">
                    {m.brand_name}
                    {m.is_favorite ? <span className="ml-1.5 text-[10px] font-semibold tracking-wide text-brand-600 uppercase">Saved</span> : null}
                  </td>
                  <td className="text-slate-600">{m.generic_text || "—"}</td>
                  <td>
                    {(m.form_label ?? m.form_name) ? (
                      <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{m.form_label ?? m.form_name}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap tabular-nums text-slate-700">{m.strength_text || "—"}</td>
                  <td className="text-slate-500">{m.company_name ?? "—"}</td>
                </tr>
              ))}
              {catalogue === null && !hits.length &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-2.5">
                      <span className="block h-3 w-full max-w-md animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}
              {!hits.length && catalogue !== null && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    {searching ? "No medicine matches that search." : catalogue === 0 ? "No medicines downloaded yet." : "No medicines on this page."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 border-t border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="mr-auto text-xs text-slate-500 tabular-nums">
            {hits.length ? `${from}–${to} of ${total.toLocaleString("en-IN")}` : "0 results"}
            <span className="text-slate-400"> · {PAGE} per page</span>
          </p>
          {total > PAGE && (
            <nav className="flex items-center gap-1" aria-label="Pages">
              <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                Previous
              </button>
              {pageWindow(safePage, pages).map((item, i) =>
                item === "gap" ? (
                  <span key={`gap-${i}`} className="px-0.5 text-xs text-slate-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`h-7 min-w-7 rounded-md border px-1.5 text-xs tabular-nums ${item === safePage ? "border-brand-600 bg-brand-600 font-medium text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                    aria-current={item === safePage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item + 1}
                  </button>
                ),
              )}
              <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                Next
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
