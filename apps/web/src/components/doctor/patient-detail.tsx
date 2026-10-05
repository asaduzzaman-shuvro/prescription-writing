"use client";

import type { PrescriptionDoc } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, parseJson } from "@/lib/doctor/util";

export function PatientDetail({ patientId }: { patientId: string }) {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const { data: pts } = useQuery<Record<string, string | null>>("SELECT * FROM patient WHERE id = ?", [patientId]);
  const { data: visits } = useQuery<{ id: string; visit_date: string; status: string; doctor: string | null; rx_id: string | null; rx_status: string | null; doc: string | null; version: number | null }>(
    `SELECT e.id, e.visit_date, e.status, d.name_en AS doctor, rx.id AS rx_id, rx.status AS rx_status, rx.doc, rx.version
       FROM encounter e
       LEFT JOIN doctor_profile d ON d.id = e.doctor_user_id
       LEFT JOIN prescription rx ON rx.id = (SELECT id FROM prescription WHERE encounter_id = e.id ORDER BY version DESC LIMIT 1)
      WHERE e.patient_id = ? ORDER BY e.visit_date DESC, e.created_at DESC`,
    [patientId],
  );
  const p = pts[0];
  if (!p) return <div className="text-sm text-slate-500">Loading patient…</div>;
  const allergies = parseJson<string[]>(p.allergies, []);
  const isDoctor = session.tenantRole === "doctor";

  async function visit() {
    const doctorId = isDoctor ? session.userId : doctors[0]?.id;
    if (!doctorId) return;
    const id = await startVisit(db, {
      tenantId: session.tenantId, userId: session.userId, patientId, doctorUserId: doctorId, chamberId: chamber?.id ?? null,
      specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general", asDoctor: isDoctor,
    });
    navigate(`/visit/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <p className="text-sm text-slate-500">
            {p.code ?? "ID pending sync"} · {ageLabel(p.dob)} {p.sex} · {p.mobile} {p.address && `· ${p.address}`}
          </p>
          {allergies.length > 0 && <p className="mt-1 text-sm font-medium text-red-700">⚠ Allergies: {allergies.join(", ")}</p>}
          {p.guardian_name && <p className="text-sm text-slate-500">Guardian: {p.guardian_name}</p>}
        </div>
        <div className="flex gap-2">
          <Link to={`/patients/${patientId}/edit`} className="btn-secondary">Edit</Link>
          <button className="btn-primary" onClick={visit}>{isDoctor ? "Start visit" : "Add to queue"}</button>
        </div>
      </div>
      <h2 className="font-semibold">Visit history</h2>
      <div className="card divide-y divide-slate-100">
        {visits.map((v) => {
          const doc = parseJson<PrescriptionDoc | null>(v.doc, null);
          return (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <b>{v.visit_date}</b> <span className="text-slate-500">· {v.doctor}</span>
                {v.rx_status && <span className={`badge ml-2 ${v.rx_status === "final" ? "bg-green-50 text-green-700" : "bg-slate-100"}`}>{v.rx_status}{(v.version ?? 1) > 1 ? ` v${v.version}` : ""}</span>}
                {doc && (
                  <div className="text-slate-600">
                    {doc.diagnoses.join(", ") || doc.chiefComplaints.join(", ")}
                    {doc.items.length > 0 && <span className="text-slate-400"> — {doc.items.map((i) => i.brandName).join(", ")}</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Link to={`/visit/${v.id}`} className="btn-ghost text-xs">Open</Link>
                {v.rx_id && <Link to={`/rx/${v.rx_id}/print`} className="btn-secondary text-xs">Print</Link>}
              </div>
            </div>
          );
        })}
        {!visits.length && <p className="p-3 text-sm text-slate-500">No visits yet.</p>}
      </div>
    </div>
  );
}
