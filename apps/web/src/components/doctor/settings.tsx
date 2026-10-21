"use client";

import { DEFAULT_PRINT_SETTINGS, defaultSectionLabel, SECTION_KEYS, SKETCH_IDS, SKETCHES, type PrintSettings, type SectionKey, type SketchId } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { ChevronRight, FlaskConical, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { printSettingsOf, savePrintSettings, saveSignature } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useMyProfile } from "@/lib/doctor/hooks";
import {
  bumpUiPref,
  DEFAULT_UI_PREFS,
  loadUiPrefs,
  saveUiPrefs,
  UI_PREF_MAX,
  UI_PREF_MIN,
  UI_PREF_STEP,
  type UiPrefs,
} from "@/lib/doctor/ui-prefs";
import { SaveButton } from "@/components/save-button";
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

function SettingsSection({
  title,
  description,
  children,
  testId,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-1.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-semibold text-slate-600">{title}</h3>
      {children}
    </div>
  );
}

const fieldGrid = "grid grid-cols-12 gap-1.5";
const cell3 = "col-span-12 sm:col-span-6 lg:col-span-3 min-w-0";
const checkGrid = "grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3";

function PrefStepper({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <span className="label">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="btn-secondary h-7 min-w-7 px-1.5 text-sm"
          aria-label={`Decrease ${label}`}
          disabled={value <= UI_PREF_MIN}
          onClick={() => onChange(bumpUiPref(value, -UI_PREF_STEP))}
        >
          −
        </button>
        <input
          type="number"
          className="input h-7 w-14 text-center tabular-nums text-sm"
          min={UI_PREF_MIN}
          max={UI_PREF_MAX}
          step={UI_PREF_STEP}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(bumpUiPref(Number(e.target.value), 0))}
        />
        <button
          type="button"
          className="btn-secondary h-7 min-w-7 px-1.5 text-sm"
          aria-label={`Increase ${label}`}
          disabled={value >= UI_PREF_MAX}
          onClick={() => onChange(bumpUiPref(value, UI_PREF_STEP))}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** On-device font / padding / gap — stored in localStorage, not synced. */
function DisplayPrefsPanel() {
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS);

  useEffect(() => {
    setPrefs(loadUiPrefs());
  }, []);

  function update(patch: Partial<UiPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveUiPrefs(next);
  }

  const changed = prefs.font !== 1 || prefs.padding !== 1 || prefs.gap !== 1;

  return (
    <SettingsSection
      title="Display"
      description={`This device only — step ${UI_PREF_STEP}, range ${UI_PREF_MIN}–${UI_PREF_MAX}. Does not affect print.`}
      testId="display-prefs"
    >
      <div className={`${fieldGrid} text-sm`}>
        <div className={cell3}><PrefStepper label="Font size" testId="ui-pref-font" value={prefs.font} onChange={(font) => update({ font })} /></div>
        <div className={cell3}><PrefStepper label="Padding" testId="ui-pref-padding" value={prefs.padding} onChange={(padding) => update({ padding })} /></div>
        <div className={cell3}><PrefStepper label="Gap" testId="ui-pref-gap" value={prefs.gap} onChange={(gap) => update({ gap })} /></div>
      </div>
      {changed && (
        <button type="button" className="btn-ghost mt-1.5 h-7 px-2 text-xs" data-testid="ui-pref-reset" onClick={() => update(DEFAULT_UI_PREFS)}>
          Reset to default
        </button>
      )}
    </SettingsSection>
  );
}

function MfaPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/mfa")
      .then((r) => r.json())
      .then((j) => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setBusy(true);
    setMsg(undefined);
    try {
      const j = await fetch("/api/auth/mfa?setup=1").then((r) => r.json());
      if (j.enabled) setEnabled(true);
      else if (j.secret) setSetup({ secret: j.secret, qrDataUrl: j.qrDataUrl });
      else setMsg(j.error ?? "Could not start MFA setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(action: "enable" | "disable") {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? "Failed");
        return;
      }
      setEnabled(!!j.enabled);
      setSetup(null);
      setCode("");
      setMsg(j.enabled ? "Authenticator enabled." : "Authenticator disabled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="Two-factor authentication" description="TOTP app (Google Authenticator, Authy, etc.)" testId="mfa-settings">
      {enabled === null && <span className="block h-4 w-32 animate-pulse rounded bg-slate-200" />}
      {enabled === true && (
        <div className="space-y-1.5 text-sm">
          <span className="inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">Enabled</span>
          <div className="flex flex-wrap items-end gap-1.5">
            <label className="text-sm">
              <span className="label">Code to disable</span>
              <input className="input h-8 w-28" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
            </label>
            <button type="button" className="btn-secondary h-8 text-xs" disabled={busy || code.length < 6} onClick={() => confirm("disable")}>
              Disable
            </button>
          </div>
        </div>
      )}
      {enabled === false && !setup && (
        <button type="button" className="btn-secondary h-8 text-xs" disabled={busy} onClick={startSetup}>
          Set up authenticator
        </button>
      )}
      {enabled === false && setup && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <img src={setup.qrDataUrl} alt="MFA QR code" className="h-32 w-32 shrink-0 rounded border border-slate-200" />
          <div className="min-w-0 space-y-1.5 text-sm">
            <p className="text-[11px] text-slate-500">
              Manual secret: <code className="rounded bg-slate-100 px-1 text-[10px]">{setup.secret}</code>
            </p>
            <div className="flex flex-wrap items-end gap-1.5">
              <label>
                <span className="label">6-digit code</span>
                <input className="input h-8 w-28" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} data-testid="mfa-enable-code" />
              </label>
              <button type="button" className="btn-primary h-8 text-xs" disabled={busy || code.length < 6} onClick={() => confirm("enable")} data-testid="mfa-enable">
                Enable MFA
              </button>
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-1.5 text-xs text-slate-600">{msg}</p>}
    </SettingsSection>
  );
}

/** Number box that can be cleared. A controlled `value={0}` snaps back as soon as the field is emptied. */
function NumberField({ label, value, step, onChange }: { label: string; value: number; step?: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="text-sm">
      <span className="label">{label}</span>
      <input
        type="number"
        step={step}
        className="input h-8 text-sm"
        value={draft ?? (Number.isFinite(value) ? value : "")}
        onFocus={() => setDraft(Number.isFinite(value) ? String(value) : "")}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() !== "" && Number.isFinite(Number(raw))) onChange(Number(raw));
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

export function SettingsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const profile = useMyProfile();
  const { chambers, current, select } = useChambers();
  const [s, setS] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
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
    <NumberField label={label} value={s[k] as number} step={step} onChange={(n) => set(k, n as never)} />
  );

  async function save() {
    if (!current || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await savePrintSettings(db, current.id, s);
      setSaved(true);
    } finally {
      setSaving(false);
    }
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
  const chamberSelect =
    chambers.length > 1 ? (
      <select className="input h-8 w-auto max-w-xs text-sm" value={current?.id ?? ""} onChange={(e) => select(e.target.value)} aria-label="Chamber for print settings">
        {chambers.map((c) => (
          <option key={c.id} value={c.id}>{c.name.replace(/\s*\n\s*/g, " ")}</option>
        ))}
      </select>
    ) : current ? (
      <span className="text-[11px] text-slate-500">{current.name.replace(/\s*\n\s*/g, " ")}</span>
    ) : null;

  return (
    <div className="space-y-1.5 pb-1 [&_.input]:h-8 [&_.input]:text-sm [&_section.card]:rounded-lg [&_section.card]:border [&_section.card]:border-slate-200 [&_section.card]:bg-white [&_section.card]:p-2.5 [&_section.card]:shadow-sm [&_section.card_h2]:text-xs [&_section.card_h2]:font-semibold [&_section.card_h2]:text-slate-900">
      <header className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100" aria-hidden>
          <Settings className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900">Settings</h1>
          <p className="text-[11px] text-slate-500">Display, practice, security, and prescription print layout</p>
        </div>
      </header>

      <div className="grid gap-1.5 xl:grid-cols-2">
        <DisplayPrefsPanel />
        <MfaPanel />
      </div>

      {p && (
        <SettingsSection title="Doctor profile" description="Printed on the prescription header. Name and BMDC are managed by RxPad admin.">
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-slate-900">
              {p.name_en}
              {p.degrees_en ? <span className="font-normal text-slate-600"> · {p.degrees_en}</span> : null}
            </p>
            <p className="text-xs text-slate-600">
              BMDC {p.bmdc_number} ·{" "}
              {p.bmdc_verified_at ? <span className="text-emerald-700">verified</span> : <span className="text-amber-700">pending</span>}
              {p.bmdc_expiry ? ` · valid to ${p.bmdc_expiry}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-1.5">
              <span className="label mb-0">Signature</span>
              {profile?.signature_data_url && <img src={profile.signature_data_url} alt="Signature" className="h-9 rounded border border-slate-200 bg-white px-1" />}
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => onSignature(e.target.files?.[0])} className="max-w-[11rem] text-[11px]" />
              {profile?.signature_data_url && (
                <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => saveSignature(db, session.userId, null)}>Remove</button>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      <ChamberManager />
      <BillingPanel />

      <a
        href="#/settings/lab"
        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/30"
        data-testid="settings-lab"
      >
        <div className="flex min-w-0 items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <div>
            <h2 className="text-xs font-semibold text-slate-900">Lab reports</h2>
            <p className="text-[11px] text-slate-500">Report header, signatories, test catalogue and ranges</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </a>

      <SettingsSection
        title="Print layout"
        description="Per chamber — margins, pad calibration, and what appears on the prescription."
        action={chamberSelect}
      >
        <div className="space-y-3">
          <SubBlock title="Paper & mode">
            <div className={fieldGrid}>
              <label className={`${cell3} text-sm`}>
                <span className="label">Mode</span>
                <select className="input" value={s.mode} onChange={(e) => set("mode", e.target.value as PrintSettings["mode"])}>
                  <option value="letterhead">Full letterhead</option>
                  <option value="pad">Pre-printed pad</option>
                </select>
              </label>
              <label className={`${cell3} text-sm`}>
                <span className="label">Paper</span>
                <select className="input" value={typeof s.paper === "string" ? s.paper : "custom"} onChange={(e) => set("paper", e.target.value === "custom" ? { widthMm: 150, heightMm: 230 } : (e.target.value as "A4"))}>
                  <option>A4</option><option>A5</option><option>Letter</option><option value="custom">Custom</option>
                </select>
              </label>
              {typeof s.paper === "object" && (
                <>
                  <div className={cell3}><NumberField label="Width (mm)" value={s.paper.widthMm} onChange={(widthMm) => set("paper", { ...(s.paper as { widthMm: number; heightMm: number }), widthMm })} /></div>
                  <div className={cell3}><NumberField label="Height (mm)" value={s.paper.heightMm} onChange={(heightMm) => set("paper", { ...(s.paper as { widthMm: number; heightMm: number }), heightMm })} /></div>
                </>
              )}
              <div className={cell3}>{num("fontSizePt", "Font (pt)", 0.5)}</div>
              <div className={cell3}>{num("leftColumnPct", "Left column %", 1)}</div>
            </div>
          </SubBlock>

          <SubBlock title="Margins & calibration">
            <div className={fieldGrid}>
              {s.mode === "pad" && <div className={cell3}>{num("padHeaderMm", "Pad header (mm)")}</div>}
              {s.mode === "pad" && <div className={cell3}>{num("padFooterMm", "Pad footer (mm)")}</div>}
              <div className={cell3}>{num("marginTopMm", "Margin top")}</div>
              <div className={cell3}>{num("marginBottomMm", "Margin bottom")}</div>
              <div className={cell3}>{num("marginLeftMm", "Margin left")}</div>
              <div className={cell3}>{num("marginRightMm", "Margin right")}</div>
              <div className={cell3}>{num("offsetXmm", "Offset X (→)")}</div>
              <div className={cell3}>{num("offsetYmm", "Offset Y (↓)")}</div>
            </div>
          </SubBlock>

          <SubBlock title="Prescription content">
            <div className={`${fieldGrid} mb-1.5`}>
              <label className={`${cell3} text-sm`}>
                <span className="label">Medicine names</span>
                <select className="input" value={s.drugNameCase} onChange={(e) => set("drugNameCase", e.target.value as PrintSettings["drugNameCase"])}>
                  <option value="upper">CAPITALS</option><option value="as_is">As typed</option>
                </select>
              </label>
              <label className={`${cell3} text-sm`}>
                <span className="label">Generic line</span>
                <select className="input" value={s.genericDisplay} onChange={(e) => set("genericDisplay", e.target.value as PrintSettings["genericDisplay"])}>
                  <option value="brand_generic">Brand (Generic)</option><option value="brand">Brand only</option><option value="generic">Generic only</option>
                </select>
              </label>
              <label className={`${cell3} text-sm`}>
                <span className="label">Instructions</span>
                <select className="input" value={s.instructionLang} onChange={(e) => set("instructionLang", e.target.value as PrintSettings["instructionLang"])}>
                  <option value="bn">বাংলা</option><option value="en">English</option>
                </select>
              </label>
              <label className={`${cell3} text-sm`}>
                <span className="label">Numerals</span>
                <select className="input" value={s.numerals} onChange={(e) => set("numerals", e.target.value as PrintSettings["numerals"])}>
                  <option value="bn">বাংলা ১২৩</option><option value="en">English 123</option>
                </select>
              </label>
            </div>
            <div className={checkGrid}>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.showQr} onChange={(e) => set("showQr", e.target.checked)} /> QR code</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.showSchedule} onChange={(e) => set("showSchedule", e.target.checked)} data-testid="show-schedule" /> Visiting schedule</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.showSerialPhone} onChange={(e) => set("showSerialPhone", e.target.checked)} data-testid="show-serial-phone" /> Serial phone</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.showChamberPhone} onChange={(e) => set("showChamberPhone", e.target.checked)} data-testid="show-chamber-phone" /> Chamber phone</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.showBarcode} onChange={(e) => set("showBarcode", e.target.checked)} data-testid="show-barcode" /> Patient barcode</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={s.chambersInHeader} onChange={(e) => set("chambersInHeader", e.target.checked)} /> All chambers in header</label>
              {hasTm && (
                <label className="flex items-center gap-1.5 text-xs text-slate-700 sm:col-span-2"><input type="checkbox" checked={s.tmMapAlways} onChange={(e) => set("tmMapAlways", e.target.checked)} data-testid="tm-map-always" /> TM map always (blank drums OK)</label>
              )}
              {sketchesInTemplate.map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input type="checkbox" checked={s.sketchesAlways.includes(id)} onChange={(e) => toggleSketch(id, e.target.checked)} data-testid={`sketch-always-${id}`} />
                  Always print {SKETCHES[id].title.toLowerCase()}
                </label>
              ))}
            </div>
          </SubBlock>

          <SubBlock title="Section headings">
            <p className="mb-1 text-[10px] text-slate-500">Untick to hide on print; edit label to rename.</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SECTION_KEYS.map((k: SectionKey) => (
                <label key={k} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" className="shrink-0" checked={!s.hiddenSections.includes(k)} aria-label={`Print ${defaultSectionLabel(k, s.instructionLang)}`}
                    onChange={(e) => set("hiddenSections", e.target.checked ? s.hiddenSections.filter((x) => x !== k) : [...s.hiddenSections, k])} />
                  <input className="input h-7 min-w-0 flex-1 py-0 text-xs" value={s.sectionLabels[k] ?? ""} placeholder={defaultSectionLabel(k, s.instructionLang)} data-testid={`section-label-${k}`}
                    onChange={(e) => set("sectionLabels", { ...s.sectionLabels, [k]: e.target.value || undefined })} />
                </label>
              ))}
            </div>
          </SubBlock>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
            <SaveButton type="button" className="btn-primary h-8 text-xs" saving={saving} onClick={save} data-testid="save-print">Save print settings</SaveButton>
            <button type="button" className="btn-secondary h-8 text-xs" onClick={testPrint}>Alignment test sheet</button>
            {saved && <span className="text-xs font-medium text-emerald-700">Saved</span>}
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            Pad: print the test sheet, align the red cross under your pad header, then adjust pad header height. Use offsets if the whole page shifts.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
