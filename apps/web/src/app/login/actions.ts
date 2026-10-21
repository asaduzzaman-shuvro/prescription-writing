"use server";

import { s, verifyPassword } from "@rx/db";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { checkLoginRateLimit, clearLoginFailures, clientIpFromHeaders, recordLoginFailure } from "@/lib/login-rate-limit";
import { issueLoginTicket, readLoginTicket } from "@/lib/login-ticket";
import { tenantAccessMessage } from "@/lib/tenant-access";
import { createSession, destroySession, type Session } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";

export type LoginState =
  | { error?: string }
  | { step: "mfa"; ticket: string; error?: string }
  | { step: "chamber"; ticket: string; chambers: { tenantId: string; name: string; role: string }[]; error?: string };

async function membershipsFor(userId: string) {
  return ownerDb
    .select({
      tenantId: s.membership.tenantId,
      role: s.membership.role,
      name: s.tenant.name,
      status: s.tenant.status,
    })
    .from(s.membership)
    .innerJoin(s.tenant, eq(s.tenant.id, s.membership.tenantId))
    .where(eq(s.membership.userId, userId));
}

async function finishLogin(user: typeof s.appUser.$inferSelect, tenantId: string | null, role: Session["tenantRole"]) {
  if (!user.platformRole && !tenantId) return { error: "Your account is not linked to a chamber yet" } satisfies LoginState;
  if (!user.platformRole) {
    const [t] = await ownerDb.select({ status: s.tenant.status }).from(s.tenant).where(eq(s.tenant.id, tenantId!));
    const blocked = tenantAccessMessage(t?.status ?? "");
    if (blocked) return { error: blocked } satisfies LoginState;
  }
  await createSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    tenantId,
    tenantRole: role,
  });
  await ownerDb.update(s.appUser).set({ lastLoginAt: new Date() }).where(eq(s.appUser.id, user.id));
  await audit({ actorUserId: user.id, tenantId, action: "auth.login", entity: "app_user", entityId: user.id });
  redirect(tenantId ? "/doctor" : "/admin");
}

async function afterPasswordOk(user: typeof s.appUser.$inferSelect): Promise<LoginState> {
  if (user.totpEnabledAt && user.totpSecret) {
    return { step: "mfa", ticket: await issueLoginTicket(user.id, "mfa") };
  }
  return continueAfterMfa(user);
}

async function continueAfterMfa(user: typeof s.appUser.$inferSelect): Promise<LoginState> {
  const ms = (await membershipsFor(user.id)).filter((m) => m.status === "active");
  if (user.platformRole && ms.length === 0) return finishLogin(user, null, null);
  if (!ms.length) return { error: "Your account is not linked to a chamber yet" };
  if (ms.length === 1) {
    const only = ms[0]!;
    return finishLogin(user, only.tenantId, only.role);
  }
  return {
    step: "chamber",
    ticket: await issueLoginTicket(user.id, "chamber"),
    chambers: ms.map((m) => ({ tenantId: m.tenantId, name: m.name, role: m.role })),
  };
}

export async function login(_prev: LoginState | undefined, form: FormData): Promise<LoginState> {
  const step = String(form.get("step") ?? "password");
  const ip = clientIpFromHeaders(await headers());

  if (step === "mfa") {
    const ticket = String(form.get("ticket") ?? "");
    const code = String(form.get("code") ?? "");
    const userId = await readLoginTicket(ticket, "mfa");
    if (!userId) return { error: "Session expired. Sign in again." };
    const [user] = await ownerDb.select().from(s.appUser).where(eq(s.appUser.id, userId));
    if (!user?.totpSecret || user.disabled) return { error: "Session expired. Sign in again." };
    if (!verifyTotp(user.totpSecret, code)) {
      recordLoginFailure(user.email.toLowerCase(), ip);
      return { step: "mfa", ticket, error: "Wrong authenticator code" };
    }
    clearLoginFailures(user.email.toLowerCase(), ip);
    return continueAfterMfa(user);
  }

  if (step === "chamber") {
    const ticket = String(form.get("ticket") ?? "");
    const tenantId = String(form.get("tenantId") ?? "");
    const userId = await readLoginTicket(ticket, "chamber");
    if (!userId) return { error: "Session expired. Sign in again." };
    const [user] = await ownerDb.select().from(s.appUser).where(eq(s.appUser.id, userId));
    if (!user || user.disabled) return { error: "Session expired. Sign in again." };
    const [m] = await ownerDb
      .select({ role: s.membership.role, status: s.tenant.status })
      .from(s.membership)
      .innerJoin(s.tenant, eq(s.tenant.id, s.membership.tenantId))
      .where(and(eq(s.membership.userId, userId), eq(s.membership.tenantId, tenantId)));
    if (!m) return { error: "You are not a member of that chamber" };
    const blocked = tenantAccessMessage(m.status);
    if (blocked) return { error: blocked };
    return finishLogin(user, tenantId, m.role);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const limited = checkLoginRateLimit(email, ip);
  if (limited) return { error: limited };

  const [user] = await ownerDb.select().from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, email));
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(email, ip);
    return { error: "Wrong email or password" };
  }
  clearLoginFailures(email, ip);
  return afterPasswordOk(user);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
