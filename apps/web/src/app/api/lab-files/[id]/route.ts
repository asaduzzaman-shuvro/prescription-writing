import { deleteLabFile, LabFileError, readLabFile } from "@/lib/lab-files";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = await readLabFile(session as typeof session & { tenantId: string }, id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.contentType,
      // The app shows it from a blob; opened directly, it downloads rather than renders, and runs nothing.
      "content-disposition": `attachment; filename="report-${id.slice(0, 8)}"`,
      "content-security-policy": "sandbox; default-src 'none'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=86400",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    await deleteLabFile(session as typeof session & { tenantId: string }, id);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof LabFileError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
