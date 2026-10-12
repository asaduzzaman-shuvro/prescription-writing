import { INT_COLUMNS, SYNC_COLUMNS } from "./sync-tables";

export type SyncRow = Record<string, string | number | null>;

/** Turn a Postgres value into the text/integer/real SQLite stores. */
export function shapeCell(value: unknown): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** One sync table's `json_agg` value, either already parsed or a JSON string. */
export function rowsFromBundle(table: string, value: unknown): SyncRow[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: SyncRow[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const row = shapeRow(table, raw as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}

/** Compare If-None-Match / ETag header values. Quotes and the weak marker are ignored. */
export function normalizeEtag(header: string | null): string | null {
  if (!header) return null;
  const tag = header.trim().replace(/^W\//i, "").replace(/^"/, "").replace(/"$/, "");
  return tag || null;
}

/** Keep only the columns the local table has. Drops a row with no id. */
export function shapeRow(table: string, raw: Record<string, unknown>): SyncRow | null {
  const cols = SYNC_COLUMNS[table];
  if (!cols) return null;
  const out: SyncRow = {};
  for (const col of cols) {
    let value = shapeCell(raw[col]);
    if (typeof value === "string" && value !== "" && (INT_COLUMNS.has(col) || col === "birth_weight_kg")) {
      const n = Number(value);
      value = Number.isFinite(n) ? (INT_COLUMNS.has(col) ? Math.trunc(n) : n) : null;
    }
    out[col] = value;
  }
  if (out.id == null || out.id === "") return null;
  out.id = String(out.id);
  return out;
}
