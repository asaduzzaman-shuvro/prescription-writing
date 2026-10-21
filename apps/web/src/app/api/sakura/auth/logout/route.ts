import { NextResponse } from "next/server";
import { SAKURA_REFRESH_COOKIE, SAKURA_TOKEN_COOKIE } from "@/lib/sakura/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SAKURA_TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(SAKURA_REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
