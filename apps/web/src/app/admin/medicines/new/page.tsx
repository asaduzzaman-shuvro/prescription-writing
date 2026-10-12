import { PageHeader } from "@/components/ui";
import { companyOptions, formOptions } from "@/lib/catalogue";
import { ProductForm } from "../product-form";
import { connection } from "next/server";

export const metadata = { title: "Add medicine" };

export default async function NewMedicine() {
  await connection();
  const [forms, companies] = await Promise.all([formOptions(), companyOptions()]);
  return (
    <>
      <PageHeader title="Add medicine" />
      <ProductForm
        forms={forms}
        companies={companies}
        initial={{
          brandName: "",
          formId: "",
          companyId: "",
          strengthText: "",
          darNumber: "",
          medicineSystem: "allopathic",
          isActive: true,
          ingredients: [{ generic: null, strengthValue: "", strengthUnit: "", basis: "" }],
          packs: [],
        }}
      />
    </>
  );
}
