import { LAB_FILE_MAX_BYTES } from "@rx/core";
import { LabFileError, storeLabFile } from "@/lib/lab-files";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** Upload a lab report photo/PDF (multipart: file, id, patient_id, lab_report_id). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tenantId) return new Response("Unauthorized", { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > LAB_FILE_MAX_BYTES + 64 * 1024) return new Response("file too large (max 5 MB)", { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return new Response("file missing", { status: 400 });
  try {
    await storeLabFile(session as typeof session & { tenantId: string }, {
      id: form.get("id"), patientId: form.get("patient_id"), labReportId: form.get("lab_report_id"), bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return new Response(null, { status: 201 });
  } catch (e) {
    if (e instanceof LabFileError) return new Response(e.message, { status: e.status });
    throw e;
  }
}
