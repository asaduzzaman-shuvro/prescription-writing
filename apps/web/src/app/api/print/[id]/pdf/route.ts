import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { prescriptionPdf } from "@/lib/print-server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const pdf = await prescriptionPdf({ tenantId: session.tenantId, userId: session.userId }, id);
  if (!pdf) return new Response("Not found (it may not have synced yet)", { status: 404 });
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "prescription.pdf", entity: "prescription", entityId: id });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="prescription-${id.slice(0, 8)}.pdf"` },
  });
}
