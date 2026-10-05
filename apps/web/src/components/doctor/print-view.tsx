"use client";

import { paperDimensions } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { buildPrintHtml, type PrintBundle } from "@/lib/doctor/print";
import { Link } from "@/lib/doctor/router";
import { ShareButtons } from "./share";

export function PrintView({ prescriptionId }: { prescriptionId: string }) {
  const db = usePowerSync();
  const session = useSession();
  const [bundle, setBundle] = useState<PrintBundle | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // Re-render when the prescription, chamber settings or profile change (e.g. patient code arrives after sync).
  const { data: watch } = useQuery<{ k: string }>(
    `SELECT rx.updated_at || coalesce(rx.verify_token, '') || coalesce(p.code, '') || coalesce(c.updated_at, '') || coalesce((SELECT max(updated_at) FROM chamber), '') AS k
       FROM prescription rx JOIN patient p ON p.id = rx.patient_id LEFT JOIN chamber c ON c.id = rx.chamber_id WHERE rx.id = ?`,
    [prescriptionId],
  );
  const { data: meta } = useQuery<{ encounter_id: string; patient_id: string; mobile: string | null; name: string }>(
    "SELECT rx.encounter_id, rx.patient_id, p.mobile, p.name FROM prescription rx JOIN patient p ON p.id = rx.patient_id WHERE rx.id = ?",
    [prescriptionId],
  );

  useEffect(() => {
    buildPrintHtml(db, prescriptionId, { publicBaseUrl: session.publicBaseUrl }).then(setBundle);
  }, [db, prescriptionId, session.publicBaseUrl, watch[0]?.k]);

  async function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    await w.document.fonts.ready;
    w.focus();
    w.print();
  }

  if (!bundle) return <div className="text-sm text-slate-500">Preparing print…</div>;
  const { widthMm, heightMm } = paperDimensions(bundle.settings.paper);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {meta[0] && <Link to={`/visit/${meta[0].encounter_id}`} className="btn-ghost">← Back to visit</Link>}
        <button className="btn-primary" onClick={print} data-testid="print">Print</button>
        <a className="btn-secondary" href={`/api/print/${prescriptionId}/pdf`} target="_blank" rel="noreferrer">Download PDF (online)</a>
        {bundle.status === "final" && <a className="btn-ghost text-xs" href={`/api/fhir/prescription/${prescriptionId}`} title="FHIR R4 bundle (DGHS Core IG aligned)">FHIR</a>}
        {bundle.status === "final" && meta[0] && bundle.verifyUrl && <ShareButtons mobile={meta[0].mobile} patientName={meta[0].name} verifyUrl={bundle.verifyUrl} prescriptionId={prescriptionId} />}
        <span className="text-xs text-slate-500">
          {bundle.settings.mode === "pad" ? "Pre-printed pad" : "Full letterhead"} · {typeof bundle.settings.paper === "string" ? bundle.settings.paper : `${widthMm}×${heightMm} mm`}
          {bundle.status !== "final" && " · DRAFT"}
        </span>
        <Link to="/settings" className="ml-auto text-xs text-brand-700 underline">Print settings & pad calibration</Link>
      </div>
      <div className="overflow-auto rounded bg-slate-200 p-4">
        <iframe
          ref={frame}
          title="Prescription preview"
          srcDoc={bundle.html}
          // No scripts in the preview; same-origin so we can await fonts and call print().
          sandbox="allow-same-origin allow-modals"
          className="mx-auto block bg-white shadow"
          style={{ width: `${widthMm + 16}mm`, height: `${heightMm + 20}mm`, border: 0 }}
          data-testid="print-frame"
        />
      </div>
    </div>
  );
}
