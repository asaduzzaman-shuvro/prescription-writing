import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { labReportPdf } from "@/lib/print-server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  const { requestId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return new Response("Not found", { status: 404 });
  const pdf = await labReportPdf({ tenantId: session.tenantId, userId: session.userId }, requestId);
  if (!pdf) return new Response("Not found (it may not have synced yet)", { status: 404 });
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "lab_report.pdf", entity: "lab_report", entityId: requestId });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="lab-report-${requestId.slice(0, 8)}.pdf"` },
  });
}
