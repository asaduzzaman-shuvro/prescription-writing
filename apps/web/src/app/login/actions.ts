"use server";

import { s, verifyPassword } from "@rx/db";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ownerDb } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await ownerDb.select().from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, email));
  if (!user || user.disabled || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong email or password" };
  }
  const [m] = await ownerDb
    .select({ tenantId: s.membership.tenantId, role: s.membership.role, status: s.tenant.status })
    .from(s.membership)
    .innerJoin(s.tenant, eq(s.tenant.id, s.membership.tenantId))
    .where(eq(s.membership.userId, user.id))
    .limit(1);
  if (!user.platformRole && !m) return { error: "Your account is not linked to a chamber yet" };
  if (!user.platformRole && m?.status === "suspended") return { error: "This chamber is suspended. Contact support." };
  await createSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: m?.tenantId ?? null,
    tenantRole: m?.role ?? null,
  });
  await ownerDb.update(s.appUser).set({ lastLoginAt: new Date() }).where(eq(s.appUser.id, user.id));
  await audit({ actorUserId: user.id, tenantId: m?.tenantId ?? null, action: "auth.login", entity: "app_user", entityId: user.id });
  redirect(user.platformRole ? "/admin" : "/doctor");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
