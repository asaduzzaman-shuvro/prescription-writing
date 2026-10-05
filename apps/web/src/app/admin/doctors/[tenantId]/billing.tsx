"use client";

import { useActionState, useState } from "react";
import { recordPayment } from "../actions";

const PRICE: Record<string, number> = { starter: 700, pro: 1500 };

export function RecordPaymentForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(recordPayment, undefined);
  const [plan, setPlan] = useState("starter");
  const [months, setMonths] = useState(1);
  const amount = months >= 12 ? Math.round((PRICE[plan]! * 10 * months) / 12) : PRICE[plan]! * months;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div><label className="label">Plan</label><select name="plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="starter">Starter ৳700/mo</option><option value="pro">Pro ৳1500/mo</option></select></div>
      <div><label className="label">Months</label><select name="months" className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
      <div><label className="label">Amount ৳</label><input name="amount" className="input w-24" defaultValue={amount} key={amount} /></div>
      <div><label className="label">Method</label><select name="method" className="input"><option value="bkash">bKash</option><option value="nagad">Nagad</option><option value="bank">Bank</option><option value="cash">Cash</option></select></div>
      <div><label className="label">TrxID / reference</label><input name="reference" className="input" required /></div>
      <button className="btn-primary" disabled={pending}>Record payment</button>
      {state && "error" in state && <span className="text-sm text-red-600">{state.error}</span>}
      {state && "ok" in state && <span className="text-sm text-green-700">Recorded — plan extended</span>}
    </form>
  );
}
