"use client";

import { DEFAULT_PRINT_SETTINGS, defaultSectionLabel, SECTION_KEYS, SKETCH_IDS, SKETCHES, type PrintSettings, type SectionKey, type SketchId } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useState } from "react";
import { printSettingsOf, savePrintSettings, saveSignature } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useMyProfile } from "@/lib/doctor/hooks";
import { BillingPanel } from "./billing";
import { ChamberManager } from "./chambers";

/** Printable alignment sheet: a 10 mm grid with a cross at the body origin, to compare against the pad. */
function calibrationHtml(s: PrintSettings): string {
  const w = typeof s.paper === "object" ? s.paper.widthMm : { A4: 210, A5: 148, Letter: 216 }[s.paper];
  const h = typeof s.paper === "object" ? s.paper.heightMm : { A4: 297, A5: 210, Letter: 279 }[s.paper];
  const top = s.marginTopMm + (s.mode === "pad" ? s.padHeaderMm : 0) + s.offsetYmm;
  const left = s.marginLeftMm + s.offsetXmm;
  let lines = "";
  for (let x = 0; x <= w; x += 10) lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#bbb" stroke-width="0.2"/><text x="${x + 0.5}" y="4" font-size="2.5">${x}</text>`;
  for (let y = 0; y <= h; y += 10) lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#bbb" stroke-width="0.2"/><text x="0.5" y="${y - 0.5}" font-size="2.5">${y}</text>`;
  return `<!doctype html><html><head><style>@page{size:${w}mm ${h}mm;margin:0}body{margin:0}</style></head><body>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${lines}
  <rect x="${left}" y="${top}" width="${w - left - s.marginRightMm + s.offsetXmm}" height="${h - top - s.marginBottomMm - (s.mode === "pad" ? s.padFooterMm : 0) + s.offsetYmm}" fill="none" stroke="#0f6f67" stroke-width="0.6" stroke-dasharray="2 1"/>
  <line x1="${left - 5}" y1="${top}" x2="${left + 5}" y2="${top}" stroke="red" stroke-width="0.4"/><line x1="${left}" y1="${top - 5}" x2="${left}" y2="${top + 5}" stroke="red" stroke-width="0.4"/>
  <text x="${left + 2}" y="${top + 6}" font-size="3" fill="red">Body starts here (x ${left} mm, y ${top} mm)</text></svg></body></html>`;
}

export function SettingsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const { chambers, current, select } = useChambers();
  const [s, setS] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const { data: prof } = useQuery<{ name_en: string; bmdc_number: string; bmdc_verified_at: string | null; bmdc_expiry: string | null; degrees_en: string | null }>(
    "SELECT name_en, bmdc_number, bmdc_verified_at, bmdc_expiry, degrees_en FROM doctor_profile WHERE id = ?",
    [session.userId],
  );

  // The picture options only matter to doctors whose exam template has those pictures (ENT).
  const { data: tpls } = useQuery<{ schema: string }>("SELECT schema FROM specialty_template WHERE specialty_code = ?", [profile?.specialty_code ?? ""]);
  const hasTm = tpls.some((t) => t.schema.includes('"eardrum"'));
  const sketchesInTemplate = SKETCH_IDS.filter((id) => tpls.some((t) => new RegExp(`"sketch"\\s*:\\s*"${id}"`).test(t.schema)));
  const toggleSketch = (id: SketchId, on: boolean) => set("sketchesAlways", on ? [...s.sketchesAlways.filter((x) => x !== id), id] : s.sketchesAlways.filter((x) => x !== id));

  useEffect(() => {
    if (current) setS(printSettingsOf(current.print_settings));
  }, [current?.id, current?.print_settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PrintSettings>(k: K, v: PrintSettings[K]) => {
    setSaved(false);
    setS((p) => ({ ...p, [k]: v }));
  };
  const num = (k: keyof PrintSettings, label: string, step = 0.5) => (
    <label className="text-sm">
      <span className="label">{label}</span>
      <input type="number" step={step} className="input" value={s[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />
    </label>
  );

  async function save() {
    if (!current) return;
    await savePrintSettings(db, current.id, s);
    setSaved(true);
  }

  function testPrint() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(calibrationHtml(s));
    w.document.close();
    w.focus();
    w.print();
  }

  async function onSignature(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return alert("Please use an image under 200 KB (a cropped PNG of your signature).");
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    await saveSignature(db, session.userId, dataUrl);
  }

  const p = prof[0];
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Settings</h1>
      {p && (
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Profile (printed on header)</h2>
          <p>{p.name_en} · BMDC {p.bmdc_number} · {p.bmdc_verified_at ? <span className="text-green-700">verified</span> : <span className="text-amber-700">verification pending</span>}{p.bmdc_expiry && ` · valid to ${p.bmdc_expiry}`}</p>
          <p className="text-slate-500">Name, degrees and BMDC number are verified by RxPad admin. Ask support to change them.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="label mb-0">Signature image</span>
            {profile?.signature_data_url && <img src={profile.signature_data_url} alt="Signature" className="h-10 border border-slate-200 bg-white" />}
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => onSignature(e.target.files?.[0])} className="text-xs" />
            {profile?.signature_data_url && <button className="btn-ghost text-xs" onClick={() => saveSignature(db, session.userId, null)}>Remove</button>}
          </div>
        </section>
      )}
      <BillingPanel />
      <ChamberManager />
      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Print layout</h2>
          {chambers.length > 1 && (
            <select className="input w-auto" value={current?.id ?? ""} onChange={(e) => select(e.target.value)}>
              {chambers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {current && chambers.length === 1 && <span className="text-sm text-slate-500">{current.name}</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm"><span className="label">Mode</span>
            <select className="input" value={s.mode} onChange={(e) => set("mode", e.target.value as PrintSettings["mode"])}>
              <option value="letterhead">Full letterhead (plain paper)</option><option value="pad">Pre-printed pad (body only)</option>
            </select>
          </label>
          <label className="text-sm"><span className="label">Paper</span>
            <select className="input" value={typeof s.paper === "string" ? s.paper : "custom"} onChange={(e) => set("paper", e.target.value === "custom" ? { widthMm: 150, heightMm: 230 } : (e.target.value as "A4"))}>
              <option>A4</option><option>A5</option><option>Letter</option><option value="custom">Custom size</option>
            </select>
          </label>
          {typeof s.paper === "object" && (
            <>
              <label className="text-sm"><span className="label">Width mm</span><input type="number" className="input" value={s.paper.widthMm} onChange={(e) => set("paper", { ...(s.paper as { widthMm: number; heightMm: number }), widthMm: Number(e.target.value) })} /></label>
              <label className="text-sm"><span className="label">Height mm</span><input type="number" className="input" value={s.paper.heightMm} onChange={(e) => set("paper", { ...(s.paper as { widthMm: number; heightMm: number }), heightMm: Number(e.target.value) })} /></label>
            </>
          )}
          {num("fontSizePt", "Font size (pt)", 0.5)}
          {num("leftColumnPct", "Left column width %", 1)}
          {s.mode === "pad" && num("padHeaderMm", "Pad header height (mm)")}
          {s.mode === "pad" && num("padFooterMm", "Pad footer height (mm)")}
          {num("marginTopMm", "Margin top")}
          {num("marginBottomMm", "Margin bottom")}
          {num("marginLeftMm", "Margin left")}
          {num("marginRightMm", "Margin right")}
          {num("offsetXmm", "Printer offset X (→ +)")}
          {num("offsetYmm", "Printer offset Y (↓ +)")}
          <label className="text-sm"><span className="label">Medicine names</span>
            <select className="input" value={s.drugNameCase} onChange={(e) => set("drugNameCase", e.target.value as PrintSettings["drugNameCase"])}>
              <option value="upper">CAPITALS (court order 2017)</option><option value="as_is">As typed</option>
            </select>
          </label>
          <label className="text-sm"><span className="label">Show generic</span>
            <select className="input" value={s.genericDisplay} onChange={(e) => set("genericDisplay", e.target.value as PrintSettings["genericDisplay"])}>
              <option value="brand_generic">Brand (Generic)</option><option value="brand">Brand only</option><option value="generic">Generic only</option>
            </select>
          </label>
          <label className="text-sm"><span className="label">Instructions</span>
            <select className="input" value={s.instructionLang} onChange={(e) => set("instructionLang", e.target.value as PrintSettings["instructionLang"])}>
              <option value="bn">বাংলা</option><option value="en">English</option>
            </select>
          </label>
          <label className="text-sm"><span className="label">Numerals</span>
            <select className="input" value={s.numerals} onChange={(e) => set("numerals", e.target.value as PrintSettings["numerals"])}>
              <option value="bn">বাংলা ১২৩</option><option value="en">English 123</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.showQr} onChange={(e) => set("showQr", e.target.checked)} /> QR verification code</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.showBarcode} onChange={(e) => set("showBarcode", e.target.checked)} data-testid="show-barcode" /> Patient ID barcode</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.chambersInHeader} onChange={(e) => set("chambersInHeader", e.target.checked)} /> List all chambers under the header</label>
          {hasTm && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.tmMapAlways} onChange={(e) => set("tmMapAlways", e.target.checked)} data-testid="tm-map-always" /> Always print the TM map (blank drums when nothing is marked)</label>
          )}
          {sketchesInTemplate.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.sketchesAlways.includes(id)} onChange={(e) => toggleSketch(id, e.target.checked)} data-testid={`sketch-always-${id}`} />
              Always print the {SKETCHES[id].title.toLowerCase()} picture
            </label>
          ))}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Section headings</h3>
          <p className="mb-2 text-xs text-slate-500">Rename a heading (e.g. Dx → Δ, Ix → Investigations) or untick it to keep that section off the print.</p>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {SECTION_KEYS.map((k: SectionKey) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!s.hiddenSections.includes(k)} aria-label={`Print ${defaultSectionLabel(k, s.instructionLang)}`}
                  onChange={(e) => set("hiddenSections", e.target.checked ? s.hiddenSections.filter((x) => x !== k) : [...s.hiddenSections, k])} />
                <input className="input" value={s.sectionLabels[k] ?? ""} placeholder={defaultSectionLabel(k, s.instructionLang)} data-testid={`section-label-${k}`}
                  onChange={(e) => set("sectionLabels", { ...s.sectionLabels, [k]: e.target.value || undefined })} />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={save} data-testid="save-print">Save</button>
          <button className="btn-secondary" onClick={testPrint}>Print alignment test sheet</button>
          {saved && <span className="text-sm text-green-700">Saved</span>}
        </div>
        <p className="text-xs text-slate-500">
          Pad calibration: print the test sheet on a blank page, hold it over your pad against a light, and adjust
          “Pad header height” until the red cross sits just below the pad’s printed header. If everything is shifted, use the printer offsets.
        </p>
      </section>
    </div>
  );
}
