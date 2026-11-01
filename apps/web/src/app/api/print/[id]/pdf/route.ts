import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { prescriptionPdf } from "@/lib/print-server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  let file: { pdf: Buffer; filename: string } | null;
  try {
    file = await prescriptionPdf({ tenantId: session.tenantId, userId: session.userId }, id);
  } catch (err) {
    console.error("prescription pdf", err);
    return new Response("Could not create the PDF. Try again in a moment.", { status: 503 });
  }
  if (!file) return new Response("Not found (it may not have synced yet)", { status: 404 });
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "prescription.pdf", entity: "prescription", entityId: id });
  const ascii = file.filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const disposition = new URL(_req.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
}
