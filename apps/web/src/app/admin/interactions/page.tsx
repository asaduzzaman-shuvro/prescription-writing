import { s } from "@rx/db";
import { alias } from "drizzle-orm/pg-core";
import { asc, eq } from "drizzle-orm";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { toggleInteraction } from "./actions";
import { InteractionForm } from "./form";
import { connection } from "next/server";

export const metadata = { title: "Interactions" };
const SIZE = 50;

const SEV: Record<string, string> = { minor: "bg-slate-100", moderate: "bg-amber-50 text-amber-800", major: "bg-red-50 text-red-700", contraindicated: "bg-red-600 text-white" };

export default async function InteractionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const ga = alias(s.generic, "ga");
  const gb = alias(s.generic, "gb");
  const rows = await ownerDb
    .select({ i: s.genericInteraction, a: ga.name, b: gb.name })
    .from(s.genericInteraction)
    .innerJoin(ga, eq(ga.id, s.genericInteraction.genericA))
    .innerJoin(gb, eq(gb.id, s.genericInteraction.genericB))
    .orderBy(asc(ga.name), asc(s.genericInteraction.id))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);
  const shown = rows.slice(0, SIZE);
  return (
    <>
      <PageHeader title="Drug–drug interactions" subtitle="Curated pairs checked offline while the doctor prescribes. No free commercial interaction database exists — enter pharmacist-reviewed pairs or import a licensed set." />
      <InteractionForm />
      <div className="card mt-4 overflow-x-auto">
        <table className="table">
          <thead><tr><th>Generic A</th><th>Generic B</th><th>Severity</th><th>Effect / management</th><th>Reviewed by</th><th></th></tr></thead>
          <tbody>
            {shown.map(({ i, a, b }) => (
              <tr key={i.id} className={i.isActive ? "" : "opacity-50"}>
                <td>{a}</td><td>{b}</td>
                <td><span className={`badge ${SEV[i.severity]}`}>{i.severity}</span></td>
                <td>{i.effect}{i.management && <div className="text-xs text-slate-500">{i.management}</div>}</td>
                <td className="text-xs">{i.reviewedBy}</td>
                <td><form action={toggleInteraction}><input type="hidden" name="id" value={i.id} /><button className="btn-ghost text-xs">{i.isActive ? "Disable" : "Enable"}</button></form></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="text-slate-500">No interactions yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {(page > 1 || rows.length > SIZE) && <Pager page={page} hasNext={rows.length > SIZE} base="/admin/interactions" />}
    </>
  );
}
