"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { rejectComplaint, replaceOriginal, shareComplaint } from "./actions";

export interface ReviewRequest {
  id: string;
  name: string;
  nameBn: string | null;
  /** The shared line this request edits, if it is an edit. */
  original: string | null;
  doctorSpecialty: { code: string; name: string } | null;
}

/** Share a doctor's line with every doctor (optionally fixing its text), replace the shared line it edits, or decline. */
export function ComplaintReviewActions({ request }: { request: ReviewRequest }) {
  const [confirm, setConfirm] = useState<"share" | "replace" | "reject" | null>(null);
  const [name, setName] = useState(request.name);
  const [nameBn, setNameBn] = useState(request.nameBn ?? "");
  const [specialty, setSpecialty] = useState("");
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

  const textFields = (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="label">C/C line</span>
        <input className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid="cc-review-name" />
      </label>
      <label className="block">
        <span className="label">Bangla (optional)</span>
        <input className="input" maxLength={120} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
      </label>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className="btn-primary h-7 px-2 text-xs" disabled={busy} onClick={() => setConfirm("share")} data-testid={`cc-share-${request.id}`}>
        Share with all doctors
      </button>
      {request.original && (
        <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={busy} onClick={() => setConfirm("replace")} data-testid={`cc-replace-${request.id}`}>
          Replace “{request.original}”
        </button>
      )}
      <button type="button" className="btn-ghost h-7 px-2 text-xs" disabled={busy} onClick={() => setConfirm("reject")} data-testid={`cc-reject-${request.id}`}>
        Don&apos;t share…
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}

      <ConfirmModal
        open={confirm === "share"}
        title="Share this C/C line with all doctors?"
        message="It is added to the shared C/C list. Every doctor gets it on their next sync."
        confirmLabel="Share"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => shareComplaint(request.id, { name, nameBn, specialtyCode: specialty || null }))}
      >
        {textFields}
        <label className="mt-2 block">
          <span className="label">Suggest to</span>
          <select className="input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} data-testid="cc-review-specialty">
            <option value="">All specialties</option>
            {request.doctorSpecialty && <option value={request.doctorSpecialty.code}>{request.doctorSpecialty.name} only</option>}
          </select>
        </label>
      </ConfirmModal>
      <ConfirmModal
        open={confirm === "replace"}
        title={`Replace “${request.original ?? ""}” for everyone?`}
        message="The shared line is rewritten. Every doctor sees the new text instead of the original."
        confirmLabel="Replace"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => replaceOriginal(request.id, { name, nameBn }))}
      >
        {textFields}
      </ConfirmModal>
      <ConfirmModal
        open={confirm === "reject"}
        title="Don't share this line?"
        message="Other doctors won't get it. The doctor who added it keeps using it."
        confirmLabel="Don't share"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => rejectComplaint(request.id, note))}
      >
        <label className="mt-3 block">
          <span className="label">Note for the doctor (optional)</span>
          <textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ConfirmModal>
    </div>
  );
}
