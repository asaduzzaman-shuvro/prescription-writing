"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useChambers } from "@/lib/doctor/hooks";

function chamberLabel(name: string | undefined) {
  return (name ?? "No chamber").replace(/\s*\n\s*/g, " ").trim();
}

const rowShell =
  "inline-flex w-full max-w-xl items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-900/[0.04] sm:w-auto";

/** Active RxPad chamber selector — icon, label, and value on one row. */
export function ActiveChamberSelector({ className = "" }: { className?: string }) {
  const { chambers, current: chamber, select } = useChambers();
  const name = chamberLabel(chamber?.name);

  if (!chambers.length) {
    return (
      <div className={`${rowShell} border-amber-200/80 bg-amber-50/90 ${className}`} data-testid="active-chamber">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="shrink-0 text-[11px] font-semibold tracking-wide text-amber-900 uppercase">Active chamber</span>
        <span className="min-w-0 truncate text-sm text-amber-900">Add in Settings</span>
      </div>
    );
  }

  return (
    <div className={`${rowShell} ${className}`} data-testid="active-chamber">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white shadow-sm shadow-brand-600/20">
        <MapPin className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Active chamber</span>
      {chambers.length > 1 ? (
        <div className="relative min-w-[8rem] flex-1 sm:min-w-[10rem] sm:max-w-[16rem]">
          <select
            className="input h-8 w-full cursor-pointer appearance-none truncate py-0 pr-8 pl-2.5 text-sm font-medium text-slate-900"
            value={chamber?.id ?? ""}
            onChange={(e) => select(e.target.value)}
            aria-label="Active chamber"
            title={name}
          >
            {chambers.map((c) => (
              <option key={c.id} value={c.id}>
                {chamberLabel(c.name)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        </div>
      ) : (
        <span className="input flex h-8 min-w-[8rem] flex-1 items-center truncate px-2.5 text-sm font-medium text-slate-900 sm:max-w-[16rem]" title={name}>
          {name}
        </span>
      )}
    </div>
  );
}
