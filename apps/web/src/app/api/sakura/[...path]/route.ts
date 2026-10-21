import { NextResponse } from "next/server";
import {
  clearSakuraEnvTokenCache,
  getSakuraDoctorCredentials,
  loginSakuraWithDoctor,
  resolveSakuraAccessToken,
  sakuraApiBase,
} from "@/lib/sakura/server";

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const segments = path ?? [];
  if (segments[0] === "auth") {
    return NextResponse.json({ error: "Use /api/sakura/auth/login" }, { status: 400 });
  }

  const creds = await getSakuraDoctorCredentials();
  let token = await resolveSakuraAccessToken();
  if (!token && creds) {
    try {
      token = await loginSakuraWithDoctor();
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Sakura auto-login failed" },
        { status: 401 },
      );
    }
  }
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Sakura not connected. Ask a platform admin to add Sakura Web phone & password for this doctor under Doctors & chambers.",
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const target = `${sakuraApiBase()}/${segments.map(encodeURIComponent).join("/")}${url.search}`;

  const bodyText =
    req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;

  async function call(authToken: string) {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${authToken}`);
    headers.set("accept", "application/json");
    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const init: RequestInit = { method: req.method, headers, cache: "no-store" };
    if (bodyText) init.body = bodyText;
    return fetch(target, init);
  }

  let upstream: Response;
  try {
    upstream = await call(token);
    if ((upstream.status === 401 || upstream.status === 403) && creds) {
      clearSakuraEnvTokenCache(creds.userId);
      token = await loginSakuraWithDoctor();
      upstream = await call(token);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unreachable";
    return NextResponse.json(
      { error: `Sakura API unreachable (${sakuraApiBase()}): ${message}` },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const outHeaders = new Headers();
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt) outHeaders.set("content-type", upstreamCt);

  return new NextResponse(text, { status: upstream.status, headers: outHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
