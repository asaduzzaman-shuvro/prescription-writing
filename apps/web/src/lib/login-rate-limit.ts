import "server-only";

/**
 * In-memory login throttle for a single Node process.
 * Enough for one-box deploy; put Redis in front when you scale out.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

interface Bucket {
  fails: number;
  resetAt: number;
}

const byEmail = new Map<string, Bucket>();
const byIp = new Map<string, Bucket>();

function touch(map: Map<string, Bucket>, key: string, max: number): string | null {
  const now = Date.now();
  let b = map.get(key);
  if (!b || b.resetAt <= now) {
    b = { fails: 0, resetAt: now + WINDOW_MS };
    map.set(key, b);
  }
  if (b.fails >= max) {
    const mins = Math.max(1, Math.ceil((b.resetAt - now) / 60000));
    return `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  return null;
}

function bump(map: Map<string, Bucket>, key: string) {
  const now = Date.now();
  const b = map.get(key) ?? { fails: 0, resetAt: now + WINDOW_MS };
  if (b.resetAt <= now) {
    b.fails = 0;
    b.resetAt = now + WINDOW_MS;
  }
  b.fails++;
  map.set(key, b);
}

function clear(map: Map<string, Bucket>, key: string) {
  map.delete(key);
}

export function checkLoginRateLimit(email: string, ip: string): string | null {
  return touch(byEmail, email, MAX_PER_EMAIL) ?? touch(byIp, ip || "unknown", MAX_PER_IP);
}

export function recordLoginFailure(email: string, ip: string) {
  bump(byEmail, email);
  bump(byIp, ip || "unknown");
}

export function clearLoginFailures(email: string, ip: string) {
  clear(byEmail, email);
  // Do not clear the IP bucket on success — shared NATs would wipe neighbours' throttle.
  void ip;
}

export function clientIpFromHeaders(h: Headers): string {
  const xf = h.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

const resetByEmail = new Map<string, Bucket>();
const resetByIp = new Map<string, Bucket>();

/** Throttle forgot-password requests (always bump — do not reveal whether the email exists). */
export function checkPasswordResetRateLimit(email: string, ip: string): string | null {
  return touch(resetByEmail, email, 3) ?? touch(resetByIp, ip || "unknown", 10);
}

export function recordPasswordResetRequest(email: string, ip: string) {
  bump(resetByEmail, email);
  bump(resetByIp, ip || "unknown");
}
