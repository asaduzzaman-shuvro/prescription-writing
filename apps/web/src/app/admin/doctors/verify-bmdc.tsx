"use client";

import { ExternalLink, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { verifyBmdc } from "./actions";

export function VerifyBmdcBar({
  userId,
  nameEn,
  bmdcNumber,
  verifiedAt,
}: {
  userId: string;
  nameEn: string;
  bmdcNumber: string;
  verifiedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const verified = Boolean(verifiedAt);

  function run(verifiedNext: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("verified", verifiedNext ? "1" : "0");
      await verifyBmdc(fd);
      router.refresh();
      setConfirmRevoke(false);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {verified ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Verified{verifiedAt && ` · ${new Date(verifiedAt).toLocaleDateString("en-GB")}`}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80">
          <ShieldOff className="h-3.5 w-3.5" aria-hidden />
          Unverified
        </span>
      )}
      {verified ? (
        <button type="button" className="text-xs font-medium text-slate-600 hover:text-red-700" disabled={pending} onClick={() => setConfirmRevoke(true)}>
          Revoke
        </button>
      ) : (
        <button type="button" className="btn-secondary py-1 text-xs" disabled={pending} onClick={() => run(true)}>
          Mark verified
        </button>
      )}
      <a
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
        href={`https://www.bmdc.org.bd/search-doctor?search=${encodeURIComponent(bmdcNumber)}`}
        target="_blank"
        rel="noreferrer"
      >
        BMDC lookup
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => setConfirmRevoke(false)} />
          <div className="relative max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <p className="text-sm font-medium text-slate-900">Revoke verification for {nameEn}?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmRevoke(false)}>Cancel</button>
              <button type="button" className="btn-danger text-xs" disabled={pending} onClick={() => run(false)}>Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
