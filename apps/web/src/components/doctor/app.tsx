"use client";

import { useStatus } from "@powersync/react";
import { useHashRoute } from "@/lib/doctor/router";
import { CLINIC_SYNC_PRIORITY, clinicDataReady, downloadPercent } from "@/lib/powersync/sync-ready";
import { BookingsScreen } from "./bookings";
import { DisplayScreen } from "./display";
import { InvestigationsScreen } from "./investigations";
import { LabScreen } from "./lab";
import { LabSettingsScreen } from "./lab-settings";
import { MedicinesScreen } from "./medicines";
import { PatientDetail } from "./patient-detail";
import { PatientEdit } from "./patient-form";
import { PatientList } from "./patient-list";
import { PrintView } from "./print-view";
import { SettingsScreen } from "./settings";
import { TemplatesScreen } from "./templates";
import { Today } from "./today";
import { VisitScreen } from "./visit";

export function DoctorApp() {
  const r = useHashRoute();
  const status = useStatus();
  // Open once patients/visits are in (priority 1); ~22k medicines keep downloading at priority 3.
  if (!clinicDataReady(status)) {
    const clinicPct = status.downloadProgress?.untilPriority(CLINIC_SYNC_PRIORITY).downloadedFraction;
    const pct = clinicPct != null ? Math.round(clinicPct * 100) : downloadPercent(status);
    return (
      <div className="card p-8 text-center text-sm text-slate-600" data-testid="first-sync">
        <p>Loading your patients and today&apos;s queue…</p>
        <p className="mt-2 text-xs text-slate-500">Medicine catalogue downloads in the background after this.</p>
        {pct != null && (
          <div className="mx-auto mt-4 max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 tabular-nums text-xs text-slate-500">{pct}%</p>
          </div>
        )}
      </div>
    );
  }
  switch (r[0]) {
    case undefined:
      return <Today />;
    case "patients":
      if (r[1] === "new") return <PatientEdit />;
      if (r[1] && r[2] === "edit") return <PatientEdit patientId={r[1]} />;
      if (r[1]) return <PatientDetail patientId={r[1]} />;
      return <PatientList />;
    case "visit":
      return r[1] ? <VisitScreen encounterId={r[1]} tab={r[2] === "reports" ? "reports" : "rx"} /> : null;
    case "rx":
      return r[1] ? <PrintView prescriptionId={r[1]} /> : null;
    case "bookings":
      return <BookingsScreen />;
    case "display":
      return <DisplayScreen />;
    case "lab":
      return <LabScreen route={r} />;
    case "investigations":
      return <InvestigationsScreen />;
    case "medicines":
      return <MedicinesScreen />;
    case "templates":
      return <TemplatesScreen />;
    case "settings":
      return r[1] === "lab" ? <LabSettingsScreen /> : <SettingsScreen />;
    default:
      return <div className="text-sm text-slate-500">Not found.</div>;
  }
}
