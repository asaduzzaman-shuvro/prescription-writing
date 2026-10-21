"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setTenantStatus } from "./actions";

export type TenantAccountStatus = "pending" | "active" | "suspended";

export function accountSelectClass(status: TenantAccountStatus) {
  if (status === "active") return "border-emerald-200/90 bg-emerald-50 text-emerald-900 ring-emerald-200/60";
  if (status === "pending") return "border-amber-200/90 bg-amber-50 text-amber-950 ring-amber-200/60";
  return "border-slate-200 bg-slate-100 text-slate-800 ring-slate-200/80";
}

type PendingConfirm = "inactive" | "pending" | null;

export function AccountStatusSelect({ tenantId, status }: { tenantId: string; status: TenantAccountStatus }) {
  const router = useRouter();
  const [draft, setDraft] = useState(status);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setDraft(status), [status]);

  function apply(next: TenantAccountStatus) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("status", next);
      await setTenantStatus(fd);
      router.refresh();
      setConfirm(null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">Account</label>
      <select
        className={`rounded-lg border py-1.5 pl-2.5 pr-8 text-sm font-medium shadow-sm ring-1 transition-colors ${accountSelectClass(draft)}`}
        value={draft}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as TenantAccountStatus;
          setDraft(next);
          if (next === status) return;
          if (next === "suspended") setConfirm("inactive");
          else if (next === "pending") setConfirm("pending");
          else apply("active");
        }}
      >
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="suspended">Inactive</option>
      </select>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => { setConfirm(null); setDraft(status); }} />
          <div className="relative max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <p className="text-sm font-medium text-slate-900">
              {confirm === "inactive" ? "Set account inactive?" : "Set account pending?"}
            </p>
            <p className="mt-1 text-xs text-slate-600">The doctor will not be able to sign in until the account is Active.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => { setConfirm(null); setDraft(status); }}>Cancel</button>
              <button
                type="button"
                className={confirm === "inactive" ? "btn-danger text-xs" : "btn-primary text-xs"}
                disabled={pending}
                onClick={() => apply(confirm === "inactive" ? "suspended" : "pending")}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
