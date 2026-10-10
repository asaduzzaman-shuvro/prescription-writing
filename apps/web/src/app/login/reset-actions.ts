"use server";

import { createHash, randomBytes } from "node:crypto";
import { hashPassword, s } from "@rx/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { checkPasswordResetRateLimit, clientIpFromHeaders, recordPasswordResetRequest } from "@/lib/login-rate-limit";
import { sendAccountMessage } from "@/lib/notify";

function tokenHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

const GENERIC_OK = "If that account exists, we sent a reset link. Check SMS or ask your admin.";

export async function requestPasswordReset(_prev: { error?: string; ok?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const ip = clientIpFromHeaders(await headers());
  if (!email || !email.includes("@")) return { error: "Enter a valid email" };
  const limited = checkPasswordResetRateLimit(email, ip);
  if (limited) return { error: limited };
  recordPasswordResetRequest(email, ip);

  const [user] = await ownerDb.select().from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, email));
  // Always the same response — do not leak whether the email is registered.
  if (!user || user.disabled) return { ok: GENERIC_OK };

  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await ownerDb.insert(s.passwordReset).values({
    userId: user.id,
    tokenHash: tokenHash(raw),
    expiresAt,
  });

  const base = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/login/reset?token=${raw}`;
  await sendAccountMessage({
    email: user.email,
    phone: user.phone,
    subject: "RxPad BD — reset your password",
    body: `Reset your RxPad password (valid 1 hour):\n\n${link}\n\nIf you did not ask for this, ignore the message.`,
    smsBody: `RxPad password reset (1h): ${link}`,
  });
  await audit({ actorUserId: user.id, tenantId: null, action: "auth.password_reset.request", entity: "app_user", entityId: user.id });
  return { ok: GENERIC_OK };
}

export async function completePasswordReset(_prev: { error?: string; ok?: string } | undefined, form: FormData) {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };
  if (!token) return { error: "Missing reset token" };

  const hash = tokenHash(token);
  const [row] = await ownerDb
    .select()
    .from(s.passwordReset)
    .where(and(eq(s.passwordReset.tokenHash, hash), isNull(s.passwordReset.usedAt), gt(s.passwordReset.expiresAt, new Date())));
  if (!row) return { error: "This reset link is invalid or has expired. Request a new one." };

  await ownerDb.transaction(async (tx) => {
    await tx
      .update(s.appUser)
      .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
      .where(eq(s.appUser.id, row.userId));
    await tx.update(s.passwordReset).set({ usedAt: new Date() }).where(eq(s.passwordReset.id, row.id));
    // Invalidate any other outstanding tokens for this user.
    await tx
      .update(s.passwordReset)
      .set({ usedAt: new Date() })
      .where(and(eq(s.passwordReset.userId, row.userId), isNull(s.passwordReset.usedAt)));
  });
  await audit({ actorUserId: row.userId, tenantId: null, action: "auth.password_reset.complete", entity: "app_user", entityId: row.userId });
  return { ok: "Password updated. You can sign in now." };
}
