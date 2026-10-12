import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SCOPE_COOKIE, scopeValue } from "@/lib/session-scope";

/**
 * Light gate for admin HTML + admin APIs. Clinic session checks stay in route handlers
 * (doctor app must keep working offline without middleware round-trips on every hash nav).
 * /doctor also stamps x-rx-scope so the service worker can reuse a cached shell only for this sign-in.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/doctor" || pathname.startsWith("/doctor/")) {
    return doctorShell(req);
  }
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }
  // Public-ish: login is outside /admin. Cookie presence only — role is enforced in requireAdmin().
  if (!req.cookies.get("rx_session")?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

async function doctorShell(req: NextRequest) {
  const res = NextResponse.next();
  const token = req.cookies.get("rx_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return res;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const tenantId = typeof payload.tenantId === "string" ? payload.tenantId : null;
    if (!userId) return res;
    const scope = scopeValue({ userId, tenantId });
    res.headers.set("x-rx-scope", scope);
    if (req.cookies.get(SCOPE_COOKIE)?.value !== scope) {
      res.cookies.set(SCOPE_COOKIE, scope, {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });
    }
  } catch {
    // A bad session cookie is handled by the page. Don't block the shell on it.
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/doctor", "/doctor/:path*"],
};
