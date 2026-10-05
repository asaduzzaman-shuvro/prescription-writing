"use client";

import { useQuery } from "@powersync/react";
import { useEffect, useState } from "react";
import { today } from "@/lib/doctor/util";

/** Only the first name is shown on the waiting-room screen. */
const firstName = (n: string) => n.split(/\s+/).find((w) => !/^(md\.?|mohammad|mst\.?|mrs?\.?|dr\.?)$/i.test(w)) ?? n.split(/\s+/)[0];

/** Waiting-room TV: open on a screen in the chamber (signed in as the assistant) and press F11. */
export function DisplayScreen() {
  const date = today();
  const { data: now } = useQuery<{ serial_no: number; name: string; doctor: string | null }>(
    `SELECT e.serial_no, p.name, d.name_en AS doctor FROM encounter e JOIN patient p ON p.id = e.patient_id LEFT JOIN doctor_profile d ON d.id = e.doctor_user_id
      WHERE e.visit_date = ? AND e.status = 'in_progress' ORDER BY e.updated_at DESC`,
    [date],
  );
  const { data: next } = useQuery<{ serial_no: number; name: string }>(
    `SELECT serial_no, name FROM (
       SELECT e.serial_no, p.name FROM encounter e JOIN patient p ON p.id = e.patient_id WHERE e.visit_date = ? AND e.status = 'waiting'
       UNION ALL
       SELECT a.serial_no, a.name FROM appointment a WHERE a.appt_date = ? AND a.status = 'booked'
     ) ORDER BY serial_no LIMIT 6`,
    [date, date],
  );
  const [clock, setClock] = useState("");
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 p-8 text-white" data-testid="display">
      <div className="flex justify-between text-2xl text-slate-300"><span>সিরিয়াল</span><span>{clock}</span></div>
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="text-3xl text-slate-300">এখন দেখছেন · Now serving</div>
        <div className="text-[12rem] font-bold leading-none tabular-nums text-emerald-400" data-testid="now-serving">{now[0]?.serial_no ?? "—"}</div>
        <div className="text-4xl">{now[0] ? firstName(now[0].name) : ""}</div>
      </div>
      <div>
        <div className="mb-2 text-2xl text-slate-300">পরবর্তী · Next</div>
        <div className="flex flex-wrap gap-4">
          {next.map((n) => (
            <div key={`${n.serial_no}${n.name}`} className="rounded-lg bg-slate-800 px-6 py-3 text-3xl"><b className="tabular-nums">{n.serial_no}</b> <span className="text-slate-300">{firstName(n.name)}</span></div>
          ))}
        </div>
      </div>
      <a href="#/" className="absolute right-4 top-4 text-xs text-slate-600">exit</a>
    </div>
  );
}
