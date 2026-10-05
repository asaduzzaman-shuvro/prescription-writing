import { followUpDate, type PrescriptionDoc } from "@rx/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ownerDb } from "@/lib/db";
import { sendTenantSms } from "@/lib/sms-send";

export const runtime = "nodejs";

/**
 * Daily job (e.g. 10:00 Asia/Dhaka from cron / a scheduler):
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" https://host/api/cron/followup-reminders
 * Sends one Bangla SMS reminder for every final prescription whose follow-up is tomorrow.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const rows = (await ownerDb.execute(sql`
    select rx.id, rx.tenant_id, rx.doc, (rx.finalized_at at time zone 'Asia/Dhaka')::date::text as fin, p.name, p.mobile, d.name_bn, d.name_en, c.name as chamber
      from prescription rx
      join patient p on p.id = rx.patient_id
      join doctor_profile d on d.user_id = rx.doctor_user_id
      left join chamber c on c.id = rx.chamber_id
     where rx.status = 'final' and p.mobile is not null
       and rx.doc->'followUp'->>'kind' in ('after', 'date')
       and rx.finalized_at > now() - interval '400 days'
       and not exists (select 1 from prescription n where n.supersedes_id = rx.id)
       and not exists (select 1 from sms_log l where l.prescription_id = rx.id and l.body like 'রিমাইন্ডার%')`)) as unknown as {
    id: string; tenant_id: string; doc: PrescriptionDoc; fin: string; name: string; mobile: string; name_bn: string | null; name_en: string; chamber: string | null;
  }[];
  let sent = 0, failed = 0;
  for (const r of rows) {
    if (followUpDate(r.doc.followUp, r.fin) !== tomorrow) continue;
    const res = await sendTenantSms({
      tenantId: r.tenant_id, userId: null, to: r.mobile, prescriptionId: r.id,
      body: `রিমাইন্ডার: আগামীকাল ${r.name_bn ?? r.name_en} এর সাথে আপনার ফলো-আপ${r.chamber ? ` (${r.chamber})` : ""}। পুরাতন প্রেসক্রিপশন সাথে আনবেন।`,
    });
    if (res.ok) sent++;
    else failed++;
  }
  return NextResponse.json({ checked: rows.length, sent, failed, date: tomorrow });
}
