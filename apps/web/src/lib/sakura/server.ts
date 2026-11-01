import "server-only";

import { s } from "@rx/db";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { ownerDb } from "@/lib/db";
import { getSession } from "@/lib/session";

export const SAKURA_TOKEN_COOKIE = "sakura_access_token";
export const SAKURA_REFRESH_COOKIE = "sakura_refresh_token";

type Creds = { phone: string; password: string; userId: string };

/** In-memory JWT cache keyed by doctor userId. */
const tokenCache = new Map<string, { token: string; expiresAt: number; phone: string }>();

/** Sakura Nest API base, including `/api` suffix. */
export function sakuraApiBase(): string {
  const raw = (process.env.SAKURA_API_URL || "http://localhost:3000/api").trim().replace(/\/$/, "");
  return raw;
}

/** @deprecated Prefer admin-managed doctor credentials via getSakuraDoctorCredentials. */
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

/**
 * Sakura phone/password for the logged-in clinic user:
 * own doctor profile first, otherwise any doctor in the same chamber with credentials set.
 * Returns null if columns are missing (migration not applied yet) so /doctor still loads.
 */
export async function getSakuraDoctorCredentials(): Promise<Creds | null> {
  const session = await getSession();
  if (!session?.tenantId) return null;

  try {
    const [own] = await ownerDb
      .select({
        userId: s.doctorProfile.userId,
        phone: s.doctorProfile.sakuraPhone,
        password: s.doctorProfile.sakuraPassword,
      })
      .from(s.doctorProfile)
      .where(eq(s.doctorProfile.userId, session.userId))
      .limit(1);

    if (own?.phone?.trim() && own.password) {
      return { userId: own.userId, phone: own.phone.trim(), password: own.password };
    }

    const [any] = await ownerDb
      .select({
        userId: s.doctorProfile.userId,
        phone: s.doctorProfile.sakuraPhone,
        password: s.doctorProfile.sakuraPassword,
      })
      .from(s.doctorProfile)
      .where(
        and(
          eq(s.doctorProfile.tenantId, session.tenantId),
          isNotNull(s.doctorProfile.sakuraPhone),
          isNotNull(s.doctorProfile.sakuraPassword),
          ne(s.doctorProfile.sakuraPhone, ""),
          ne(s.doctorProfile.sakuraPassword, ""),
        ),
      )
      .limit(1);

    if (any?.phone?.trim() && any.password) {
      return { userId: any.userId, phone: any.phone.trim(), password: any.password };
    }
  } catch {
    // e.g. sakura_phone / sakura_password columns not migrated yet on production DB
    return null;
  }

  return null;
}

export type SakuraLoginSession = {
  token: string;
  refreshToken?: string;
  user: unknown;
};

async function loginSakuraSessionWithCreds(creds: Creds): Promise<SakuraLoginSession> {
  const now = Date.now();
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
    refreshToken?: string;
    user?: unknown;
    message?: string;
    error?: string;
  };

  if (!upstream.ok || !data.token) {
    throw new Error(
      data.message ||
        data.error ||
        `Sakura auto-login failed (${upstream.status}). Check this doctor's Sakura Web phone/password in Admin → Doctors.`,
    );
  }

  tokenCache.set(creds.userId, {
    token: data.token,
    phone: creds.phone,
    expiresAt: now + 60 * 60 * 1000,
  });
  return {
    token: data.token,
    refreshToken: data.refreshToken,
    user: data.user ?? null,
  };
}

async function loginSakuraWithCreds(creds: Creds): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(creds.userId);
  if (cached && cached.phone === creds.phone && cached.expiresAt > now + 60_000) {
    return cached.token;
  }
  const session = await loginSakuraSessionWithCreds(creds);
  return session.token;
}

/** Login using admin-configured credentials for the current doctor/chamber. */
export async function loginSakuraWithDoctor(): Promise<string> {
  const creds = await getSakuraDoctorCredentials();
  if (!creds) {
    throw new Error(
      "Sakura Web credentials are not set for this doctor. Ask a platform admin to add them under Doctors & chambers → Sakura Web.",
    );
  }
  return loginSakuraWithCreds(creds);
}

/** Full Sakura session (token + refresh + user) for opening the Angular doctor UI without a login form. */
export async function loginSakuraSessionWithDoctor(): Promise<SakuraLoginSession> {
  const creds = await getSakuraDoctorCredentials();
  if (!creds) {
    throw new Error(
      "Sakura Web credentials are not set for this doctor. Ask a platform admin to add them under Doctors & chambers → Sakura Web.",
    );
  }
  return loginSakuraSessionWithCreds(creds);
}

/** @deprecated use loginSakuraWithDoctor */
export async function loginSakuraWithEnv(): Promise<string> {
  return loginSakuraWithDoctor();
}

export function clearSakuraEnvTokenCache(userId?: string) {
  if (userId) tokenCache.delete(userId);
  else tokenCache.clear();
}

/**
 * Token for proxying Sakura APIs.
 * Prefer httpOnly cookie (manual connect); otherwise auto-login with admin-managed doctor credentials.
 */
export async function resolveSakuraAccessToken(): Promise<string | null> {
  const cookieToken = await getSakuraCookieToken();
  if (cookieToken) return cookieToken;
  const creds = await getSakuraDoctorCredentials();
  if (!creds) return null;
  try {
    return await loginSakuraWithCreds(creds);
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
