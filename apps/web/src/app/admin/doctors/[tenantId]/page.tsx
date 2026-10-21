import { s } from "@rx/db";
import { desc, eq, sql } from "drizzle-orm";
import { Building2, ChevronLeft, FileText, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { ownerDb } from "@/lib/db";
import { AccountStatusSelect, type TenantAccountStatus } from "../account-status";
import { addSmsCredits } from "../actions";
import { VerifyBmdcBar } from "../verify-bmdc";
import { RecordPaymentForm } from "./billing";
import { AddMemberForm, ProfileForm, ResetPasswordForm } from "./forms";

export const metadata = { title: "Chamber" };

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{children}</h2>;
}

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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full min-w-0 space-y-4">
      <Link href="/admin/doctors" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Doctors & chambers
      </Link>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-800">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{t.name}</h1>
              <p className="text-xs text-slate-500 capitalize">{t.kind} chamber</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {st.patients} patients
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {st.rx} final Rx
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">Plan {t.plan}</span>
          </div>
        </div>
        <AccountStatusSelect tenantId={t.id} status={t.status as TenantAccountStatus} />
      </div>

      {doctors.map((d) => {
        const expired = d.bmdcExpiry && d.bmdcExpiry < today;
        return (
          <section key={d.userId} className="card overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-semibold text-slate-900">{d.nameEn}</span>
                    <span className="text-sm text-slate-500">({d.specialtyCode})</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-600">
                    {d.bmdcNumber}
                    {d.bmdcExpiry && (
                      <span className={expired ? "text-red-600" : "text-slate-500"}>
                        {" "}
                        ({expired ? `Expired ${d.bmdcExpiry}` : `Valid to ${d.bmdcExpiry}`})
                      </span>
                    )}
                  </p>
                </div>
                <VerifyBmdcBar
                  userId={d.userId}
                  nameEn={d.nameEn}
                  bmdcNumber={d.bmdcNumber}
                  verifiedAt={d.bmdcVerifiedAt ? d.bmdcVerifiedAt.toISOString() : null}
                />
              </div>
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
        );
      })}

      <section>
        <SectionTitle>Team members</SectionTitle>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last login</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td className="font-medium text-slate-800">{m.name}</td>
                    <td className="text-sm text-slate-600">{m.email}</td>
                    <td><span className="badge bg-slate-100 text-slate-700 capitalize">{m.role.replaceAll("_", " ")}</span></td>
                    <td className="text-xs text-slate-500">{m.lastLoginAt?.toLocaleString("en-GB") ?? "Never"}</td>
                    <td><ResetPasswordForm userId={m.userId} /></td>
                  </tr>
                ))}
                {!members.length && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-500">No members yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/40 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Add member</p>
            <AddMemberForm tenantId={t.id} />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Subscription & billing</SectionTitle>
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <p>
              <span className="text-slate-500">Paid until</span>{" "}
              <span className="font-medium text-slate-900">{t.planExpiresAt ?? "—"}</span>
            </p>
            <p>
              <span className="text-slate-500">SMS credit</span>{" "}
              <span className="font-medium tabular-nums text-slate-900">{t.smsCredits}</span>
            </p>
          </div>
          <RecordPaymentForm tenantId={t.id} />
          <form action={addSmsCredits} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="tenantId" value={t.id} />
            <div>
              <label className="label">Add SMS credits</label>
              <input name="credits" className="input w-28" inputMode="numeric" placeholder="500" />
            </div>
            <button className="btn-secondary">Top up</button>
          </form>
          {payments.length > 0 && (
            <div className="overflow-x-auto border-t border-slate-100 pt-3">
              <table className="table text-sm">
                <thead>
                  <tr><th>Date</th><th>Plan</th><th>Months</th><th>Amount</th><th>Method</th><th>Ref</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-xs text-slate-500">{p.createdAt.toLocaleDateString("en-GB")}</td>
                      <td className="capitalize">{p.plan}</td>
                      <td className="tabular-nums">{p.months}</td>
                      <td className="tabular-nums">৳{p.amount}</td>
                      <td className="capitalize">{p.method}</td>
                      <td className="max-w-[8rem] truncate text-xs">{p.gatewayRef}</td>
                      <td><span className="badge bg-slate-100 text-slate-700">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sms.length > 0 && (
            <details className="border-t border-slate-100 pt-2">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">Recent SMS ({sms.length})</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sms.map((m) => (
                  <li key={m.id} className="rounded-md bg-slate-50 px-2 py-1">
                    {m.createdAt.toLocaleString("en-GB")} · {m.toNumber} · {m.status}
                    {m.error ? ` (${m.error})` : ""} · {m.body}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Practice locations</SectionTitle>
        <ul className="card divide-y divide-slate-100">
          {chambers.map((c) => (
            <li key={c.id} className="flex gap-3 p-3 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">{c.name}</p>
                <p className="text-slate-600">{c.address}</p>
                {c.hours && <p className="text-xs text-slate-500">{c.hours}</p>}
              </div>
            </li>
          ))}
          {!chambers.length && <li className="p-4 text-center text-sm text-slate-500">No chambers listed.</li>}
        </ul>
      </section>
    </div>
  );
}
