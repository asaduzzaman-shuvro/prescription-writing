import { NextResponse } from "next/server";
import {
  clearSakuraEnvTokenCache,
  loginSakuraWithEnv,
  resolveSakuraAccessToken,
  sakuraApiBase,
  sakuraEnvCredentials,
} from "@/lib/sakura/server";

/** Ensure Sakura is reachable and we have a token (cookie or env auto-login). */
export async function GET() {
  let token: string | null = null;
  try {
    token = await resolveSakuraAccessToken();
    if (!token && sakuraEnvCredentials()) {
      token = await loginSakuraWithEnv();
    }
  } catch (err) {
    return NextResponse.json({
      authenticated: false,
      autoLogin: Boolean(sakuraEnvCredentials()),
      error: err instanceof Error ? err.message : "Sakura auto-login failed",
    });
  }

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      autoLogin: false,
      error:
        "Sakura credentials missing. Set SAKURA_PHONE and SAKURA_PASSWORD in apps/web/.env.local (same doctor as Sakura Web).",
    });
  }

  try {
    const upstream = await fetch(`${sakuraApiBase()}/chambers`, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (upstream.status === 401 || upstream.status === 403) {
      clearSakuraEnvTokenCache();
      if (sakuraEnvCredentials()) {
        try {
          token = await loginSakuraWithEnv();
          const retry = await fetch(`${sakuraApiBase()}/chambers`, {
            headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
            cache: "no-store",
          });
          if (retry.ok) {
            return NextResponse.json({ authenticated: true, autoLogin: true });
          }
        } catch (err) {
          return NextResponse.json({
            authenticated: false,
            autoLogin: true,
            error: err instanceof Error ? err.message : "Sakura re-login failed",
          });
        }
      }
      return NextResponse.json({
        authenticated: false,
        autoLogin: Boolean(sakuraEnvCredentials()),
        error: "Sakura session expired",
      });
    }
    if (!upstream.ok) {
      return NextResponse.json({
        authenticated: true,
        autoLogin: Boolean(sakuraEnvCredentials()),
        warning: `Sakura API status ${upstream.status}`,
      });
    }
    return NextResponse.json({
      authenticated: true,
      autoLogin: Boolean(sakuraEnvCredentials()),
    });
  } catch {
    return NextResponse.json({
      authenticated: true,
      autoLogin: Boolean(sakuraEnvCredentials()),
      warning: `Could not reach Sakura at ${sakuraApiBase()}`,
    });
  }
}
