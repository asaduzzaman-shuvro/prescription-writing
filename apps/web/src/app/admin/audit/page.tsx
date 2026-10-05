import { s } from "@rx/db";
import { and, desc, eq, ilike } from "drizzle-orm";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Audit log" };
const SIZE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; page?: string }> }) {
  await requireAdmin({ superOnly: true });
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const rows = await ownerDb
    .select({ log: s.auditLog, actor: s.appUser.email, tenant: s.tenant.name })
    .from(s.auditLog)
    .leftJoin(s.appUser, eq(s.appUser.id, s.auditLog.actorUserId))
    .leftJoin(s.tenant, eq(s.tenant.id, s.auditLog.tenantId))
    .where(and(sp.action ? ilike(s.auditLog.action, `${sp.action}%`) : undefined, sp.entity ? eq(s.auditLog.entityId, sp.entity) : undefined))
    .orderBy(desc(s.auditLog.at))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, when — append-only (retain ≥ 5 years under the data protection law)" />
      <form className="mb-3 flex gap-2">
        <input name="action" defaultValue={sp.action} placeholder="Action prefix (e.g. catalogue.)" className="input max-w-xs" />
        <input name="entity" defaultValue={sp.entity} placeholder="Entity id" className="input max-w-xs" />
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Chamber</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {rows.slice(0, SIZE).map(({ log, actor, tenant }) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap text-xs">{log.at.toLocaleString("en-GB")}</td>
                <td className="text-xs">{actor ?? "system"}</td>
                <td className="text-xs">{tenant}</td>
                <td><code className="text-xs">{log.action}</code></td>
                <td className="text-xs">{log.entity}<div className="text-slate-400">{log.entityId?.slice(0, 8)}</div></td>
                <td>
                  {(log.after || log.before) ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-brand-700">view</summary>
                      <pre className="max-w-xl overflow-auto whitespace-pre-wrap">{JSON.stringify({ before: log.before, after: log.after }, null, 1).slice(0, 4000)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasNext={rows.length > SIZE} base={`/admin/audit?action=${sp.action ?? ""}&entity=${sp.entity ?? ""}`} />
    </>
  );
}
