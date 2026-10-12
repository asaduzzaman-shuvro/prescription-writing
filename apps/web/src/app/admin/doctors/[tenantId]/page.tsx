import { s } from "@rx/db";
import { desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { addSmsCredits, setTenantStatus, verifyBmdc } from "../actions";
import { RecordPaymentForm } from "./billing";
import { AddMemberForm, ProfileForm, ResetPasswordForm } from "./forms";
import { connection } from "next/server";

export const metadata = { title: "Chamber" };

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await connection();
  const { tenantId } = await params;
  const [t] = await ownerDb.select().from(s.tenant).where(eq(s.tenant.id, tenantId));
  if (!t) notFound();
  const [doctors, members, chambers, specialties, stats] = await Promise.all([
    ownerDb.select().from(s.doctorProfile).where(eq(s.doctorProfile.tenantId, tenantId)),
    ownerDb
      .select({ userId: s.appUser.id, name: s.appUser.name, email: s.appUser.email, role: s.membership.role, lastLoginAt: s.appUser.lastLoginAt })
      .from(s.membership)
      .innerJoin(s.appUser, eq(s.appUser.id, s.membership.userId))
      .where(eq(s.membership.tenantId, tenantId)),
    ownerDb.select().from(s.chamber).where(eq(s.chamber.tenantId, tenantId)),
    ownerDb.select().from(s.specialty),
    ownerDb.execute(sql`select (select count(*)::int from patient where tenant_id = ${tenantId}) patients,
                               (select count(*)::int from prescription where tenant_id = ${tenantId} and status = 'final') rx`),
  ]);
  const st = (stats as unknown as { patients: number; rx: number }[])[0]!;
  const [payments, sms] = await Promise.all([
    ownerDb.select().from(s.subscriptionPayment).where(eq(s.subscriptionPayment.tenantId, tenantId)).orderBy(desc(s.subscriptionPayment.createdAt)).limit(20),
    ownerDb.select().from(s.smsLog).where(eq(s.smsLog.tenantId, tenantId)).orderBy(desc(s.smsLog.createdAt)).limit(10),
  ]);
  return (
    <>
      <PageHeader
        title={t.name}
        subtitle={`${t.kind} · status ${t.status} · ${st.patients} patients · ${st.rx} final prescriptions`}
        actions={
          <form action={setTenantStatus} className="flex gap-2">
            <input type="hidden" name="tenantId" value={t.id} />
            {t.status !== "active" && <button name="status" value="active" className="btn-primary">Activate</button>}
            {t.status !== "suspended" && <button name="status" value="suspended" className="btn-danger">Suspend</button>}
          </form>
        }
      />
      {doctors.map((d) => (
        <section key={d.userId} className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">{d.nameEn}</h2>
            {d.bmdcVerifiedAt ? (
              <span className="badge bg-green-50 text-green-700">BMDC verified {d.bmdcVerifiedAt.toLocaleDateString("en-GB")}</span>
            ) : (
              <span className="badge bg-amber-50 text-amber-800">BMDC not verified</span>
            )}
            <form action={verifyBmdc}>
              <input type="hidden" name="userId" value={d.userId} />
              <button name="verified" value={d.bmdcVerifiedAt ? "0" : "1"} className="btn-secondary text-xs">
                {d.bmdcVerifiedAt ? "Revoke verification" : "Mark BMDC & degrees verified"}
              </button>
            </form>
            <a className="text-xs text-brand-700 underline" href={`https://www.bmdc.org.bd/search-doctor?search=${encodeURIComponent(d.bmdcNumber)}`} target="_blank" rel="noreferrer">Look up on BMDC site</a>
          </div>
          <ProfileForm
            specialties={specialties.map((x) => ({ code: x.code, name: x.name }))}
            p={{
              userId: d.userId,
              nameEn: d.nameEn,
              nameBn: d.nameBn ?? "",
              degreesEn: d.degreesEn.join(", "),
              degreesBn: d.degreesBn.join(", "),
              designation: d.designation ?? "",
              institution: d.institution ?? "",
              specialtyCode: d.specialtyCode,
              specialtyLabel: d.specialtyLabel ?? "",
              bmdcNumber: d.bmdcNumber,
              bmdcExpiry: d.bmdcExpiry ?? "",
            }}
          />
        </section>
      ))}
      <h2 className="mb-2 font-semibold">Members</h2>
      <div className="card mb-3 overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Password</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>{m.name}</td><td>{m.email}</td><td>{m.role}</td>
                <td className="text-xs">{m.lastLoginAt?.toLocaleString("en-GB") ?? "never"}</td>
                <td><ResetPasswordForm userId={m.userId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddMemberForm tenantId={t.id} />
      <h2 className="mb-2 mt-6 font-semibold">Subscription</h2>
      <div className="card space-y-3 p-4 text-sm">
        <p>Plan <b>{t.plan}</b> · {t.planExpiresAt ? <>paid until <b>{t.planExpiresAt}</b></> : "no paid period"} · SMS credit <b>{t.smsCredits}</b></p>
        <RecordPaymentForm tenantId={t.id} />
        <form action={addSmsCredits} className="flex items-end gap-2">
          <input type="hidden" name="tenantId" value={t.id} />
          <div><label className="label">Add SMS credits</label><input name="credits" className="input w-28" inputMode="numeric" placeholder="500" /></div>
          <button className="btn-secondary">Top up</button>
        </form>
        <table className="table">
          <thead><tr><th>Date</th><th>Plan</th><th>Months</th><th>Amount</th><th>Method</th><th>Ref</th><th>Status</th></tr></thead>
          <tbody>{payments.map((p) => <tr key={p.id}><td className="text-xs">{p.createdAt.toLocaleDateString("en-GB")}</td><td>{p.plan}</td><td>{p.months}</td><td>৳{p.amount}</td><td>{p.method}</td><td className="text-xs">{p.gatewayRef}</td><td>{p.status}</td></tr>)}</tbody>
        </table>
        {sms.length > 0 && (
          <details><summary className="cursor-pointer text-brand-700">Recent SMS ({sms.length})</summary>
            <ul className="mt-1 text-xs">{sms.map((m) => <li key={m.id}>{m.createdAt.toLocaleString("en-GB")} · {m.toNumber} · {m.status}{m.error ? ` (${m.error})` : ""} · {m.body}</li>)}</ul>
          </details>
        )}
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Chambers</h2>
      <ul className="card divide-y divide-slate-100 text-sm">
        {chambers.map((c) => <li key={c.id} className="p-3"><b>{c.name}</b> — {c.address} {c.hours && `· ${c.hours}`}</li>)}
      </ul>
    </>
  );
}
