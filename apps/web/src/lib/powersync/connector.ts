import type { CommonPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from "@powersync/web";

export interface Rejected {
  table: string;
  id: string;
  reason: string;
}

/**
 * The server refused some writes (validation in apps/web/src/lib/sync-upload.ts — keep those rules
 * and the client-side checks in sync). The next checkpoint restores the server's row, so tell the
 * user instead of letting the change silently disappear.
 */
function reportRejected(list: Rejected[]) {
  console.warn("sync: server rejected changes", list);
  window.dispatchEvent(new CustomEvent<Rejected[]>("rx-sync-rejected", { detail: list }));
}

/** Fetches a short-lived sync token from our server and uploads local writes to /api/sync/upload. */
export class BackendConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const res = await fetch("/api/sync/token", { cache: "no-store" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`sync token ${res.status}`);
    const { endpoint, token } = (await res.json()) as PowerSyncCredentials;
    return { endpoint, token };
  }

  async uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    const tx = await db.getNextCrudTransaction();
    if (!tx) return;
    const batch = tx.crud.map((e) => ({ op: e.op, table: e.table, id: e.id, data: e.opData ?? {} }));
    const res = await fetch("/api/sync/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    // 4xx other than auth = permanent rejection: drop the transaction so the queue is not blocked forever
    // (the server logs it; the next sync restores the authoritative row). 401/5xx/network = retry.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
      if (!res.ok) {
        reportRejected([{ table: "*", id: "*", reason: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }]);
      } else {
        const body = (await res.json().catch(() => ({}))) as { rejected?: Rejected[] };
        if (body.rejected?.length) reportRejected(body.rejected);
      }
      await tx.complete();
      return;
    }
    throw new Error(`sync upload ${res.status}`);
  }
}
