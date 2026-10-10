import "server-only";
import { jwtVerify, SignJWT } from "jose";

type Purpose = "mfa" | "chamber";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

/** Short-lived proof that password (and MFA, for chamber pick) already succeeded. */
export async function issueLoginTicket(userId: string, purpose: Purpose): Promise<string> {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
}

export async function readLoginTicket(token: string, purpose: Purpose): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== purpose || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
