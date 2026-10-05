import { formatInstruction, type PrescriptionDoc } from "@rx/core";
import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Verify prescription", robots: { index: false } };

/** Mask all but the first letter of each name part (patient privacy on a public URL). */
const mask = (name: string) => name.split(/\s+/).map((w) => (w.length <= 1 ? w : `${w[0]}${"•".repeat(Math.min(w.length - 1, 4))}`)).join(" ");

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = /^[A-Za-z0-9_-]{8,64}$/.test(token)
    ? await ownerDb
        .select({ rx: s.prescription, patient: s.patient.name, doctor: s.doctorProfile.nameEn, bmdc: s.doctorProfile.bmdcNumber, verified: s.doctorProfile.bmdcVerifiedAt })
        .from(s.prescription)
        .innerJoin(s.patient, eq(s.patient.id, s.prescription.patientId))
        .innerJoin(s.doctorProfile, eq(s.doctorProfile.userId, s.prescription.doctorUserId))
        .where(eq(s.prescription.verifyToken, token))
    : [];
  const r = rows[0];
  if (!r || r.rx.status !== "final") {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="card p-6 text-center">
          <h1 className="text-lg font-semibold text-red-700">Not verified</h1>
          <p className="mt-2 text-sm text-slate-600">No finalised prescription matches this code. It may not have synced yet if it was written offline in the last few minutes.</p>
        </div>
      </main>
    );
  }
  const doc = r.rx.doc as PrescriptionDoc;
  const superseded = (await ownerDb.select({ id: s.prescription.id }).from(s.prescription).where(eq(s.prescription.supersedesId, r.rx.id))).length > 0;
  return (
    <main className="mx-auto max-w-lg p-6">
      <div className="card space-y-3 p-6">
        <div className={`rounded p-2 text-center text-sm font-medium ${superseded ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
          {superseded ? "Genuine, but replaced by a newer version" : "✓ Genuine prescription issued via RxPad"}
        </div>
        <dl className="grid grid-cols-3 gap-1 text-sm">
          <dt className="text-slate-500">Doctor</dt><dd className="col-span-2">{r.doctor}</dd>
          <dt className="text-slate-500">BMDC</dt><dd className="col-span-2">{r.bmdc} {r.verified ? <span className="text-green-700">(verified)</span> : <span className="text-amber-700">(unverified)</span>}</dd>
          <dt className="text-slate-500">Patient</dt><dd className="col-span-2">{mask(r.patient)}</dd>
          <dt className="text-slate-500">Issued</dt><dd className="col-span-2">{r.rx.finalizedAt?.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</dd>
        </dl>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {doc.items.map((i) => (
            <li key={i.id}><b>{i.brandName.toUpperCase()}</b> {i.strength} {i.genericName && <span className="text-slate-500">({i.genericName})</span>}<div className="text-slate-600">{formatInstruction(i, "bn", "bn")}</div></li>
          ))}
        </ol>
      </div>
    </main>
  );
}
