"use client";

import { createContext, useContext } from "react";

export interface ClientSession {
  userId: string;
  name: string;
  tenantId: string;
  tenantRole: "clinic_admin" | "doctor" | "assistant";
  publicBaseUrl: string;
  /** Paid-until date of the chamber's subscription (null = trial / not set). */
  planExpiresAt: string | null;
}

const Ctx = createContext<ClientSession | null>(null);
export const SessionProvider = Ctx.Provider;

export function useSession(): ClientSession {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
