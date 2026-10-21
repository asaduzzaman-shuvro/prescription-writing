import { NextResponse } from "next/server";
import {
  SAKURA_REFRESH_COOKIE,
  SAKURA_TOKEN_COOKIE,
  sakuraApiBase,
  sakuraCookieOptions,
} from "@/lib/sakura/server";

export async function POST(req: Request) {
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  const password = body.password;
  if (!phone || !password) {
    return NextResponse.json({ error: "Phone and password are required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${sakuraApiBase()}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ phone, password }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sakura API unreachable";
    return NextResponse.json(
      {
        error: `Could not reach Sakura backend at ${sakuraApiBase()}. Set SAKURA_API_URL and ensure the Nest server is running. (${message})`,
      },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: data.message || data.error || "Invalid Sakura credentials" },
      { status: upstream.status },
    );
  }

  const token = data.token as string | undefined;
  if (!token) {
    return NextResponse.json({ error: "Sakura login did not return a token" }, { status: 502 });
  }

  const res = NextResponse.json({
    ok: true,
    user: data.user ?? null,
  });
  res.cookies.set(SAKURA_TOKEN_COOKIE, token, sakuraCookieOptions(60 * 60 * 12));
  if (data.refreshToken) {
    res.cookies.set(SAKURA_REFRESH_COOKIE, String(data.refreshToken), sakuraCookieOptions(60 * 60 * 24 * 7));
  }
  return res;
}
