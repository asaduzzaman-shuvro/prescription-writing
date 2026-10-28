import { searchProducts, s } from "@rx/db";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { companyOptions, formOptions, genericNamesByIds } from "@/lib/catalogue";
import { ownerDb } from "@/lib/db";
import { ProductForm } from "../../medicines/product-form";
import { createRequestCompany } from "../actions";
import { ReviewActions } from "../review-actions";

export const metadata = { title: "Review medicine" };

export default async function MedicineRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [r] = await ownerDb
    .select({
      id: s.customMedicine.id,
      brandName: s.customMedicine.brandName,
      formId: s.customMedicine.formId,
      strengthText: s.customMedicine.strengthText,
      genericText: s.customMedicine.genericText,
      genericIds: s.customMedicine.genericIds,
      companyId: s.customMedicine.companyId,
      companyName: s.customMedicine.companyName,
      status: s.customMedicine.status,
      reviewNote: s.customMedicine.reviewNote,
      approvedProductId: s.customMedicine.approvedProductId,
      doctor: sql<string>`coalesce(${s.doctorProfile.nameEn}, ${s.appUser.name})`,
      clinic: s.tenant.name,
      createdAt: s.customMedicine.createdAt,
    })
    .from(s.customMedicine)
    .innerJoin(s.appUser, eq(s.appUser.id, s.customMedicine.ownerUserId))
    .innerJoin(s.tenant, eq(s.tenant.id, s.customMedicine.tenantId))
    .leftJoin(s.doctorProfile, eq(s.doctorProfile.userId, s.customMedicine.ownerUserId))
    .where(eq(s.customMedicine.id, id));
  if (!r) notFound();

  const [forms, companies, generics, similar] = await Promise.all([formOptions(), companyOptions(), genericNamesByIds(r.genericIds), searchProducts(ownerDb, r.brandName, 8)]);
  const nameOf = new Map(generics.map((g) => [g.id, g.name]));
  // A company the doctor typed that the catalogue already has (or the admin just added) is preselected.
  const typedCompany = r.companyName?.trim() ?? "";
  const companyId = r.companyId ?? companies.find((c) => c.name.toLowerCase() === typedCompany.toLowerCase())?.id ?? "";
  const pickedNames = new Set(generics.map((g) => g.name.toLowerCase()));
  const typedGenerics = (r.genericText ?? "")
    .split("+")
    .map((g) => g.trim())
    .filter((g) => g && !pickedNames.has(g.toLowerCase()));
  const reviewable = r.status !== "approved";

  return (
    <>
      <PageHeader
        title={`${r.brandName} ${r.strengthText ?? ""}`}
        subtitle={`Added by ${r.doctor} (${r.clinic}) on ${r.createdAt.toLocaleString("en-GB")} · ${r.status === "rejected" ? "not approved" : r.status}`}
      />

      <div className="card mb-4 space-y-1 p-4 text-sm" data-testid="request-summary">
        <div>
          <span className="text-slate-500">Doctor typed:</span> <b>{r.brandName}</b> {r.strengthText} · generic “{r.genericText ?? "—"}” · company “
          {r.companyName ?? companies.find((c) => c.id === r.companyId)?.name ?? "—"}”
        </div>
        {typedGenerics.length > 0 && (
          <p className="text-amber-800">Not linked to a catalogue generic: {typedGenerics.join(", ")}. Pick or create the generic below before approving.</p>
        )}
        {r.reviewNote && <p className="text-slate-600">Last note: {r.reviewNote}</p>}
        {r.approvedProductId && <p className="text-emerald-700">Approved as catalogue product {r.approvedProductId}.</p>}
      </div>

      {reviewable && (
        <>
          {similar.length > 0 && (
            <div className="card mb-4 p-4">
              <h2 className="mb-2 font-semibold">Already in the catalogue?</h2>
              <ul className="space-y-1 text-sm">
                {similar.map((p) => (
                  <li key={p.id}>
                    {p.formLabel} <b>{p.brandName}</b> {p.strengthText} — {p.genericText} <span className="text-slate-500">({p.companyName ?? "—"})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ReviewActions requestId={r.id} />

          {typedCompany && !companyId && (
            <form action={createRequestCompany} className="card mb-4 flex flex-wrap items-center gap-2 p-4 text-sm">
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="name" value={typedCompany} />
              <span>
                The company “<b>{typedCompany}</b>” is not in the catalogue.
              </span>
              <button type="submit" className="btn-secondary">
                Add company
              </button>
            </form>
          )}

          <h2 className="mb-2 font-semibold">Edit, then approve for all doctors</h2>
          <ProductForm
            key={companyId}
            forms={forms}
            companies={companies}
            initial={{
              requestId: r.id,
              brandName: r.brandName,
              formId: r.formId ?? "",
              companyId,
              strengthText: r.strengthText ?? "",
              darNumber: "",
              medicineSystem: "allopathic",
              isActive: true,
              ingredients: r.genericIds.length
                ? r.genericIds.map((g) => ({ generic: { id: g, name: nameOf.get(g) ?? g }, strengthValue: "", strengthUnit: "", basis: "" }))
                : [{ generic: null, strengthValue: "", strengthUnit: "", basis: "" }],
              packs: [],
            }}
          />
        </>
      )}
    </>
  );
}
