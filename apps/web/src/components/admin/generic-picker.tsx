"use client";

import { useEffect, useRef, useState } from "react";

export interface Option {
  id: string;
  name: string;
}

/** Debounced async autocomplete; optional "create" entry when nothing matches. */
export function AsyncPicker({
  value,
  onChange,
  search,
  create,
  placeholder,
}: {
  value: Option | null;
  onChange: (o: Option | null) => void;
  search: (q: string) => Promise<Option[]>;
  create?: (name: string) => Promise<Option | { error: string }>;
  placeholder?: string;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [opts, setOpts] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setQ(value?.name ?? ""), [value?.id, value?.name]);

  function onInput(v: string) {
    setQ(v);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setOpts(await search(v)), 200);
  }

  return (
    <div className="relative">
      <input
        className="input"
        value={q}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => q.length >= 2 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q.length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-lg">
          {opts.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-brand-50"
                onMouseDown={() => {
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o.name}
              </button>
            </li>
          ))}
          {create && !opts.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) && (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-brand-700 hover:bg-brand-50"
                onMouseDown={async () => {
                  const r = await create(q);
                  if ("id" in r) onChange(r);
                  setOpen(false);
                }}
              >
                + Create “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
