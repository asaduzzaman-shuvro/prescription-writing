import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getSakuraDoctorCredentials,
  loginSakuraSessionWithDoctor,
} from "@/lib/sakura/server";

/**
 * Returns a short-lived Sakura session so RxPad can open the Angular doctor UI
 * without asking for phone/password again (same credentials as Sakura Web nav).
 */
export async function POST() {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const creds = await getSakuraDoctorCredentials();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "Sakura Web credentials missing. A platform admin must add this doctor's Sakura phone & password under Doctors & chambers → Sakura Web.",
      },
      { status: 401 },
    );
  }

  try {
    const sakura = await loginSakuraSessionWithDoctor();
    const webBase = (
      process.env.NEXT_PUBLIC_SAKURA_WEB_URL || "http://localhost:4200"
    )
      .trim()
      .replace(/\/$/, "");

    return NextResponse.json({
      ok: true,
      webBase,
      token: sakura.token,
      refreshToken: sakura.refreshToken ?? null,
      user: sakura.user,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sakura auto-login failed" },
      { status: 502 },
    );
  }
}
