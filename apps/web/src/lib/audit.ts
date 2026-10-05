import "server-only";
import { s } from "@rx/db";
import { headers } from "next/headers";
import { ownerDb } from "./db";

export interface AuditEntry {
  actorUserId: string | null;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Append-only audit trail (PDPA: keep processing records). */
export async function audit(e: AuditEntry) {
  let ip: string | null = null;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // called outside a request (scripts)
  }
  await ownerDb.insert(s.auditLog).values({
    actorUserId: e.actorUserId,
    tenantId: e.tenantId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    ip,
  });
}
