import { LAB_DEPARTMENTS } from "@rx/core";
import { s } from "@rx/db";
import { asc, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Lab catalogue" };

const deptName = (d: string | null) => LAB_DEPARTMENTS.find((x) => x.id === d)?.name ?? d ?? "";

export default async function LabCataloguePage({ searchParams }: { searchParams: Promise<{ dept?: string; q?: string }> }) {
  const { dept = "", q = "" } = await searchParams;
  const [tests, panels, overrides] = await Promise.all([
    ownerDb.select().from(s.labTest).where(isNull(s.labTest.tenantId)).orderBy(asc(s.labTest.sortOrder)),
    ownerDb.select().from(s.labPanel).where(isNull(s.labPanel.tenantId)).orderBy(asc(s.labPanel.sortOrder)),
    ownerDb.select({ code: s.labTest.code, n: sql<number>`count(*)::int` }).from(s.labTest).where(isNotNull(s.labTest.tenantId)).groupBy(s.labTest.code),
  ]);
  const changedBy = new Map(overrides.map((o) => [o.code, o.n]));
  const words = q.trim().toLowerCase();
  const match = (r: { department: string | null; name: string | null }, extra: string) =>
    (!dept || r.department === dept) && (!words || `${r.name} ${extra}`.toLowerCase().includes(words));
  const shownTests = tests.filter((t) => match(t, `${t.short} ${t.code}`));
  const shownPanels = panels.filter((p) => match(p, p.key));
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
          </tbody>
        </table>
      </div>
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
          </tbody>
        </table>
      </div>
    </>
  );
}
