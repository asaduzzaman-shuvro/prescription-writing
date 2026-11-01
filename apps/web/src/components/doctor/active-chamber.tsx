"use client";

import { useChambers } from "@/lib/doctor/hooks";

/** Active RxPad chamber selector (shared across dashboard, patients, bookings). */
export function ActiveChamberSelector({ className = "" }: { className?: string }) {
  const { chambers, current: chamber, select } = useChambers();

  if (!chambers.length) {
    return (
      <div
        className={`rounded-lg border border-amber-200/80 bg-amber-50 px-2 py-1.5 text-right shadow-sm ring-1 ring-amber-100/80 ${className}`}
        data-testid="active-chamber"
      >
        <div className="text-[10px] font-semibold tracking-wide text-amber-800 uppercase">Active chamber</div>
        <div className="text-sm font-medium text-amber-900">Add a chamber in Settings</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-brand-200/80 bg-gradient-to-br from-brand-50 to-white px-2 py-1.5 text-right shadow-sm ring-1 ring-brand-100/80 ${className}`}
      data-testid="active-chamber"
    >
      <div className="text-[10px] font-semibold tracking-wide text-brand-700 uppercase">Active chamber</div>
      {chambers.length > 1 ? (
        <select
          className="mt-0.5 h-7 w-auto max-w-64 bg-transparent text-right text-sm font-semibold text-slate-900 outline-none"
          value={chamber?.id ?? ""}
          onChange={(e) => select(e.target.value)}
          aria-label="Active chamber"
        >
          {chambers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name.replace(/\s*\n\s*/g, " ")}
            </option>
          ))}
        </select>
      ) : (
        <div className="text-sm font-semibold whitespace-pre-line text-slate-900">{chamber?.name ?? "No chamber selected"}</div>
      )}
    </div>
  );
}
