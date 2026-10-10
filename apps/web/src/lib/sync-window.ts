import "server-only";

/**
 * Intended sync history window for devices (YYYY-MM-DD).
 * Included in the PowerSync JWT as `sync_since`.
 *
 * PowerSync sync rules only allow comparing `auth.parameter(...)` to row columns with `=`
 * (not `>=`), so the stream still downloads full tenant history. Keep this claim ready for a
 * future bucket/parameter design; set POWERSYNC_SYNC_DAYS when that lands.
 *
 * POWERSYNC_SYNC_DAYS=0 (default) → 1970-01-01 (full history).
 */
export function syncSinceDate(): string {
  const days = Number(process.env.POWERSYNC_SYNC_DAYS ?? "0");
  if (!Number.isFinite(days) || days <= 0) return "1970-01-01";
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.floor(days));
  return d.toISOString().slice(0, 10);
}
