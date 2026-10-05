import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { applyUpload } from "@/lib/sync-upload";

export const runtime = "nodejs";

const Body = z.object({
  batch: z.array(
    z.object({
      op: z.enum(["PUT", "PATCH", "DELETE"]),
      table: z.string(),
      id: z.string(),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
  ).max(1000),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const result = await applyUpload(session as typeof session & { tenantId: string }, parsed.data.batch);
  // Rejected ops still return 200 so the client queue keeps moving; the next sync restores server truth.
  return NextResponse.json(result);
}
