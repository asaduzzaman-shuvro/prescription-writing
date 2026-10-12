/** Readable by the service worker so a cached /doctor shell is never shown for a different sign-in. */
export const SCOPE_COOKIE = "rx_scope";

export function scopeValue(session: { userId: string; tenantId: string | null }): string {
  return `${session.userId}.${session.tenantId ?? ""}`;
}
