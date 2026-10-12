import type { RxItem } from "@rx/core";
import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { TemplateEditor } from "../editor";
import { connection } from "next/server";

export const metadata = { title: "Template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const specialties = await ownerDb.select().from(s.specialty);
  if (id === "new") {
    return (
      <>
        <PageHeader title="New shared template" />
        <TemplateEditor specialties={specialties} initial={{ name: "", specialtyCode: null, chiefComplaints: [], investigations: [], diagnoses: [], advice: [], items: [], isActive: true }} />
      </>
    );
  }
  const [t] = await ownerDb.select().from(s.rxTemplate).where(eq(s.rxTemplate.id, id));
  if (!t || t.tenantId) notFound();
  const p = t.payload as { chiefComplaints?: string[]; investigations?: string[]; diagnoses?: string[]; advice?: string[]; items?: RxItem[] };
  return (
    <>
      <PageHeader title={t.name} />
      <TemplateEditor
        specialties={specialties}
        initial={{ id: t.id, name: t.name, specialtyCode: t.specialtyCode, chiefComplaints: p.chiefComplaints ?? [], investigations: p.investigations ?? [], diagnoses: p.diagnoses ?? [], advice: p.advice ?? [], items: p.items ?? [], isActive: t.isActive }}
      />
    </>
  );
}
