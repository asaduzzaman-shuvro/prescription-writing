import { LAB_DEPARTMENTS } from "@rx/core";
import { s } from "@rx/db";
import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { connection } from "next/server";

export const metadata = { title: "Lab catalogue" };

const deptName = (d: string | null) => LAB_DEPARTMENTS.find((x) => x.id === d)?.name ?? d ?? "";
const SIZE = 50;

export default async function LabCataloguePage({ searchParams }: { searchParams: Promise<{ dept?: string; q?: string; page?: string; ppage?: string }> }) {
  await connection();
  const sp = await searchParams;
  const dept = sp.dept ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const ppage = Math.max(1, Number(sp.ppage ?? 1) || 1);
  const words = q.trim();
  const text = words ? `%${words}%` : "";
  const [tests, panels] = await Promise.all([
    ownerDb
      .select({
        id: s.labTest.id,
        name: s.labTest.name,
        short: s.labTest.short,
        code: s.labTest.code,
        department: s.labTest.department,
        unit: s.labTest.unit,
        kind: s.labTest.kind,
        source: s.labTest.source,
        isActive: s.labTest.isActive,
      })
      .from(s.labTest)
      .where(
        and(
          isNull(s.labTest.tenantId),
          dept ? eq(s.labTest.department, dept) : undefined,
          text ? or(ilike(s.labTest.name, text), ilike(s.labTest.short, text), ilike(s.labTest.code, text)) : undefined,
        ),
      )
      .orderBy(asc(s.labTest.sortOrder), asc(s.labTest.name), asc(s.labTest.code))
      .limit(SIZE + 1)
      .offset((page - 1) * SIZE),
    ownerDb
      .select()
      .from(s.labPanel)
      .where(
        and(
          isNull(s.labPanel.tenantId),
          dept ? eq(s.labPanel.department, dept) : undefined,
          text ? or(ilike(s.labPanel.name, text), ilike(s.labPanel.key, text)) : undefined,
        ),
      )
      .orderBy(asc(s.labPanel.sortOrder), asc(s.labPanel.name), asc(s.labPanel.key))
      .limit(SIZE + 1)
      .offset((ppage - 1) * SIZE),
  ]);
  const shownTests = tests.slice(0, SIZE);
  const shownPanels = panels.slice(0, SIZE);
  const codes = shownTests.map((t) => t.code);
  const overrides = codes.length
    ? await ownerDb
        .select({ code: s.labTest.code, n: sql<number>`count(*)::int` })
        .from(s.labTest)
        .where(and(isNotNull(s.labTest.tenantId), inArray(s.labTest.code, codes)))
        .groupBy(s.labTest.code)
    : [];
  const changedBy = new Map(overrides.map((o) => [o.code, o.n]));
  const filter = `q=${encodeURIComponent(q)}&dept=${encodeURIComponent(dept)}`;
  return (
    <>
      <PageHeader
        title="Lab catalogue"
        subtitle="The tests and panels every clinic starts from. Clinics adjust ranges and hide tests on their own; codes are permanent."
        actions={<><Link href="/admin/lab-catalogue/tests/new" className="btn-primary">+ New test</Link> <Link href="/admin/lab-catalogue/panels/new" className="btn-secondary">+ New panel</Link></>}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder="Find…" className="input w-56" />
        <select name="dept" defaultValue={dept} className="input w-auto">
          <option value="">All departments</option>
          {LAB_DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <p className="mb-2 text-xs text-slate-500">
        Rows marked <b>admin</b> were edited here: <code>pnpm db:seed:labs</code> no longer updates them. Ranges need a pathologist&apos;s review before production.
      </p>
      <div className="card mb-6 overflow-x-auto">
        <table className="table text-sm" data-testid="admin-lab-tests">
          <thead><tr><th>Test</th><th>Code</th><th>Department</th><th>Unit</th><th>Kind</th><th>Source</th><th>Clinics changed</th></tr></thead>
          <tbody>
            {shownTests.map((t) => (
              <tr key={t.id} className={t.isActive ? "" : "opacity-50"}>
                <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/lab-catalogue/tests/${encodeURIComponent(t.code)}`}>{t.name}</Link> <span className="text-xs text-slate-500">{t.short}</span></td>
                <td className="font-mono text-xs">{t.code}</td>
                <td className="text-xs">{deptName(t.department)}</td>
                <td>{t.unit}</td>
                <td className="text-xs">{t.kind}</td>
                <td className="text-xs">{t.source}{t.isActive ? "" : " · inactive"}</td>
                <td className="text-xs">{changedBy.get(t.code) ?? ""}</td>
              </tr>
            ))}
            {!shownTests.length && <tr><td colSpan={7} className="text-slate-500">No tests on this page.</td></tr>}
          </tbody>
        </table>
      </div>
      {(page > 1 || tests.length > SIZE) && <Pager page={page} hasNext={tests.length > SIZE} base={`/admin/lab-catalogue?${filter}&ppage=${ppage}`} />}
      <h2 className="mb-2 font-semibold">Panels</h2>
      <div className="card overflow-x-auto">
        <table className="table text-sm" data-testid="admin-lab-panels">
          <thead><tr><th>Panel</th><th>Key</th><th>Department</th><th>Tests</th><th>Source</th></tr></thead>
          <tbody>
            {shownPanels.map((p) => {
              const sections = (p.spec as { sections?: { tests: string[] }[] }).sections ?? [];
              return (
                <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                  <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/lab-catalogue/panels/${encodeURIComponent(p.key)}`}>{p.name}</Link></td>
                  <td className="font-mono text-xs">{p.key}</td>
                  <td className="text-xs">{deptName(p.department)}</td>
                  <td className="text-xs">{sections.reduce((n, sec) => n + sec.tests.length, 0)}</td>
                  <td className="text-xs">{p.source}{p.isActive ? "" : " · inactive"}</td>
                </tr>
              );
            })}
            {!shownPanels.length && <tr><td colSpan={5} className="text-slate-500">No panels on this page.</td></tr>}
          </tbody>
        </table>
      </div>
      {(ppage > 1 || panels.length > SIZE) && <Pager page={ppage} hasNext={panels.length > SIZE} base={`/admin/lab-catalogue?${filter}&page=${page}`} />}
    </>
  );
}
