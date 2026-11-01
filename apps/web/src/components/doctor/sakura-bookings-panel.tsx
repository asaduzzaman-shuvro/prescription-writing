"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { sakuraApi, SakuraApiError } from "@/lib/sakura/client";
import type { SakuraAppointment, SakuraChamber, SakuraTodayResponse } from "@/lib/sakura/types";
import { formatAppointmentTime, resolveDefaultChamberId, sortQueue, statusLabel } from "@/lib/sakura/utils";

const SAKURA_CHAMBER_KEY = "rx.sakura.chamber";

function readStoredChamberId(): number | null {
  try {
    const raw = localStorage.getItem(SAKURA_CHAMBER_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function storeChamberId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(SAKURA_CHAMBER_KEY);
    else localStorage.setItem(SAKURA_CHAMBER_KEY, String(id));
  } catch {
    /* ignore */
  }
}

/** Sakura Web serial list for the bookings screen (same chambers as Sakura dashboard). */
export function SakuraBookingsPanel({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const [chambers, setChambers] = useState<SakuraChamber[]>([]);
  const [chamberId, setChamberId] = useState<number | null>(null);
  const [rows, setRows] = useState<SakuraAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAppointments = useCallback(async (cid: number | null, d: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cid) params.set("chamberId", String(cid));
      if (d) params.set("date", d);
      const qs = params.toString() ? `?${params}` : "";
      const response = await sakuraApi.get<SakuraTodayResponse | SakuraAppointment[]>(`/appointments/today${qs}`);
      const list = Array.isArray(response) ? response : (response?.appointments ?? []);
      setRows(sortQueue(list));
    } catch (err) {
      if (err instanceof SakuraApiError && err.status === 401) {
        setError("Sakura Web is not connected. Open Sakura Web from the menu to sign in.");
      } else {
        setError(err instanceof Error ? err.message : "Could not load Sakura bookings");
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await sakuraApi.get<SakuraChamber[]>("/chambers");
        const active = (Array.isArray(list) ? list : []).filter((c) => c.isActive !== false);
        if (cancelled) return;
        setChambers(active);
        const stored = readStoredChamberId();
        const pick =
          stored != null && active.some((c) => c.id === stored)
            ? stored
            : resolveDefaultChamberId(active, date);
        setChamberId(pick);
        await loadAppointments(pick, date);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load Sakura chambers");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, loadAppointments]);

  function onChamberChange(id: number) {
    setChamberId(id);
    storeChamberId(id);
    void loadAppointments(id, date);
  }

  const chamberName = chambers.find((c) => c.id === chamberId)?.name ?? "Sakura chamber";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs text-slate-600">
          Appointments from <span className="font-semibold text-[#325A46]">Sakura Web</span> for the selected date and chamber.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="rounded-lg border border-[#9DBD68]/50 bg-gradient-to-br from-[#9DBD68]/15 to-white px-2 py-1.5 text-right shadow-sm ring-1 ring-[#325A46]/10"
            data-testid="sakura-active-chamber"
          >
            <div className="text-[10px] font-semibold tracking-wide text-[#325A46] uppercase">Sakura chamber</div>
            {chambers.length > 1 ? (
              <select
                className="mt-0.5 h-7 w-auto max-w-64 bg-transparent text-right text-sm font-semibold text-slate-900 outline-none"
                value={chamberId ?? ""}
                onChange={(e) => onChamberChange(Number(e.target.value))}
                aria-label="Sakura chamber"
              >
                {chambers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm font-semibold text-slate-900">{chamberName}</div>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <input type="date" className="input h-8 w-auto text-sm" value={date} onChange={(e) => onDateChange(e.target.value)} aria-label="Date" />
          </label>
        </div>
      </div>

      {error && <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{error}</p>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold text-slate-900">
            Sakura serials <span className="font-normal text-slate-500">· {date}</span>
          </h2>
          <span className="text-[11px] tabular-nums text-slate-500">{loading ? "…" : `${rows.length} rows`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/80">
                  <td className="tabular-nums font-medium text-slate-800">{a.serialNumber ?? "—"}</td>
                  <td className="tabular-nums text-slate-600">{formatAppointmentTime(a)}</td>
                  <td className="font-medium text-slate-900">{a.patient?.fullName ?? "—"}</td>
                  <td className="tabular-nums">{a.patient?.phone ?? "—"}</td>
                  <td className="text-slate-600">{a.identifier ?? "—"}</td>
                  <td>
                    <span className="badge bg-[#9DBD68]/20 text-[#325A46] ring-1 ring-[#9DBD68]/40">{statusLabel(a.status)}</span>
                  </td>
                </tr>
              ))}
              {!loading && !rows.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    No Sakura appointments for this chamber and date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
