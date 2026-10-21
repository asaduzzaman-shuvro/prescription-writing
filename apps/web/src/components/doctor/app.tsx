"use client";

import dynamic from "next/dynamic";
import { useStatus } from "@powersync/react";
import { useEffect } from "react";
import { DetailPageLoading, FormPageLoading, ListPageLoading, PrescriptionLoading } from "@/components/loading-states";
import { useSession } from "@/lib/doctor/context";
import { navigate, useHashRoute } from "@/lib/doctor/router";
import { useCustomSync } from "@/lib/powersync/custom-sync";
import { CLINIC_SYNC_PRIORITY, clinicDataReady, downloadPercent } from "@/lib/powersync/sync-ready";

const list = () => <ListPageLoading />;
const form = () => <FormPageLoading />;
const detail = () => <DetailPageLoading />;
const rx = () => <PrescriptionLoading />;

// Each screen is its own chunk. The first paint only needs this file, not the visit or lab editors.
const Today = dynamic(() => import("./today").then((m) => m.Today), { loading: list });
const PatientDetail = dynamic(() => import("./patient-detail").then((m) => m.PatientDetail), { loading: detail });
const PatientEdit = dynamic(() => import("./patient-form").then((m) => m.PatientEdit), { loading: form });
const PatientList = dynamic(() => import("./patient-list").then((m) => m.PatientList), { loading: list });
const VisitScreen = dynamic(() => import("./visit").then((m) => m.VisitScreen), { loading: rx });
const PrintView = dynamic(() => import("./print-view").then((m) => m.PrintView), { loading: rx });
const BookingsScreen = dynamic(() => import("./bookings").then((m) => m.BookingsScreen), { loading: list });
const DisplayScreen = dynamic(() => import("./display").then((m) => m.DisplayScreen), { loading: list });
const InvestigationsScreen = dynamic(() => import("./investigations").then((m) => m.InvestigationsScreen), { loading: list });
const LabScreen = dynamic(() => import("./lab").then((m) => m.LabScreen), { loading: list });
const LabSettingsScreen = dynamic(() => import("./lab-settings").then((m) => m.LabSettingsScreen), { loading: form });
const MedicinesScreen = dynamic(() => import("./medicines").then((m) => m.MedicinesScreen), { loading: list });
const SettingsScreen = dynamic(() => import("./settings").then((m) => m.SettingsScreen), { loading: form });
const TemplatesScreen = dynamic(() => import("./templates").then((m) => m.TemplatesScreen), { loading: list });
const SakuraDashboard = dynamic(() => import("./sakura-dashboard").then((m) => m.SakuraDashboard), { loading: list });

export function DoctorApp() {
  const r = useHashRoute();
  const session = useSession();
  const status = useStatus();
  const custom = useCustomSync();

  useEffect(() => {
    if (r[0] === "sakura-web" && !session.sakuraWebEnabled) navigate("/");
  }, [r, session.sakuraWebEnabled]);

  // Open once patients/visits are in (priority 1); ~22k medicines keep downloading at priority 3.
  if (!clinicDataReady(status) && !custom.clinicReady) {
    const clinicPct = status.downloadProgress?.untilPriority(CLINIC_SYNC_PRIORITY).downloadedFraction;
    const pct = clinicPct != null ? Math.round(clinicPct * 100) : downloadPercent(status);
    return (
      <div data-testid="first-sync" className="space-y-3">
        <ListPageLoading label="Loading today's queue" />
        <p className="text-center text-xs text-slate-500">Medicine catalogue downloads in the background after this.</p>
        {custom.error && <p className="text-center text-xs text-red-600">{custom.error}</p>}
        {pct != null && (
          <div className="mx-auto max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-center text-xs text-slate-500 tabular-nums">{pct}%</p>
          </div>
        )}
      </div>
    );
  }
  switch (r[0]) {
    case undefined:
      return <Today />;
    case "sakura-web":
      return session.sakuraWebEnabled ? <SakuraDashboard /> : null;
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
