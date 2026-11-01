"use client";

import { useQuery } from "@powersync/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSession } from "./context";
import type { ChamberRow } from "./hooks";

const RX_CHAMBER_KEY = "rx.chamber";

type ChamberContextValue = {
  chambers: ChamberRow[];
  current: ChamberRow | null;
  select: (id: string) => void;
};

const ChamberContext = createContext<ChamberContextValue | null>(null);

/** Single active-chamber selection shared across the doctor app (no reload on change). */
export function ChamberProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const { data } = useQuery<ChamberRow>(
    "SELECT * FROM chamber WHERE is_active = 1 OR is_active IS NULL ORDER BY (doctor_user_id = ?) DESC, name",
    [userId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSelectedId(localStorage.getItem(RX_CHAMBER_KEY));
    } catch {
      // storage unavailable
    }
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(RX_CHAMBER_KEY, id);
    } catch {
      // storage unavailable
    }
  }, []);

  const current = useMemo(() => data.find((c) => c.id === selectedId) ?? data[0] ?? null, [data, selectedId]);

  const value = useMemo(() => ({ chambers: data, current, select }), [data, current, select]);

  return <ChamberContext.Provider value={value}>{children}</ChamberContext.Provider>;
}

export function useChambers(): ChamberContextValue {
  const ctx = useContext(ChamberContext);
  if (!ctx) throw new Error("useChambers must be used within ChamberProvider");
  return ctx;
}
