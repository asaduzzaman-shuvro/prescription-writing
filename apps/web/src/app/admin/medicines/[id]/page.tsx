import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { companyOptions, formOptions, getProduct } from "@/lib/catalogue";
import { ProductForm } from "../product-form";

export const metadata = { title: "Edit medicine" };

export default async function EditMedicine({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const [p, forms, companies] = await Promise.all([getProduct(id), formOptions(), companyOptions()]);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={`${p.brandName} ${p.strengthText ?? ""}`}
        subtitle={`Source: ${p.source}${p.sourceRef ? ` (${p.sourceRef})` : ""} · updated ${p.updatedAt.toLocaleString("en-GB")}`}
      />
      {saved && <div className="mb-4 rounded-md bg-green-50 p-2 text-sm text-green-800">Saved.</div>}
      <ProductForm
        key={p.updatedAt.toISOString()}
        forms={forms}
        companies={companies}
        initial={{
          id: p.id,
          brandName: p.brandName,
          formId: p.formId ?? "",
          companyId: p.companyId ?? "",
          strengthText: p.strengthText ?? "",
          darNumber: p.darNumber ?? "",
          medicineSystem: p.medicineSystem,
          isActive: p.isActive,
          ingredients: p.ingredients.map((i) => ({
            generic: { id: i.genericId, name: i.genericName },
            strengthValue: i.strengthValue ?? "",
            strengthUnit: i.strengthUnit ?? "",
            basis: i.basis ?? "",
          })),
          packs: p.packs.map((k) => ({ description: k.description, packSize: k.packSize ?? "", mrp: k.mrp ?? "", govtFixed: k.govtFixed })),
        }}
      />
    </>
  );
}
