"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { accountSelectClass, type TenantAccountStatus } from "./account-status";
import { deleteDoctorChamber, setTenantStatus, verifyBmdc } from "./actions";

export type DoctorListRow = {
  tenantId: string;
  chamberName: string;
  status: TenantAccountStatus;
  userId: string;
  nameEn: string;
  bmdcNumber: string;
  bmdcExpiry: string | null;
  verifiedAt: string | null;
  specialty: string;
  rxCount: number;
};

type ConfirmKind = "delete" | "revoke-verify" | "status-inactive" | "status-pending";

function VerificationBadge({ verifiedAt }: { verifiedAt: string | null }) {
  return verifiedAt ? (
    <span className="badge bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80">Verified</span>
  ) : (
    <span className="badge bg-amber-50 text-amber-900 ring-1 ring-amber-200/80">Unverified</span>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" aria-label="Close" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl ring-1 ring-slate-900/5">
        <h2 id="confirm-title" className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RowActions({ row, today }: { row: DoctorListRow; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [statusDraft, setStatusDraft] = useState(row.status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatusDraft(row.status);
  }, [row.status]);
  const expired = row.bmdcExpiry && row.bmdcExpiry < today;
  const busy = pending;

  function runVerify(verified: boolean) {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("userId", row.userId);
      fd.set("verified", verified ? "1" : "0");
      await verifyBmdc(fd);
      router.refresh();
      setConfirm(null);
    });
  }

  function runStatus(status: DoctorListRow["status"]) {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("tenantId", row.tenantId);
      fd.set("status", status);
      await setTenantStatus(fd);
      router.refresh();
      setConfirm(null);
    });
  }

  function runDelete() {
    const fd = new FormData();
    fd.set("tenantId", row.tenantId);
    fd.set("userId", row.userId);
    startTransition(async () => {
      setError(null);
      const result = await deleteDoctorChamber(undefined, fd);
      if (result && "error" in result && result.error) {
        setError(result.error);
        setConfirm(null);
        return;
      }
      router.refresh();
      setConfirm(null);
    });
  }

  function cancelConfirm() {
    setConfirm(null);
    setStatusDraft(row.status);
  }

  const confirmCopy =
    confirm === "delete"
      ? {
          title: "Delete chamber?",
          message: `Remove ${row.nameEn} and chamber “${row.chamberName}”? This cannot be undone. Chambers with patients or prescriptions cannot be deleted.`,
          confirmLabel: "Delete",
          danger: true,
          onConfirm: runDelete,
        }
      : confirm === "revoke-verify"
        ? {
            title: "Revoke BMDC verification?",
            message: `${row.nameEn} will be marked unverified until you verify again.`,
            confirmLabel: "Revoke",
            danger: true,
            onConfirm: () => runVerify(false),
          }
        : confirm === "status-inactive"
          ? {
              title: "Set inactive?",
              message: `${row.nameEn} will not be able to sign in until the chamber is set to Active again.`,
              confirmLabel: "Set inactive",
              danger: true,
              onConfirm: () => runStatus("suspended"),
            }
          : confirm === "status-pending"
            ? {
                title: "Set pending?",
                message: `${row.nameEn} will not be able to sign in until you activate the chamber.`,
                confirmLabel: "Set pending",
                danger: false,
                onConfirm: () => runStatus("pending"),
              }
            : null;

  return (
    <>
      <tr className="align-middle">
        <td>
          <div className="flex min-w-[10rem] items-baseline justify-between gap-2">
            <Link href={`/admin/doctors/${row.tenantId}`} className="font-medium text-brand-800 hover:underline">
              {row.nameEn}
            </Link>
            <span className="shrink-0 text-[11px] text-slate-500">({row.specialty})</span>
          </div>
        </td>
        <td className="text-sm text-slate-700">{row.chamberName}</td>
        <td className="text-xs text-slate-800 whitespace-nowrap">
          <span className="font-mono">{row.bmdcNumber}</span>
          {row.bmdcExpiry && (
            <span className={expired ? "text-red-600" : "text-slate-500"}>
              {" "}
              ({expired ? `Expired ${row.bmdcExpiry}` : `Valid to ${row.bmdcExpiry}`})
            </span>
          )}
        </td>
        <td>
          <div className="flex flex-wrap items-center gap-1.5">
            <VerificationBadge verifiedAt={row.verifiedAt} />
            {row.verifiedAt ? (
              <button type="button" className="text-[11px] font-medium text-slate-500 hover:text-red-700" onClick={() => setConfirm("revoke-verify")}>
                Revoke
              </button>
            ) : (
              <button type="button" className="text-[11px] font-medium text-brand-700 hover:underline" onClick={() => runVerify(true)} disabled={busy}>
                Verify
              </button>
            )}
          </div>
        </td>
        <td>
          <select
            className={`w-full max-w-[7.5rem] rounded-lg border py-1 pl-2 pr-7 text-xs font-medium shadow-sm ring-1 transition-colors ${accountSelectClass(statusDraft)}`}
            value={statusDraft}
            disabled={busy}
            aria-label={`Account status for ${row.nameEn}`}
            onChange={(e) => {
              const next = e.target.value as DoctorListRow["status"];
              setStatusDraft(next);
              if (next === row.status) return;
              if (next === "suspended") setConfirm("status-inactive");
              else if (next === "pending") setConfirm("status-pending");
              else runStatus("active");
            }}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Inactive</option>
          </select>
        </td>
        <td className="tabular-nums text-sm text-slate-700">{row.rxCount}</td>
        <td>
          <div className="flex items-center gap-0.5">
            <Link
              href={`/admin/doctors/${row.tenantId}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-brand-800"
              aria-label={`Edit ${row.nameEn}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirm("delete")}
              disabled={busy}
              aria-label={`Delete ${row.nameEn}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {error && <p className="mt-0.5 max-w-[8rem] text-[10px] leading-tight text-red-600">{error}</p>}
        </td>
      </tr>
      {confirmCopy && (
        <ConfirmModal
          open
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          danger={confirmCopy.danger}
          busy={busy}
          onCancel={cancelConfirm}
          onConfirm={confirmCopy.onConfirm}
        />
      )}
    </>
  );
}

export function DoctorsList({ rows, today }: { rows: DoctorListRow[]; today: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Chamber</th>
              <th>BMDC</th>
              <th>Verification</th>
              <th>Account</th>
              <th>Final Rx</th>
              <th className="w-16">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <RowActions key={r.userId} row={r} today={today} />)}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">No doctors match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
