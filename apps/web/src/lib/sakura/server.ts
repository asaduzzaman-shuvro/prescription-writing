import { cookies } from "next/headers";

export const SAKURA_TOKEN_COOKIE = "sakura_access_token";
export const SAKURA_REFRESH_COOKIE = "sakura_refresh_token";

/** In-memory token from env auto-login (shared across requests in this Node process). */
let cachedEnvToken: { token: string; expiresAt: number } | null = null;

/** Sakura Nest API base, including `/api` suffix. */
export function sakuraApiBase(): string {
  const raw = (process.env.SAKURA_API_URL || "http://localhost:3000/api").trim().replace(/\/$/, "");
  return raw;
}

export function sakuraEnvCredentials(): { phone: string; password: string } | null {
  const phone = (process.env.SAKURA_PHONE || "").trim();
  const password = process.env.SAKURA_PASSWORD || "";
  if (!phone || !password) return null;
  return { phone, password };
}

export async function getSakuraCookieToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SAKURA_TOKEN_COOKIE)?.value ?? null;
}

/** Login to Sakura with env credentials and cache the JWT (~10h). */
export async function loginSakuraWithEnv(): Promise<string> {
  const creds = sakuraEnvCredentials();
  if (!creds) {
    throw new Error(
      "SAKURA_PHONE and SAKURA_PASSWORD are not set. Add them to apps/web/.env.local so RxPad can open Sakura Web without a second login.",
    );
  }

  const now = Date.now();
  if (cachedEnvToken && cachedEnvToken.expiresAt > now + 60_000) {
    return cachedEnvToken.token;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${sakuraApiBase()}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ phone: creds.phone, password: creds.password }),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unreachable";
    throw new Error(`Could not reach Sakura at ${sakuraApiBase()}: ${message}`);
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    token?: string;
    message?: string;
    error?: string;
  };

  if (!upstream.ok || !data.token) {
    throw new Error(
      data.message || data.error || `Sakura auto-login failed (${upstream.status}). Check SAKURA_PHONE / SAKURA_PASSWORD.`,
    );
  }

  cachedEnvToken = {
    token: data.token,
    // JWT often lasts hours; refresh hourly unless we get a 401 later.
    expiresAt: now + 60 * 60 * 1000,
  };
  return data.token;
}

export function clearSakuraEnvTokenCache() {
  cachedEnvToken = null;
}

/**
 * Token for proxying Sakura APIs.
 * Prefer httpOnly cookie (manual connect); otherwise auto-login with env credentials.
 */
export async function resolveSakuraAccessToken(): Promise<string | null> {
  const cookieToken = await getSakuraCookieToken();
  if (cookieToken) return cookieToken;
  if (!sakuraEnvCredentials()) return null;
  try {
    return await loginSakuraWithEnv();
  } catch {
    return null;
  }
}

/** @deprecated use resolveSakuraAccessToken */
export async function getSakuraAccessToken(): Promise<string | null> {
  return resolveSakuraAccessToken();
}

export function sakuraCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
