"use client";

import type { LabFileRef } from "@rx/core";
import { AttachmentQueue, IndexDBFileSystemStorageAdapter, type AbstractPowerSyncDatabase, type AttachmentRecord, type PowerSyncDatabase, type RemoteStorageAdapter } from "@powersync/web";

/**
 * Photos/PDFs of lab reports on the device. A file taken offline is kept in IndexedDB and uploaded to
 * /api/lab-files when online (PowerSync's attachment queue, still marked alpha by PowerSync). Files are
 * not downloaded to every device: another device shows them on demand from the server.
 */

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface FileMeta {
  patient_id: string;
  lab_report_id: string;
}

const remote: RemoteStorageAdapter = {
  async uploadFile(data: ArrayBuffer, a: AttachmentRecord) {
    const meta = JSON.parse(a.metaData ?? "{}") as FileMeta;
    const form = new FormData();
    form.append("file", new Blob([data], { type: a.mediaType ?? "application/octet-stream" }));
    form.append("id", a.id);
    form.append("patient_id", meta.patient_id);
    form.append("lab_report_id", meta.lab_report_id);
    const res = await fetch("/api/lab-files", { method: "POST", body: form });
    if (!res.ok) throw new HttpError(res.status, await res.text());
  },
  async downloadFile(a: AttachmentRecord) {
    const res = await fetch(`/api/lab-files/${a.id}`);
    if (!res.ok) throw new HttpError(res.status, await res.text());
    return res.arrayBuffer();
  },
  async deleteFile(a: AttachmentRecord) {
    const res = await fetch(`/api/lab-files/${a.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new HttpError(res.status, await res.text());
  },
};

/** Retry while offline, signed out or waiting for the patient to sync (409); give up on a file the server refuses. */
const retryable = (e: unknown) => !(e instanceof HttpError) || e.status === 401 || e.status === 409 || e.status >= 500;

let queue: AttachmentQueue | null = null;

export function startLabFileQueue(db: PowerSyncDatabase, userId: string): AttachmentQueue {
  if (queue) return queue;
  queue = new AttachmentQueue({
    db,
    localStorage: new IndexDBFileSystemStorageAdapter(`rxpad-lab-files-${userId}`),
    remoteStorage: remote,
    downloadAttachments: false,
    // Retry soon after a file is refused for now (e.g. its patient hasn't reached the server yet).
    syncIntervalMs: 10_000,
    archivedCacheLimit: 50,
    watchAttachments: (onUpdate, signal) => {
      db.watch(
        `SELECT files FROM lab_report WHERE deleted_at IS NULL AND files IS NOT NULL AND files <> '[]'`,
        [],
        {
          onResult: (r) => {
            const rows = (r.rows?._array ?? []) as { files: string }[];
            const refs = rows.flatMap((x) => {
              try {
                return JSON.parse(x.files) as LabFileRef[];
              } catch {
                return [];
              }
            });
            void onUpdate(refs.map((f) => ({ id: f.id, fileExtension: extensionOf(f.type), mediaType: f.type })));
          },
        },
        { signal },
      );
    },
    errorHandler: {
      async onUploadError(a, e) {
        if (retryable(e)) return true;
        window.dispatchEvent(new CustomEvent("rx-sync-rejected", { detail: [{ table: "lab_file", id: a.id, reason: (e as Error).message }] }));
        return false;
      },
      onDownloadError: async (_a, e) => retryable(e) && !(e instanceof HttpError && e.status === 404),
      onDeleteError: async (_a, e) => retryable(e),
    },
  });
  void queue.startSync();
  return queue;
}

export function labFileQueue(): AttachmentQueue {
  if (!queue) throw new Error("lab file queue not started");
  return queue;
}

/** Sign-out: forget this user's files on the device. */
export async function stopLabFileQueue() {
  if (!queue) return;
  await queue.stopSync();
  await queue.localStorage.clear();
  queue = null;
}

export const extensionOf = (type: string) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" })[type] ?? "bin";

/** Queue a new file for upload; it is readable on this device straight away. */
export async function addLabFile(f: { id: string; type: LabFileRef["type"]; data: ArrayBuffer; patientId: string; labReportId: string }) {
  await labFileQueue().saveFile({
    id: f.id,
    data: f.data,
    fileExtension: extensionOf(f.type),
    mediaType: f.type,
    metaData: JSON.stringify({ patient_id: f.patientId, lab_report_id: f.labReportId } satisfies FileMeta),
  });
}

/** Delete everywhere (queued until online). */
export async function removeLabFile(id: string) {
  await labFileQueue().deleteFile({ id });
}

/** The file's bytes: from this device if it has them, otherwise from the server (needs a connection). */
export async function readLabFile(db: AbstractPowerSyncDatabase, ref: LabFileRef): Promise<Blob> {
  const row = await db.getOptional<{ local_uri: string | null }>(`SELECT local_uri FROM attachments WHERE id = ?`, [ref.id]);
  if (row?.local_uri) {
    try {
      return new Blob([await labFileQueue().localStorage.readFile(row.local_uri)], { type: ref.type });
    } catch {
      // fall through to the server
    }
  }
  const res = await fetch(`/api/lab-files/${ref.id}`);
  if (!res.ok) throw new Error(res.status === 404 ? "This file isn't on the server yet." : navigator.onLine ? `Couldn't load the file (${res.status}).` : "Available when online.");
  return new Blob([await res.arrayBuffer()], { type: ref.type });
}
