import { ENT_TEMPLATE } from "@rx/core";
import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { SchemaEditor } from "./schema-editor";

export const metadata = { title: "Exam template" };

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string }> }) {
  const { id } = await params;
  const { published } = await searchParams;
  const specialties = await ownerDb.select().from(s.specialty);
  if (id === "new") {
    return (
      <>
        <PageHeader title="New exam template" subtitle="Starts from the ENT template as an example" />
        <SchemaEditor specialties={specialties} initial={{ specialtyCode: "ent", name: "", schema: JSON.stringify(ENT_TEMPLATE, null, 2) }} />
      </>
    );
  }
  const [t] = await ownerDb.select().from(s.specialtyTemplate).where(eq(s.specialtyTemplate.id, id));
  if (!t) notFound();
  return (
    <>
      <PageHeader title={`${t.name} · v${t.version}`} subtitle={`${t.specialtyCode} · ${t.isActive ? "live" : "superseded"} · saving publishes v${t.version + 1}`} />
      {published && <div className="mb-3 rounded bg-green-50 p-2 text-sm text-green-800">Published v{published}. Doctors receive it on their next sync.</div>}
      <SchemaEditor specialties={specialties} initial={{ specialtyCode: t.specialtyCode, name: t.name, schema: JSON.stringify(JSON.parse(t.schema), null, 2) }} />
    </>
  );
}
