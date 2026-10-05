import { s } from "@rx/db";
import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { createSpecialty } from "./actions";

export const metadata = { title: "Exam templates" };

const ERRORS: Record<string, string> = {
  specialty: "Code must be lower-case letters, digits or _ (e.g. ophthalmology), and a name is required.",
  exists: "A specialty with that code already exists.",
};

export default async function SpecialtyTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; added?: string }> }) {
  const { error, added } = await searchParams;
  const rows = await ownerDb.select().from(s.specialtyTemplate).orderBy(asc(s.specialtyTemplate.specialtyCode), asc(s.specialtyTemplate.name), desc(s.specialtyTemplate.version));
  const specialties = await ownerDb.select().from(s.specialty).orderBy(asc(s.specialty.name));
  return (
    <>
      <PageHeader title="Specialty exam templates" subtitle="Structured examination forms shown in the doctor's editor (e.g. ENT ear/nose/throat)" actions={<Link href="/admin/specialty-templates/new" className="btn-primary">+ New template</Link>} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Specialty</th><th>Name</th><th>Version</th><th>Status</th><th>Sections</th></tr></thead>
          <tbody>
            {rows.map((t) => {
              const schema = JSON.parse(t.schema) as { sections: { title: string; fields: unknown[] }[] };
              return (
                <tr key={t.id} className={t.isActive ? "" : "opacity-50"}>
                  <td>{t.specialtyCode}</td>
                  <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/specialty-templates/${t.id}`}>{t.name}</Link></td>
                  <td>v{t.version}</td>
                  <td>{t.isActive ? "Live" : "Superseded"}</td>
                  <td className="text-xs">{schema.sections.map((sec) => `${sec.title} (${sec.fields.length})`).join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <section className="card mt-6 space-y-3 p-4">
        <h2 className="font-semibold">Specialties</h2>
        <p className="text-sm text-slate-600">{specialties.map((sp) => `${sp.name}${sp.nameBn ? ` (${sp.nameBn})` : ""} · ${sp.code}`).join(" — ")}</p>
        {error && ERRORS[error] && <p className="text-sm text-red-600">{ERRORS[error]}</p>}
        {added && <p className="text-sm text-green-700">Added {added}. Doctors can be assigned it on their profile; add its exam template above.</p>}
        <form action={createSpecialty} className="flex flex-wrap items-end gap-2">
          <label className="text-sm"><span className="label">Code</span><input name="code" className="input w-40" placeholder="cardiology" required /></label>
          <label className="text-sm"><span className="label">Name</span><input name="name" className="input w-56" placeholder="Cardiology" required /></label>
          <label className="text-sm"><span className="label">Name (Bangla)</span><input name="nameBn" className="input w-48" placeholder="হৃদরোগ" /></label>
          <button className="btn-secondary">Add specialty</button>
        </form>
      </section>
    </>
  );
}
