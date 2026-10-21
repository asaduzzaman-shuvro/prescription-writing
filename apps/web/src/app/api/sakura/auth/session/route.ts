import { NextResponse } from "next/server";
import {
  clearSakuraEnvTokenCache,
  getSakuraDoctorCredentials,
  loginSakuraWithDoctor,
  resolveSakuraAccessToken,
  sakuraApiBase,
} from "@/lib/sakura/server";

/** Ensure Sakura is reachable and we have a token (cookie or doctor auto-login). */
export async function GET() {
  const creds = await getSakuraDoctorCredentials();
  let token: string | null = null;
  try {
    token = await resolveSakuraAccessToken();
    if (!token && creds) {
      token = await loginSakuraWithDoctor();
    }
  } catch (err) {
    return NextResponse.json({
      authenticated: false,
      autoLogin: Boolean(creds),
      error: err instanceof Error ? err.message : "Sakura auto-login failed",
    });
  }

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      autoLogin: false,
      error:
        "Sakura Web credentials missing. A platform admin must add this doctor's Sakura phone & password under Doctors & chambers → Sakura Web.",
    });
  }

  try {
    const upstream = await fetch(`${sakuraApiBase()}/chambers`, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (upstream.status === 401 || upstream.status === 403) {
      clearSakuraEnvTokenCache(creds?.userId);
      if (creds) {
        try {
          token = await loginSakuraWithDoctor();
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
        autoLogin: Boolean(creds),
        error: "Sakura session expired",
      });
    }
    if (!upstream.ok) {
      return NextResponse.json({
        authenticated: true,
        autoLogin: Boolean(creds),
        warning: `Sakura API status ${upstream.status}`,
      });
    }
    return NextResponse.json({
      authenticated: true,
      autoLogin: Boolean(creds),
    });
  } catch {
    return NextResponse.json({
      authenticated: true,
      autoLogin: Boolean(creds),
      warning: `Could not reach Sakura at ${sakuraApiBase()}`,
    });
  }
}
