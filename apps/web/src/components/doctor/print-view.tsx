"use client";

import { paperDimensions, prescriptionFileName } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSession } from "@/lib/doctor/context";
import { markVisitDone } from "@/lib/doctor/data";
import { buildPrintHtml, type PrintBundle } from "@/lib/doctor/print";
import { Link, navigate } from "@/lib/doctor/router";
import { resumeEditAfterPrint } from "@/lib/doctor/util";
import { ShareButtons } from "./share";

const MM = 96 / 25.4;

/** Shrink the A4 preview so a tablet shows the whole page, including the Bangla header. */
function PreviewFrame({
  frame,
  html,
  widthMm,
  heightMm,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  html: string;
  widthMm: number;
  heightMm: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const style = getComputedStyle(el);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const available = el.clientWidth - pad;
      const natural = widthMm * MM;
      setScale(natural > 0 && available > 0 ? Math.min(1, available / natural) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthMm]);

  const width = widthMm * MM * scale;
  const height = heightMm * MM * scale;

  return (
    <div ref={wrap} className="overflow-auto rounded bg-slate-200 p-2">
      <div className="mx-auto" style={{ width, height }}>
        <iframe
          ref={frame}
          title="Prescription preview"
          srcDoc={html}
          // No scripts in the preview; same-origin so we can await fonts and call print().
          sandbox="allow-same-origin allow-modals"
          className="block origin-top-left bg-white shadow"
          style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, border: 0, transform: `scale(${scale})` }}
          data-testid="print-frame"
        />
      </div>
    </div>
  );
}

export function PrintView({ prescriptionId }: { prescriptionId: string }) {
  const db = usePowerSync();
  const session = useSession();
  const [bundle, setBundle] = useState<PrintBundle | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // Re-render when the prescription, chamber settings or profile change (e.g. patient code arrives after sync).
  const { data: watch } = useQuery<{ k: string }>(
    `SELECT rx.updated_at || coalesce(rx.verify_token, '') || coalesce(p.code, '') || coalesce(c.updated_at, '') || coalesce((SELECT max(updated_at) FROM chamber), '')
            || coalesce((SELECT max(updated_at) FROM lab_report WHERE encounter_id = rx.encounter_id), '') AS k
       FROM prescription rx JOIN patient p ON p.id = rx.patient_id LEFT JOIN chamber c ON c.id = rx.chamber_id WHERE rx.id = ?`,
    [prescriptionId],
  );
  const { data: meta } = useQuery<{
    encounter_id: string;
    patient_id: string;
    mobile: string | null;
    name: string;
    code: string | null;
    visit_date: string | null;
  }>(
    `SELECT rx.encounter_id, rx.patient_id, p.mobile, p.name, p.code,
            coalesce(substr(rx.finalized_at, 1, 10), e.visit_date) AS visit_date
       FROM prescription rx
       JOIN patient p ON p.id = rx.patient_id
       LEFT JOIN encounter e ON e.id = rx.encounter_id
      WHERE rx.id = ?`,
    [prescriptionId],
  );

  useEffect(() => {
    buildPrintHtml(db, prescriptionId, { publicBaseUrl: session.publicBaseUrl }).then(setBundle);
  }, [db, prescriptionId, session.publicBaseUrl, watch[0]?.k]);

  /** After printing a finalised prescription, offer to go back to Today for the next patient. */
  async function askDone() {
    const encounterId = meta[0]?.encounter_id;
    if (bundle?.status !== "final" || !encounterId) return;
    if (!confirm("Done printing? Go to Today for the next patient.")) return;
    resumeEditAfterPrint.clear(encounterId); // a later View from the queue opens it locked, not as a new draft
    await markVisitDone(db, encounterId);
    navigate("/");
  }

  const [pdfNote, setPdfNote] = useState<string>();
  const [pdfBusy, setPdfBusy] = useState(false);

  async function fetchPdf(): Promise<{ blob: Blob; name: string } | null> {
    setPdfBusy(true);
    setPdfNote("Preparing PDF…");
    const res = await fetch(`/api/print/${prescriptionId}/pdf`).catch(() => null);
    if (!res?.ok) {
      const text = res ? (await res.text()).slice(0, 180) : "";
      setPdfNote(res?.status === 404 ? "Not on the server yet. Wait for Synced, then try again." : text || "You are offline, or the PDF could not be made.");
      setPdfBusy(false);
      return null;
    }
    const blob = await res.blob();
    setPdfBusy(false);
    setPdfNote(undefined);
    const row = meta[0];
    return {
      blob,
      name: prescriptionFileName({ name: row?.name ?? "", mobile: row?.mobile, id: row?.code, date: row?.visit_date }),
    };
  }

  async function downloadPdf() {
    const file = await fetchPdf();
    if (!file) return;
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    void askDone();
  }

  async function sharePdf() {
    const file = await fetchPdf();
    if (!file) return;
    const pdf = new File([file.blob], file.name, { type: "application/pdf" });
    const row = meta[0];
    const title = prescriptionFileName({ name: row?.name ?? "", mobile: row?.mobile, id: row?.code, date: row?.visit_date }).replace(/\.pdf$/, "");
    if (navigator.canShare?.({ files: [pdf] })) {
      try {
        await navigator.share({ files: [pdf], title });
        void askDone();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    setPdfNote("This browser cannot share a file. The PDF was downloaded instead.");
  }

  async function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    await w.document.fonts.ready;
    w.focus();
    // Fires once the dialog closes; the browser can't tell printed from cancelled, so the doctor decides.
    w.addEventListener("afterprint", () => void askDone(), { once: true });
    w.print();
  }

  if (!bundle) return <div className="text-sm text-slate-500">Preparing print…</div>;
  const { widthMm, heightMm } = paperDimensions(bundle.settings.paper);
  const frameMm = { w: widthMm + 16, h: heightMm + 20 };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {/* A printed prescription is never changed: going back opens the next version, ready to edit. */}
        {meta[0] && <Link to={`/visit/${meta[0].encounter_id}${bundle.status === "final" ? "?edit=1" : ""}`} className="btn-ghost">← Back to visit</Link>}
        <button className="btn-primary" onClick={print} data-testid="print">Print</button>
        <button className="btn-secondary" type="button" disabled={pdfBusy} onClick={() => void downloadPdf()} data-testid="download-pdf">
          {pdfBusy ? "Preparing…" : "Download PDF (online)"}
        </button>
        <button className="btn-secondary" type="button" disabled={pdfBusy} onClick={() => void sharePdf()} data-testid="share-pdf">
          Share
        </button>
        {bundle.status === "final" && <a className="btn-ghost text-xs" href={`/api/fhir/prescription/${prescriptionId}`} title="FHIR R4 bundle (DGHS Core IG aligned)">FHIR</a>}
        {bundle.status === "final" && meta[0] && bundle.verifyUrl && <ShareButtons mobile={meta[0].mobile} patientName={meta[0].name} verifyUrl={bundle.verifyUrl} prescriptionId={prescriptionId} />}
        {pdfNote && <span className="text-xs text-slate-500">{pdfNote}</span>}
        <span className="text-xs text-slate-500">
          {bundle.settings.mode === "pad" ? "Pre-printed pad" : "Full letterhead"} · {typeof bundle.settings.paper === "string" ? bundle.settings.paper : `${widthMm}×${heightMm} mm`}
          {bundle.status !== "final" && " · DRAFT"}
        </span>
        <Link to="/settings" className="ml-auto text-xs text-brand-700 underline">Print settings & pad calibration</Link>
      </div>
      <PreviewFrame frame={frame} html={bundle.html} widthMm={frameMm.w} heightMm={frameMm.h} />
    </div>
  );
}
