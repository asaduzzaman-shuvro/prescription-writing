import { s } from "@rx/db";
import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Empty, PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Doctor-added medicines" };
const SIZE = 50;

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Not approved" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const DONE: Record<string, string> = {
  approved: "Approved: the medicine is now in the catalogue for every doctor.",
  merged: "Merged: the doctor now sees the existing catalogue medicine.",
  rejected: "Not approved: the medicine stays private to the doctor, who sees your note.",
};

function filterHref(filter: Filter) {
  return filter === "pending" ? "/admin/medicine-requests" : `/admin/medicine-requests?status=${filter}`;
}

export default async function MedicineRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; done?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filter: Filter = FILTERS.some((f) => f.key === sp.status) ? (sp.status as Filter) : "pending";

  const [rows, counts] = await Promise.all([
    ownerDb
      .select({
        id: s.customMedicine.id,
        brandName: s.customMedicine.brandName,
        strengthText: s.customMedicine.strengthText,
        genericText: s.customMedicine.genericText,
        unlinkedGeneric: sql<boolean>`cardinality(${s.customMedicine.genericIds}) = 0`,
        form: s.dosageForm.name,
        company: sql<string | null>`coalesce(${s.company.name}, ${s.customMedicine.companyName})`,
        status: s.customMedicine.status,
        reviewNote: s.customMedicine.reviewNote,
        doctor: sql<string>`coalesce(${s.doctorProfile.nameEn}, ${s.appUser.name})`,
        clinic: s.tenant.name,
        createdAt: s.customMedicine.createdAt,
      })
      .from(s.customMedicine)
      .innerJoin(s.appUser, eq(s.appUser.id, s.customMedicine.ownerUserId))
      .innerJoin(s.tenant, eq(s.tenant.id, s.customMedicine.tenantId))
      .leftJoin(s.doctorProfile, eq(s.doctorProfile.userId, s.customMedicine.ownerUserId))
      .leftJoin(s.dosageForm, eq(s.dosageForm.id, s.customMedicine.formId))
      .leftJoin(s.company, eq(s.company.id, s.customMedicine.companyId))
      .where(filter === "all" ? undefined : and(eq(s.customMedicine.status, filter)))
      .orderBy(filter === "pending" ? s.customMedicine.createdAt : desc(s.customMedicine.createdAt))
      .limit(SIZE + 1)
      .offset((page - 1) * SIZE),
    ownerDb
      .select({ status: s.customMedicine.status, n: sql<number>`count(*)::int` })
      .from(s.customMedicine)
      .groupBy(s.customMedicine.status),
  ]);
  const countOf = (k: Filter) => (k === "all" ? counts.reduce((a, c) => a + c.n, 0) : (counts.find((c) => c.status === k)?.n ?? 0));

  return (
    <>
      <PageHeader title="Doctor-added medicines" subtitle="Medicines doctors added while prescribing. Only the doctor sees one until you approve it." />
      {sp.done && DONE[sp.done] && <div className="mb-3 rounded-md bg-green-50 p-2 text-sm text-green-800">{DONE[sp.done]}</div>}
      <nav className="mb-2 flex flex-wrap gap-1.5" aria-label="Status">
        {FILTERS.map((f) => (
          <Link key={f.key} href={filterHref(f.key)} className={f.key === filter ? "btn-primary" : "btn-secondary"} aria-current={f.key === filter ? "page" : undefined}>
            {f.label} <span className="tabular-nums opacity-75">{countOf(f.key)}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>No {filter === "all" ? "" : FILTERS.find((f) => f.key === filter)!.label.toLowerCase()} requests.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table" data-testid="medicine-requests">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Generic</th>
                <th>Company</th>
                <th>Doctor</th>
                <th>Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SIZE).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/medicine-requests/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.form ? `${r.form} ` : ""}
                      {r.brandName} {r.strengthText}
                    </Link>
                  </td>
                  <td>
                    {r.genericText ?? "—"}
                    {r.unlinkedGeneric && <span className="badge ml-1 bg-amber-50 text-amber-800">typed in</span>}
                  </td>
                  <td className="text-slate-600">{r.company ?? "—"}</td>
                  <td>
                    {r.doctor}
                    <div className="text-xs text-slate-500">{r.clinic}</div>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{r.createdAt.toLocaleDateString("en-GB")}</td>
                  <td>
                    <span className={`badge ${r.status === "pending" ? "bg-amber-50 text-amber-800" : r.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {r.status === "rejected" ? "not approved" : r.status}
                    </span>
                    {r.reviewNote && <div className="text-xs text-slate-500">{r.reviewNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} hasNext={rows.length > SIZE} base={filterHref(filter)} />
    </>
  );
}
