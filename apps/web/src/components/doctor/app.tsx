"use client";

import { useStatus } from "@powersync/react";
import { useHashRoute } from "@/lib/doctor/router";
import { BookingsScreen } from "./bookings";
import { DisplayScreen } from "./display";
import { PatientDetail } from "./patient-detail";
import { ReportsScreen } from "./reports";
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
  if (!status.hasSynced) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600" data-testid="first-sync">
        Preparing this device for offline use — downloading the medicine catalogue and your patients. This happens once.
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
      return r[1] ? <VisitScreen encounterId={r[1]} /> : null;
    case "rx":
      return r[1] ? <PrintView prescriptionId={r[1]} /> : null;
    case "bookings":
      return <BookingsScreen />;
    case "display":
      return <DisplayScreen />;
    case "reports":
      return <ReportsScreen />;
    case "templates":
      return <TemplatesScreen />;
    case "settings":
      return <SettingsScreen />;
    default:
      return <div className="text-sm text-slate-500">Not found.</div>;
  }
}
