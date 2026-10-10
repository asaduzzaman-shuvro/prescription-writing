import { NextResponse, type NextRequest } from "next/server";

/**
 * Light gate for admin HTML + admin APIs. Clinic session checks stay in route handlers
 * (doctor app must keep working offline without middleware round-trips on every hash nav).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
