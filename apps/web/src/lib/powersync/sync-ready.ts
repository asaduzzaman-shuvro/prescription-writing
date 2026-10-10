/**
 * Priority used for patients, visits, libraries — enough to open the doctor app.
 * Medicine catalogue syncs at priority 3 in the background (~22k products / ~24MB).
 */
export const CLINIC_SYNC_PRIORITY = 1;

type SyncLike = {
  hasSynced?: boolean;
  statusForPriority: (priority: number) => { hasSynced?: boolean } | undefined;
  downloadProgress: {
    downloadedFraction: number;
    untilPriority: (priority: number) => { downloadedFraction: number };
  } | null;
};

/** True once clinic data is usable; medicine search may still be downloading. */
export function clinicDataReady(status: SyncLike): boolean {
  if (status.hasSynced) return true;
  return status.statusForPriority(CLINIC_SYNC_PRIORITY)?.hasSynced === true;
}

export function downloadPercent(status: SyncLike): number | null {
  const p = status.downloadProgress;
  if (!p || typeof p.downloadedFraction !== "number") return null;
  return Math.min(100, Math.max(0, Math.round(p.downloadedFraction * 100)));
}
