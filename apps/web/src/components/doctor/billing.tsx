"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/doctor/context";

interface Status {
  plan: string;
  planExpiresAt: string | null;
  smsCredits: number;
  online: boolean;
  prices: Record<string, { name: string; monthly: number; yearly: number }>;
  payments: { createdAt: string; plan: string; months: number; amount: string; method: string; status: string }[];
}

/** Subscription panel (needs internet; billing is not part of the offline data). */
export function BillingPanel() {
  const session = useSession();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    fetch("/api/billing/status").then(async (r) => (r.ok ? setSt(await r.json()) : setErr("Could not load billing"))).catch(() => setErr("Billing needs an internet connection"));
  }, []);
  if (session.tenantRole === "assistant") return null;
  async function pay(plan: string, months: number) {
    const r = await fetch("/api/billing/sslcommerz/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, months }) });
    const j = await r.json();
    if (j.url) window.location.href = j.url;
    else setErr(j.error);
  }
  return (
    <section className="card space-y-1.5 p-2.5 text-sm">
      <h2 className="font-semibold">Subscription</h2>
      {err && <p className="text-amber-700">{err}</p>}
      {st && (
        <>
          <p>Plan <b>{st.prices[st.plan]?.name ?? st.plan}</b> · {st.planExpiresAt ? <>paid until <b>{st.planExpiresAt}</b></> : "trial"} · SMS credit <b>{st.smsCredits}</b></p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(st.prices).map(([k, p]) => (
              <span key={k} className="flex gap-1">
                <button className="btn-secondary" disabled={!st.online} onClick={() => pay(k, 1)}>{p.name} 1 month ৳{p.monthly}</button>
                <button className="btn-secondary" disabled={!st.online} onClick={() => pay(k, 12)}>{p.name} 1 year ৳{p.yearly}</button>
              </span>
            ))}
          </div>
          {!st.online && <p className="text-xs text-slate-500">Online payment is not enabled yet — pay by bKash/Nagad/bank and send the TrxID to RxPad support.</p>}
          {st.payments.length > 0 && (
            <ul className="text-xs text-slate-600">{st.payments.map((p, i) => <li key={i}>{p.createdAt.slice(0, 10)} · {p.plan} × {p.months} · ৳{p.amount} · {p.method} · {p.status}</li>)}</ul>
          )}
        </>
      )}
    </section>
  );
}
