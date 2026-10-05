import { s } from "@rx/db";
import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { GenericForm } from "./generic-form";

export const metadata = { title: "Generic" };

const stripHtml = (h: string | null) => (h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").trim();

export default async function GenericPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [g] = await ownerDb.select().from(s.generic).where(eq(s.generic.id, id));
  if (!g) notFound();
  const [classes, mono, brands] = await Promise.all([
    ownerDb.select({ name: s.drugClass.name }).from(s.genericDrugClass).innerJoin(s.drugClass, eq(s.drugClass.id, s.genericDrugClass.drugClassId)).where(eq(s.genericDrugClass.genericId, id)),
    ownerDb.select().from(s.genericMonograph).where(eq(s.genericMonograph.genericId, id)),
    ownerDb
      .select({ id: s.brandProduct.id, brandName: s.brandProduct.brandName, strengthText: s.brandProduct.strengthText, genericText: s.brandProduct.genericText })
      .from(s.productIngredient)
      .innerJoin(s.brandProduct, eq(s.brandProduct.id, s.productIngredient.productId))
      .where(eq(s.productIngredient.genericId, id))
      .orderBy(asc(sql`lower(${s.brandProduct.brandName})`))
      .limit(200),
  ]);
  const m = mono[0];
  return (
    <>
      <PageHeader title={g.name} subtitle={`Source: ${g.source}`} />
      <GenericForm
        g={{
          id: g.id,
          name: g.name,
          synonyms: g.synonyms.join(", "),
          isAntibiotic: g.isAntibiotic,
          awareGroup: g.awareGroup ?? "",
          pregnancyCategory: g.pregnancyCategory ?? "",
          paedMaxMgPerKgDay: g.paedMaxMgPerKgDay ?? "",
          adultMaxMgPerDay: g.adultMaxMgPerDay ?? "",
          classes: classes.map((c) => c.name).join(", "),
          isActive: g.isActive,
        }}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold">Brands ({brands.length}{brands.length === 200 ? "+" : ""})</h2>
          <div className="card max-h-96 overflow-auto p-2 text-sm">
            {brands.map((b) => (
              <Link key={b.id} href={`/admin/medicines/${b.id}`} className="block rounded px-2 py-1 hover:bg-slate-50">
                <b>{b.brandName}</b> {b.strengthText} <span className="text-slate-500">{b.genericText !== g.name && `(${b.genericText})`}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Monograph {m && <span className="text-xs font-normal text-slate-500">({m.source})</span>}</h2>
          <div className="card max-h-96 space-y-3 overflow-auto p-3 text-sm">
            {!m && <p className="text-slate-500">No monograph.</p>}
            {m &&
              (["indications", "dosage", "contraindications", "sideEffects", "interactions", "pregnancyLactation", "precautions"] as const).map(
                (k) => m[k] && (
                  <div key={k}>
                    <div className="text-xs font-semibold uppercase text-slate-500">{k}</div>
                    <p className="whitespace-pre-line">{stripHtml(m[k])}</p>
                  </div>
                ),
              )}
          </div>
        </div>
      </div>
    </>
  );
}
