import { LAB_DEPARTMENTS } from "@rx/core";
import { s } from "@rx/db";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { saveLabCatalogueEntry } from "../../actions";
import { connection } from "next/server";

export const metadata = { title: "Lab catalogue" };

const KINDS = ["numeric", "coded", "text", "titre", "culture"];

export default async function LabCatalogueEntryPage({ params, searchParams }: {
  params: Promise<{ table: string; code: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await connection();
  const { table, code: rawCode } = await params;
  const { error, saved } = await searchParams;
  if (table !== "tests" && table !== "panels") notFound();
  const code = decodeURIComponent(rawCode);
  const isNew = code === "new";
  const isTest = table === "tests";

  let row: { name: string | null; short?: string | null; unit?: string | null; kind?: string | null; department: string | null; sortOrder: number | null; isActive: boolean; spec: unknown; source: string } | undefined;
  let changedBy = 0;
  if (!isNew) {
    if (isTest) {
      [row] = await ownerDb.select().from(s.labTest).where(and(eq(s.labTest.code, code), isNull(s.labTest.tenantId)));
      const [c] = await ownerDb.select({ n: sql<number>`count(*)::int` }).from(s.labTest).where(and(eq(s.labTest.code, code), isNotNull(s.labTest.tenantId)));
      changedBy = c?.n ?? 0;
    } else {
      [row] = await ownerDb.select().from(s.labPanel).where(and(eq(s.labPanel.key, code), isNull(s.labPanel.tenantId)));
    }
    if (!row) notFound();
  }
  const title = isNew ? (isTest ? "New lab test" : "New lab panel") : `${row!.name} · ${code}`;

  return (
    <>
      <PageHeader title={title} subtitle={isNew ? "The code can't be changed once saved: results are stored under it." : `Source ${row!.source}`} actions={<Link href="/admin/lab-catalogue" className="btn-secondary">← Catalogue</Link>} />
      {saved && <div className="mb-3 rounded bg-green-50 p-2 text-sm text-green-800">Saved. Clinics receive it on their next sync; the seed no longer updates this row.</div>}
      {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800" data-testid="admin-lab-error">{error}</div>}
      {changedBy > 0 && (
        <div className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-900">
          {changedBy} clinic{changedBy === 1 ? " has" : "s have"} changed this test. Their changes stay on top of yours; made inactive, the test leaves their catalogue too.
        </div>
      )}
      <form action={saveLabCatalogueEntry} className="card space-y-3 p-4">
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="isNew" value={isNew ? "1" : "0"} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm"><span className="label">{isTest ? "Code (LOINC, else bd-…)" : "Key"}</span>
            {isNew ? <input name="code" className="input font-mono" required data-testid="admin-lab-code" /> : <><input type="hidden" name="code" value={code} /><div className="py-2 font-mono">{code}</div></>}
          </label>
          <label className="text-sm"><span className="label">Name</span><input name="name" defaultValue={row?.name ?? ""} className="input" required data-testid="admin-lab-name" /></label>
          {isTest && <label className="text-sm"><span className="label">Short name (printed)</span><input name="short" defaultValue={row?.short ?? ""} className="input" required /></label>}
          {isTest && <label className="text-sm"><span className="label">Unit</span><input name="unit" defaultValue={row?.unit ?? ""} className="input" data-testid="admin-lab-unit" /></label>}
          {isTest && (
            <label className="text-sm"><span className="label">Kind</span>
              <select name="kind" defaultValue={row?.kind ?? "numeric"} className="input">{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            </label>
          )}
          <label className="text-sm"><span className="label">Department</span>
            <select name="department" defaultValue={row?.department ?? "biochemistry"} className="input">
              {LAB_DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="label">Sort order</span><input name="sortOrder" type="number" defaultValue={row?.sortOrder ?? 5000} className="input" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={row?.isActive ?? true} /> Active</label>
        </div>
        <label className="block text-sm">
          <span className="label">Spec (JSON)</span>
          <span className="mb-1 block text-xs text-slate-500">
            {isTest
              ? 'range {low, high, male, female, bands[{sex, minAgeDays, maxAgeDays, low, high}]}, refText, options, normal, aliases, decimals, perCmmFrom, printAs "per_cmm", allowRange, titreSignificant, antibiotics, method. Unknown keys are dropped.'
              : 'sections [{title?, tests: [codes]}], code (LOINC), specimen, layout "table" | "culture", aliases. Unknown keys are dropped.'}
          </span>
          <textarea name="spec" rows={14} className="input font-mono text-xs" defaultValue={JSON.stringify(row?.spec ?? (isTest ? {} : { sections: [{ tests: [] }] }), null, 2)} data-testid="admin-lab-spec" />
        </label>
        <button className="btn-primary" data-testid="admin-lab-save">Save</button>
      </form>
    </>
  );
}
