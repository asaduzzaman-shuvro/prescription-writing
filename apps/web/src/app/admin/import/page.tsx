import { PageHeader } from "@/components/ui";
import { MEDICINE_FIELDS } from "@rx/db/import";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import medicines" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import medicines (CSV)"
        subtitle="Upload a DGDA export, a licensed feed or your own sheet. Preview the changes before committing. Nothing is ever deleted."
        actions={
          <>
            <a className="btn-secondary" href="/api/admin/catalogue/template">Download template</a>
            <a className="btn-secondary" href="/api/admin/catalogue/export">Export catalogue</a>
          </>
        }
      />
      <ImportWizard fields={MEDICINE_FIELDS.map((f) => ({ key: f.key, label: f.label, required: f.required }))} />
    </>
  );
}
