"use client";

import type { PowerSyncDatabase } from "@powersync/web";
import { useSyncExternalStore } from "react";
import { CATALOGUE_SYNC_TABLES, CLINIC_SYNC_TABLES, SYNC_COLUMNS } from "@/lib/sync-tables";
import { normalizeEtag, type SyncRow } from "@/lib/sync-shape";
import { BackendConnector } from "./connector";

export interface CustomSyncState {
  mode: "powersync" | "custom";
  clinicReady: boolean;
  fullReady: boolean;
  syncing: boolean;
  error: string | null;
}

const initial: CustomSyncState = {
  mode: "powersync",
  clinicReady: false,
  fullReady: false,
  syncing: false,
  error: null,
};

let state = initial;
const listeners = new Set<() => void>();
let syncScope = "";
let generation = 0;
let runningGen: number | null = null;
let stopListeners: (() => void) | null = null;

function emit(patch: Partial<CustomSyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCustomSync(): CustomSyncState {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}

class SyncNotice extends Error {}

interface PullBody {
  clinic?: Record<string, SyncRow[]>;
  catalogue?: Record<string, SyncRow[]>;
  error?: string;
}

async function crudCount(db: PowerSyncDatabase): Promise<number> {
  try {
    const row = await db.get<{ n: number }>(`SELECT count(*) AS n FROM ps_crud`);
    return Number(row.n) || 0;
  } catch {
    return 0;
  }
}

/** Rows the user changed locally and that must not be overwritten by a download. */
async function localEdits(db: PowerSyncDatabase): Promise<Map<string, Set<string>> | "unknown"> {
  const queued = await crudCount(db);
  if (queued === 0) return new Map();
  try {
    const rows = await db.getAll<{ table_name: string | null; id: string | null }>(
      `SELECT COALESCE(json_extract(data, '$.type'), json_extract(data, '$.table')) AS table_name,
              json_extract(data, '$.id') AS id
         FROM ps_crud`,
    );
    const map = new Map<string, Set<string>>();
    let parsed = 0;
    for (const row of rows) {
      if (!row.table_name || row.id == null) continue;
      parsed++;
      let set = map.get(row.table_name);
      if (!set) map.set(row.table_name, (set = new Set()));
      set.add(String(row.id));
    }
    return parsed > 0 ? map : "unknown";
  } catch {
    return "unknown";
  }
}

async function uploadAll(db: PowerSyncDatabase) {
  const connector = new BackendConnector();
  for (let i = 0; i < 50; i++) {
    const before = await crudCount(db);
    if (before === 0) return;
    await connector.uploadData(db);
    const after = await crudCount(db);
    if (after >= before) throw new SyncNotice("Some changes are still waiting to upload");
  }
}

async function revision(part: string): Promise<string | null> {
  try {
    return localStorage.getItem(`rx-sync-etag:${syncScope}:${part}`);
  } catch {
    return null;
  }
}

function rememberRevision(part: string, etag: string) {
  try {
    localStorage.setItem(`rx-sync-etag:${syncScope}:${part}`, etag);
  } catch {
    // Private mode can refuse storage. The next sync just downloads again.
  }
}

/** Only send If-None-Match when this browser already has rows. An empty table must download. */
async function usableEtag(db: PowerSyncDatabase, part: string, probe: string): Promise<string | null> {
  const etag = await revision(part);
  if (!etag) return null;
  try {
    const row = await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${probe}`);
    return Number(row?.n) > 0 ? etag : null;
  } catch {
    return null;
  }
}

async function applyTables(db: PowerSyncDatabase, tables: readonly string[], data: Record<string, SyncRow[]>, dirty: Map<string, Set<string>>) {
  await db.writeTransaction(async (tx) => {
    let checkpoint = -1;
    try {
      const row = await tx.get<{ m: number | null }>(`SELECT COALESCE(MAX(id), 0) AS m FROM ps_crud`);
      checkpoint = Number(row.m) || 0;
    } catch {
      checkpoint = -1;
    }
    for (const table of tables) {
      const cols = SYNC_COLUMNS[table];
      if (!cols) continue;
      const rows = data[table] ?? [];
      const keep = dirty.get(table) ?? new Set<string>();
      if (keep.size === 0) {
        await tx.execute(`DELETE FROM ${table}`);
      } else {
        const marks = [...keep];
        await tx.execute(`DELETE FROM ${table} WHERE id NOT IN (${marks.map(() => "?").join(", ")})`, marks);
      }
      const fresh = rows.filter((row) => !keep.has(String(row.id)));
      const sqlText = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      for (let i = 0; i < fresh.length; i += 200) {
        const chunk = fresh.slice(i, i + 200);
        await tx.executeBatch(sqlText, chunk.map((row) => cols.map((col) => row[col] ?? null)));
      }
    }
    if (checkpoint >= 0) await tx.execute(`DELETE FROM ps_crud WHERE id > ?`, [checkpoint]);
  });
}

interface PartFetch {
  unchanged: boolean;
  rows?: Record<string, SyncRow[]>;
  etag: string | null;
}

async function fetchPart(part: "clinic" | "catalogue", etag: string | null, gen: number): Promise<PartFetch> {
  const res = await fetch(`/api/sync/pull?part=${part}`, {
    cache: "no-store",
    headers: etag ? { "if-none-match": `"${etag}"` } : {},
  });
  if (gen !== generation) return { unchanged: true, etag };
  if (res.status === 401) throw new SyncNotice("Sign in again to sync");
  if (res.status === 402 || res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as PullBody;
    throw new SyncNotice(body.error || "This chamber cannot sync");
  }
  if (res.status === 304) return { unchanged: true, etag: normalizeEtag(res.headers.get("etag")) ?? etag };
  const body = (await res.json().catch(() => ({}))) as PullBody;
  if (!res.ok) throw new Error(`sync pull ${res.status}`);
  const rows = part === "clinic" ? body.clinic : body.catalogue;
  const tables = part === "clinic" ? CLINIC_SYNC_TABLES : CATALOGUE_SYNC_TABLES;
  if (!rows) throw new Error(`sync pull missing ${part}`);
  for (const table of tables) {
    if (!Object.prototype.hasOwnProperty.call(rows, table)) throw new Error(`sync pull missing ${table}`);
  }
  return { unchanged: false, rows, etag: normalizeEtag(res.headers.get("etag")) };
}

async function pull(db: PowerSyncDatabase, gen: number) {
  const dirty = await localEdits(db);
  if (dirty === "unknown") throw new SyncNotice("Some changes are still waiting to upload");
  if (gen !== generation) return;
  const [clinicEtag, catalogueEtag] = await Promise.all([
    usableEtag(db, "clinic", "specialty"),
    usableEtag(db, "catalogue", "dosage_form"),
  ]);
  // Start both downloads together. The screen opens as soon as the smaller clinic half is in.
  const clinicReq = fetchPart("clinic", clinicEtag, gen);
  const catalogueReq = fetchPart("catalogue", catalogueEtag, gen);
  const clinic = await clinicReq;
  if (gen !== generation) return;
  if (!clinic.unchanged && clinic.rows) {
    await applyTables(db, CLINIC_SYNC_TABLES, clinic.rows, dirty);
    if (clinic.etag) rememberRevision("clinic", clinic.etag);
  }
  if (gen !== generation) return;
  emit({ clinicReady: true, error: null, syncing: true });
  const catalogue = await catalogueReq;
  if (gen !== generation) return;
  if (!catalogue.unchanged && catalogue.rows) {
    await applyTables(db, CATALOGUE_SYNC_TABLES, catalogue.rows, dirty);
    if (catalogue.etag) rememberRevision("catalogue", catalogue.etag);
  }
  if (gen !== generation) return;
  emit({ fullReady: true, syncing: false, error: null });
}

async function run(gen: number, db: PowerSyncDatabase) {
  if (gen !== generation || runningGen === gen) return;
  runningGen = gen;
  emit({ mode: "custom", syncing: true });
  try {
    try {
      await uploadAll(db);
    } catch (e) {
      if (gen !== generation) return;
      if (!(e instanceof SyncNotice)) console.warn("custom sync upload", e);
    }
    if (gen !== generation) return;
    await pull(db, gen);
  } catch (e) {
    if (gen !== generation) return;
    if (!(e instanceof SyncNotice)) console.warn("custom sync", e);
    emit({
      clinicReady: true,
      syncing: false,
      error: e instanceof SyncNotice ? e.message : "Couldn't sync with the server",
    });
  } finally {
    if (runningGen === gen) runningGen = null;
  }
}

/** Download and upload through /api/sync/pull and /api/sync/upload. No PowerSync server. */
export function startCustomSync(db: PowerSyncDatabase, scope: string) {
  stopListeners?.();
  stopListeners = null;
  syncScope = scope;
  const gen = ++generation;
  emit({ mode: "custom", syncing: true, error: null, clinicReady: false, fullReady: false });
  const tick = () => void run(gen, db);
  const timer = window.setInterval(tick, 20_000);
  window.addEventListener("online", tick);
  stopListeners = () => {
    window.clearInterval(timer);
    window.removeEventListener("online", tick);
  };
  tick();
}

export function stopCustomSync() {
  generation++;
  stopListeners?.();
  stopListeners = null;
  runningGen = null;
}
