import { NextResponse } from "next/server";

/** Browser lands here after checkout. Settlement happens only via the validated IPN. */
export async function POST(req: Request) {
  const result = new URL(req.url).searchParams.get("result") ?? "unknown";
  return NextResponse.redirect(new URL(`/doctor?billing=${result}#/settings`, process.env.PUBLIC_BASE_URL ?? req.url), 303);
}
export const GET = POST;
