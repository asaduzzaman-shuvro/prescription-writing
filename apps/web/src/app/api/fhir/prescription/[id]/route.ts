import { prescriptionToFhir, type PrescriptionDoc } from "@rx/core";
import { s, withTenant } from "@rx/db";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { appDb } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** FHIR R4 Bundle for one finalised prescription (DGHS Core IG aligned; see `gaps` header). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const out = await withTenant(appDb, { tenantId: session.tenantId, userId: session.userId }, async (tx) => {
    const [rx] = await tx.select().from(s.prescription).where(eq(s.prescription.id, id));
    if (!rx || rx.status !== "final") return null;
    const [p] = await tx.select().from(s.patient).where(eq(s.patient.id, rx.patientId));
    const [d] = await tx.select().from(s.doctorProfile).where(eq(s.doctorProfile.userId, rx.doctorUserId));
    const [e] = await tx.select().from(s.encounter).where(eq(s.encounter.id, rx.encounterId));
    const doc = rx.doc as PrescriptionDoc;
    const productIds = doc.items.map((x) => x.productId).filter((x): x is string => !!x);
    const products = productIds.length ? await tx.select({ id: s.brandProduct.id, dar: s.brandProduct.darNumber }).from(s.brandProduct).where(inArray(s.brandProduct.id, productIds)) : [];
    const dx = doc.diagnoses.length ? await tx.select({ name: s.diagnosis.name, icd10: s.diagnosis.icd10 }).from(s.diagnosis).where(inArray(s.diagnosis.name, doc.diagnoses)) : [];
    return { rx, p: p!, d: d!, e: e!, doc, products, dx };
  });
  if (!out) return NextResponse.json({ error: "not found or not finalised" }, { status: 404 });
  const { rx, p, d, e, doc, products, dx } = out;
  const { bundle, gaps } = prescriptionToFhir({
    baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    prescription: { id: rx.id, finalizedAt: (rx.finalizedAt ?? rx.updatedAt).toISOString(), verifyToken: rx.verifyToken, version: rx.version, doc },
    patient: { id: p.id, name: p.name, sex: p.sex, dob: p.dob, mobile: p.mobile, code: p.code, nid: p.nid, brn: p.brn, healthId: p.healthId, address: p.address },
    doctor: { userId: d.userId, nameEn: d.nameEn, bmdcNumber: d.bmdcNumber, degreesEn: d.degreesEn },
    encounter: { id: e.id, visitDate: e.visitDate },
    darByProduct: Object.fromEntries(products.map((x) => [x.id, x.dar])),
    icd10ByDiagnosis: Object.fromEntries(dx.map((x) => [x.name, x.icd10])),
  });
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "prescription.fhir_export", entity: "prescription", entityId: id });
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/fhir+json; charset=utf-8",
      "content-disposition": `attachment; filename="rx-${id.slice(0, 8)}.fhir.json"`,
      "x-conformance-gaps": encodeURIComponent(gaps.join(" | ")).slice(0, 4000),
    },
  });
}
