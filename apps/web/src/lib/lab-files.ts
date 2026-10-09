import "server-only";
import { LAB_FILE_MAX_BYTES, sniffLabFileType } from "@rx/core";
import { s, withTenant } from "@rx/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { audit } from "./audit";
import { appDb } from "./db";
import type { Session } from "./session";

/**
 * Photos and PDFs of lab reports. Devices upload them through /api/lab-files (queued while offline) and fetch
 * them on demand; nothing here is synced. All access runs on the RLS connection, so a clinic only ever sees its own.
 * The audit log records ids, sizes and types, never the file.
 */

type Clinic = Session & { tenantId: string };

export class LabFileError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function storeLabFile(session: Clinic, f: { id: unknown; patientId: unknown; labReportId: unknown; bytes: Uint8Array }) {
  if (!isUuid(f.id) || !isUuid(f.patientId) || !isUuid(f.labReportId)) throw new LabFileError(400, "invalid ids");
  if (f.bytes.length === 0) throw new LabFileError(400, "empty file");
  if (f.bytes.length > LAB_FILE_MAX_BYTES) throw new LabFileError(413, "file too large (max 5 MB)");
  // The type comes from the bytes, not from the name or the browser.
  const contentType = sniffLabFileType(f.bytes);
  if (!contentType) throw new LabFileError(415, "only JPEG, PNG, WebP photos or PDF");
  const { id, patientId, labReportId } = f;
  await withTenant(appDb, { tenantId: session.tenantId, userId: session.userId }, async (tx) => {
    const [p] = await tx.select({ consent: s.patient.reportFilesConsentAt }).from(s.patient).where(eq(s.patient.id, patientId));
    // Taken offline: the patient (or their consent) may not have reached the server yet. 409 = try again later.
    if (!p) throw new LabFileError(409, "patient not synced yet");
    if (!p.consent) throw new LabFileError(409, "patient's consent to keep report photos not recorded yet");
    await tx
      .insert(s.labFile)
      .values({
        id, tenantId: session.tenantId, patientId, labReportId, contentType, sizeBytes: f.bytes.length,
        sha256: createHash("sha256").update(f.bytes).digest("hex"), data: Buffer.from(f.bytes), createdBy: session.userId,
      })
      // A retried upload is a no-op.
      .onConflictDoNothing({ target: s.labFile.id });
  });
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "lab_file.upload", entity: "lab_file", entityId: id, after: { contentType, size: f.bytes.length } });
}

export async function readLabFile(session: Clinic, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await withTenant(appDb, { tenantId: session.tenantId, userId: session.userId }, (tx) =>
    tx.select({ data: s.labFile.data, contentType: s.labFile.contentType }).from(s.labFile).where(and(eq(s.labFile.id, id), isNull(s.labFile.deletedAt))),
  );
  return row ?? null;
}

/** Removes the file for everyone: the bytes are wiped, the row stays as a record. Deleting twice is fine. */
export async function deleteLabFile(session: Clinic, id: string) {
  if (!isUuid(id)) throw new LabFileError(400, "invalid id");
  const wiped = await withTenant(appDb, { tenantId: session.tenantId, userId: session.userId }, (tx) =>
    tx
      .update(s.labFile)
      .set({ data: Buffer.alloc(0), sizeBytes: 0, deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(s.labFile.id, id), isNull(s.labFile.deletedAt)))
      .returning({ id: s.labFile.id }),
  );
  if (wiped.length) await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "lab_file.delete", entity: "lab_file", entityId: id });
}
