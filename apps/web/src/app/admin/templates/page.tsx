import { formatInstruction, type RxItem } from "@rx/core";
import { s } from "@rx/db";
import { asc, isNull } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Shared Rx templates" };

export default async function SharedTemplatesPage() {
  const rows = await ownerDb.select().from(s.rxTemplate).where(isNull(s.rxTemplate.tenantId)).orderBy(asc(s.rxTemplate.specialtyCode), asc(s.rxTemplate.name));
  return (
    <>
      <PageHeader title="Shared Rx templates" subtitle="Guideline templates offered to every doctor (they appear with ★ in “Apply template”)" actions={<Link href="/admin/templates/new" className="btn-primary">+ New template</Link>} />
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((t) => {
          const p = t.payload as { items?: RxItem[]; diagnoses?: string[] };
          return (
            <Link key={t.id} href={`/admin/templates/${t.id}`} className={`card block p-3 text-sm hover:border-brand-500 ${t.isActive ? "" : "opacity-50"}`}>
              <div className="flex justify-between"><b>{t.name}</b><span className="text-xs text-slate-500">{t.specialtyCode ?? "all"}</span></div>
              {p.diagnoses?.length ? <div className="text-slate-500">Dx: {p.diagnoses.join(", ")}</div> : null}
              <ol className="mt-1 list-decimal pl-5">{(p.items ?? []).map((i) => <li key={i.id}><b>{i.brandName}</b> {i.strength} — {formatInstruction(i, "bn", "bn")}</li>)}</ol>
            </Link>
          );
        })}
        {!rows.length && <p className="text-sm text-slate-500">No shared templates yet.</p>}
      </div>
    </>
  );
}
