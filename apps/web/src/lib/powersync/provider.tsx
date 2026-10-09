"use client";

import { PowerSyncContext } from "@powersync/react";
import { PowerSyncDatabase } from "@powersync/web";
import { Suspense, type ReactNode } from "react";
import { BackendConnector } from "./connector";
import { startLabFileQueue, stopLabFileQueue } from "./lab-files";
import { AppSchema } from "./schema";

let db: PowerSyncDatabase | null = null;

/** One local database per browser profile per user (tab-shared via the SDK's shared worker). */
export function getDb(userId: string): PowerSyncDatabase {
  if (db) return db;
  db = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: `rxpad-${userId}.db`, disableSSRWarning: true },
  });
  db.connect(new BackendConnector());
  if (typeof window !== "undefined") startLabFileQueue(db, userId);
  return db;
}

/** Called on sign-out so the next user on this browser never sees the previous user's data. */
export async function disconnectAndClear() {
  if (!db) return;
  await stopLabFileQueue();
  await db.disconnectAndClear();
  db = null;
}

export function PowerSyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return (
    <Suspense>
      <PowerSyncContext.Provider value={getDb(userId)}>{children}</PowerSyncContext.Provider>
    </Suspense>
  );
}
