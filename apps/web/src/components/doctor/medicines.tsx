"use client";

import { usePowerSync } from "@powersync/react";
import { Pill, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { customMedicines, listMedicines, medicineCount, searchMedicineCount, searchMedicines, type MedicineHit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { CustomMedicineBadge } from "./med-search";

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
  const [own, setOwn] = useState<MedicineHit[]>([]);
  const searching = q.trim().length >= 2;

  useEffect(() => {
    void customMedicines(db, userId).then(setOwn);
  }, [db, userId]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const [rows, all, found] = await Promise.all([
        searching ? searchMedicines(db, userId, q, PAGE, page * PAGE, false) : listMedicines(db, userId, page * PAGE, PAGE),
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

  const statusLine =
    catalogue == null
      ? "Loading offline catalogue…"
      : catalogue === 0
        ? "Catalogue still downloading to this device"
        : searching
          ? `${matched.toLocaleString("en-IN")} matches`
          : "Browse brand or generic — works offline";

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
            <Pill className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900">Medicines</h1>
            <p className="text-xs text-slate-500">{statusLine}</p>
          </div>
        </div>
        {catalogue != null && catalogue > 0 && (
          <p className="rounded-md border border-brand-100 bg-brand-50/80 px-2 py-1 text-xs font-semibold tabular-nums text-brand-800">
            {catalogue.toLocaleString("en-IN")} in catalogue
          </p>
        )}
      </header>

      {own.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm" data-testid="my-medicines">
          <h2 className="border-b border-amber-100 bg-amber-50/60 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            Medicines you added · only you see them until they are approved for everyone
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {own.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-2 px-2.5 py-1.5">
                <span className="text-slate-500">{m.form_label ?? m.form_name}</span>
                <b>{m.brand_name}</b>
                <span>{m.strength_text}</span>
                <span className="text-slate-500">{m.generic_text}</span>
                <span className="ml-auto">
                  <CustomMedicineBadge m={m} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-2.5 py-1.5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input h-8 w-full pl-7 text-sm"
              placeholder="Search brand or generic (min 2 letters)…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              data-testid="meds-browse-search"
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Brand</th>
                <th>Generic</th>
                <th>Form</th>
                <th>Strength</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((m, i) => (
                <tr key={m.id} className="hover:bg-slate-50/80">
                  <td className="tabular-nums text-xs text-slate-400">{safePage * PAGE + i + 1}</td>
                  <td className="font-medium text-slate-900">
                    {m.brand_name}
                    {m.is_favorite ? (
                      <span className="ml-1.5 rounded bg-brand-50 px-1 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-100">Saved</span>
                    ) : null}
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
                  <td className="max-w-[10rem] truncate text-slate-500">{m.company_name ?? "—"}</td>
                </tr>
              ))}
              {catalogue === null && !hits.length &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-2">
                      <span className="block h-3 w-full max-w-lg animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}
              {!hits.length && catalogue !== null && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    {searching ? "No medicine matches that search." : catalogue === 0 ? "No medicines downloaded yet." : "No medicines on this page."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-slate-100 px-2.5 py-1.5">
          <p className="mr-auto text-xs tabular-nums text-slate-500">
            {hits.length ? `${from}–${to} of ${total.toLocaleString("en-IN")}` : "0 results"}
            <span className="text-slate-400"> · {PAGE}/page</span>
          </p>
          {total > PAGE && (
            <nav className="flex flex-wrap items-center gap-0.5" aria-label="Pages">
              <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                Prev
              </button>
              {pageWindow(safePage, pages).map((item, i) =>
                item === "gap" ? (
                  <span key={`gap-${i}`} className="px-0.5 text-xs text-slate-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`h-7 min-w-7 rounded-md border px-1.5 text-xs tabular-nums ${
                      item === safePage
                        ? "border-brand-600 bg-brand-600 font-medium text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    aria-current={item === safePage ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item + 1}
                  </button>
                ),
              )}
              <button
                type="button"
                className="btn-secondary h-7 px-2 text-xs"
                disabled={safePage + 1 >= pages}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
