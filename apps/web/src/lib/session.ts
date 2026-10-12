import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCOPE_COOKIE, scopeValue } from "./session-scope";

export const SESSION_COOKIE = "rx_session";
export { SCOPE_COOKIE, scopeValue };
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export interface Session {
  userId: string;
  name: string;
  email: string;
  platformRole: "super_admin" | "data_editor" | null;
  tenantId: string | null;
  tenantRole: "clinic_admin" | "doctor" | "assistant" | null;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSession(session: Session) {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  const cookie = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
  jar.set(SESSION_COOKIE, token, { ...cookie, httpOnly: true });
  jar.set(SCOPE_COOKIE, scopeValue(session), { ...cookie, httpOnly: false });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(SCOPE_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

/** Platform admin area: super_admin or data_editor. */
export async function requireAdmin(opts: { superOnly?: boolean } = {}): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.platformRole || (opts.superOnly && s.platformRole !== "super_admin")) redirect("/");
  return s;
}

/** Clinic area: any tenant member, optionally restricted to roles. */
export async function requireClinic(
  roles: Session["tenantRole"][] = ["clinic_admin", "doctor", "assistant"],
): Promise<Session & { tenantId: string }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.tenantId || !roles.includes(s.tenantRole)) redirect("/");
  return s as Session & { tenantId: string };
}
