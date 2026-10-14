import { s } from "@rx/db";
import { asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClearingForm, FormSaveButton } from "@/components/save-button";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { saveLibraryItem, toggleLibraryItem } from "../actions";
import { isLibraryKind, LIBRARIES } from "../config";
import { connection } from "next/server";

export const metadata = { title: "Libraries" };
const SIZE = 50;

export default async function LibraryPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ spec?: string; page?: string }> }) {
  await connection();
  const { kind } = await params;
  const sp = await searchParams;
  if (!isLibraryKind(kind)) notFound();
  const lib = LIBRARIES[kind];
  const table = lib.table as any;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const spec = sp.spec;
  const specFilter = spec === "all" ? isNull(table.specialtyCode) : spec ? eq(table.specialtyCode, spec) : undefined;
  const [rows, specialties] = await Promise.all([
    ownerDb
      .select()
      .from(table)
      .where(specFilter)
      .orderBy(asc(table.specialtyCode), asc(table.sortOrder), asc(table.id))
      .limit(SIZE + 1)
      .offset((page - 1) * SIZE) as Promise<Record<string, any>[]>,
    ownerDb.select().from(s.specialty),
  ]);
  const shown = rows.slice(0, SIZE);
  const SpecSelect = ({ value }: { value?: string | null }) => (
    <select name="specialtyCode" defaultValue={value ?? ""} className="input w-auto">
      <option value="">All specialties</option>
      {specialties.map((sp) => <option key={sp.code} value={sp.code}>{sp.name}</option>)}
    </select>
  );
  return (
    <>
      <PageHeader title={lib.title} subtitle="Pick-lists shown to doctors while writing prescriptions" />
      <div className="mb-4 flex flex-wrap gap-1">
        {Object.entries(LIBRARIES).map(([k, l]) => (
          <Link key={k} href={`/admin/libraries/${k}`} className={`rounded-md px-3 py-1 text-sm ${k === kind ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{l.title}</Link>
        ))}
      </div>
      <ClearingForm action={saveLibraryItem} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="kind" value={kind} />
        {lib.fields.map((f) => (
          <div key={f.key} className="min-w-48 flex-1"><label className="label">{f.label}</label><input name={f.key} className="input" required={f === lib.fields[0]} /></div>
        ))}
        <SpecSelect />
        <FormSaveButton className="btn-primary" pendingLabel="Adding…">Add</FormSaveButton>
      </ClearingForm>
      <div className="mb-2 flex gap-2 text-sm">
        Filter:
        <Link href={`/admin/libraries/${kind}`} className="underline">All</Link>
        <Link href={`/admin/libraries/${kind}?spec=all`} className="underline">Common</Link>
        {specialties.map((sp) => <Link key={sp.code} href={`/admin/libraries/${kind}?spec=${sp.code}`} className="underline">{sp.name}</Link>)}
      </div>
      <div className="card divide-y divide-slate-100">
        {shown.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-2 p-2 ${r.isActive ? "" : "opacity-50"}`}>
            <form action={saveLibraryItem} className="flex flex-1 flex-wrap items-center gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={r.id} />
              {lib.fields.map((f) => <input key={f.key} name={f.key} defaultValue={r[f.key] ?? ""} className="input min-w-40 flex-1" aria-label={f.label} />)}
              <SpecSelect value={r.specialtyCode} />
              <FormSaveButton className="btn-ghost text-xs">Save</FormSaveButton>
            </form>
            <form action={toggleLibraryItem}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={r.id} />
              <button className="btn-ghost text-xs">{r.isActive ? "Deactivate" : "Activate"}</button>
            </form>
          </div>
        ))}
        {!shown.length && <p className="p-3 text-sm text-slate-500">Nothing on this page.</p>}
      </div>
      {(page > 1 || rows.length > SIZE) && (
        <Pager page={page} hasNext={rows.length > SIZE} base={`/admin/libraries/${kind}${spec ? `?spec=${encodeURIComponent(spec)}` : ""}`} />
      )}
    </>
  );
}
