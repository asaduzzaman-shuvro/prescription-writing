"use client";

import { PowerSyncContext } from "@powersync/react";
import { createConsoleLogger, LogLevels, PowerSyncDatabase } from "@powersync/web";
import { Suspense, type ReactNode } from "react";
import { startCustomSync, stopCustomSync } from "./custom-sync";
import { clearLabFileQueue, startLabFileQueue, stopLabFileQueue } from "./lab-files";
import { AppSchema } from "./schema";

let db: PowerSyncDatabase | null = null;
let dbKey: string | null = null;

const consoleLogger = createConsoleLogger({ prefix: "sync", minLevel: LogLevels.info });
/** Drop multi-tab capability notices when SharedWorker is unavailable (some embeds / browsers). */
const logger = {
  ...consoleLogger,
  log(entry: { level: number; message: string; error?: unknown }) {
    if (/Multiple tabs? (support is not enabled|are not enabled in this browser)/i.test(entry.message)) {
      return;
    }
    consoleLogger.log(entry);
  },
};

function keyFor(userId: string, tenantId: string) {
  return `${userId}:${tenantId}`;
}

/** One local database per browser profile per user+tenant (so chamber switches do not mix data). */
export function getDb(userId: string, tenantId: string): PowerSyncDatabase {
  const key = keyFor(userId, tenantId);
  if (db && dbKey === key) return db;
  if (db) {
    // Previous chamber's file stays on disk for a later switch-back; only disconnect.
    stopCustomSync();
    void stopLabFileQueue();
    void db.disconnect();
    db = null;
    dbKey = null;
  }
  const enableMultiTabs = typeof SharedWorker !== "undefined";
  db = new PowerSyncDatabase({
    schema: AppSchema,
    logger,
    database: {
      dbFilename: `rxpad-${userId}-${tenantId}.db`,
      disableSSRWarning: true,
      enableMultiTabs,
    },
  });
  dbKey = key;
  if (typeof window !== "undefined") {
    startLabFileQueue(db, userId);
    startCustomSync(db, key);
  }
  return db;
}

/**
 * Sign-out: stop sync quickly and leave the local DB on disk.
 * Each user+tenant has its own file, so the next login as the same doctor is instant
 * (no re-download of the medicine catalogue). A hard wipe is disconnectAndClear().
 */
export async function disconnectSession() {
  if (!db) return;
  stopCustomSync();
  await stopLabFileQueue();
  await db.disconnect();
  db = null;
  dbKey = null;
}

/** Hard wipe (e.g. shared PC). soft:true keeps sync metadata so the same user re-logins fast. */
export async function disconnectAndClear() {
  if (!db) return;
  stopCustomSync();
  await clearLabFileQueue();
  await db.disconnectAndClear({ soft: true });
  db = null;
  dbKey = null;
}

/** Switch chamber: drop the live connection (keep local file) so the next getDb opens the other tenant. */
export async function disconnectForChamberSwitch() {
  if (!db) return;
  stopCustomSync();
  await stopLabFileQueue();
  await db.disconnect();
  db = null;
  dbKey = null;
}

export function PowerSyncProvider({
  userId,
  tenantId,
  children,
}: {
  userId: string;
  tenantId: string;
  children: ReactNode;
}) {
  return (
    <Suspense>
      <PowerSyncContext.Provider value={getDb(userId, tenantId)}>{children}</PowerSyncContext.Provider>
    </Suspense>
  );
}
