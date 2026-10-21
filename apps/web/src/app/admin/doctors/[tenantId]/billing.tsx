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
    <form action={action} className="grid gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div>
        <label className="label">Plan</label>
        <select name="plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="starter">Starter ৳700/mo</option>
          <option value="pro">Pro ৳1500/mo</option>
        </select>
      </div>
      <div>
        <label className="label">Months</label>
        <select name="months" className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Amount ৳</label>
        <input name="amount" className="input" defaultValue={amount} key={amount} />
      </div>
      <div>
        <label className="label">Method</label>
        <select name="method" className="input">
          <option value="bkash">bKash</option>
          <option value="nagad">Nagad</option>
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="label">TrxID / reference</label>
        <input name="reference" className="input" required />
      </div>
      <button className="btn-primary sm:col-span-2 lg:col-span-1" disabled={pending}>Record payment</button>
      {(state && "error" in state) || (state && "ok" in state) ? (
        <p className="text-sm sm:col-span-2 lg:col-span-6">
          {state && "error" in state && <span className="text-red-600">{state.error}</span>}
          {state && "ok" in state && <span className="text-emerald-700">Recorded — plan extended</span>}
        </p>
      ) : null}
    </form>
  );
}
