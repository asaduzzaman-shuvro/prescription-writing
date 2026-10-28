"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { AsyncPicker, type Option } from "@/components/admin/generic-picker";
import { mergeRequest, rejectRequest, searchMergeTargets } from "./actions";

/** Merge into an existing catalogue product, or leave the medicine private to its doctor with a note. */
export function ReviewActions({ requestId }: { requestId: string }) {
  const [target, setTarget] = useState<Option | null>(null);
  const [confirm, setConfirm] = useState<"merge" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    setError(undefined);
    start(async () => {
      const res = await action();
      if (res?.error) {
        setError(res.error);
        setConfirm(null);
      }
    });
  }

  return (
    <div className="card mb-4 grid gap-4 p-4 md:grid-cols-2">
      <div>
        <h2 className="mb-1 font-semibold">Merge into an existing medicine</h2>
        <p className="mb-2 text-xs text-slate-500">The doctor&apos;s entry is replaced by the catalogue medicine on their devices.</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <AsyncPicker value={target} onChange={setTarget} search={searchMergeTargets} placeholder="Search the catalogue…" />
          </div>
          <button type="button" className="btn-secondary" disabled={!target || busy} onClick={() => setConfirm("merge")} data-testid="request-merge">
            Merge
          </button>
        </div>
      </div>
      <div>
        <h2 className="mb-1 font-semibold">Don&apos;t approve</h2>
        <p className="mb-2 text-xs text-slate-500">The medicine stays private to the doctor, who sees your note.</p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm("reject")} data-testid="request-reject">
          Don&apos;t approve…
        </button>
      </div>
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}

      <ConfirmModal
        open={confirm === "merge"}
        title="Merge into the catalogue medicine?"
        message={`The doctor will see “${target?.name ?? ""}” instead of their own entry.`}
        confirmLabel="Merge"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => target && run(() => mergeRequest(requestId, target.id))}
      />
      <ConfirmModal
        open={confirm === "reject"}
        title="Don't approve this medicine?"
        message="Other doctors won't see it. The doctor who added it can keep prescribing it."
        confirmLabel="Don't approve"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => rejectRequest(requestId, note))}
      >
        <label className="mt-3 block">
          <span className="label">Note for the doctor (optional)</span>
          <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="request-reject-note" />
        </label>
      </ConfirmModal>
    </div>
  );
}
