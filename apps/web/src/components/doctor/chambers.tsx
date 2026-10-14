"use client";

import { formatSlot, freeReportPolicyText, WEEKDAYS, type ChamberSlot, type Weekday } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { saveChamber, setChamberActive, type ChamberInput } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import type { ChamberRow } from "@/lib/doctor/hooks";
import { parseJson } from "@/lib/doctor/util";
import { SaveButton } from "@/components/save-button";

const DAY_LABEL: Record<Weekday, string> = { sat: "শনি", sun: "রবি", mon: "সোম", tue: "মঙ্গল", wed: "বুধ", thu: "বৃহঃ", fri: "শুক্র" };
const SLOT_LABELS = ["রোগী দেখার সময়", "অপারেশন", "সিরিয়াল দেওয়ার সময়"];

const blank = (): ChamberInput => ({ name: "", address: "", phone: "", serialPhone: "", schedule: [], footerText: "", logoDataUrl: null, freeReportDays: null });

function inputOf(c: ChamberRow): ChamberInput {
  return {
    name: c.name, address: c.address, phone: c.phone ?? "", serialPhone: c.serial_phone ?? "",
    schedule: parseJson<ChamberSlot[]>(c.schedule, []), footerText: c.footer_text ?? "", logoDataUrl: c.logo_data_url,
    freeReportDays: c.free_report_days,
  };
}

function SlotEditor({ slot, onChange, onRemove }: { slot: ChamberSlot; onChange: (s: ChamberSlot) => void; onRemove: () => void }) {
  const toggle = (d: Weekday) => onChange({ ...slot, days: slot.days.includes(d) ? slot.days.filter((x) => x !== d) : [...slot.days, d] });
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-1">
        <input className="input w-48" list="chamber-slot-labels" placeholder="রোগী দেখার সময়" value={slot.label ?? ""}
          onChange={(e) => onChange({ ...slot, label: e.target.value || undefined })} aria-label="Slot label" />
        {WEEKDAYS.map((d) => (
          <button key={d} type="button" aria-pressed={slot.days.includes(d)} onClick={() => toggle(d)}
            className={`rounded px-2 py-1 text-xs ${slot.days.includes(d) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
            {DAY_LABEL[d]}
          </button>
        ))}
        <input type="time" className="input w-28" value={slot.from ?? ""} onChange={(e) => onChange({ ...slot, from: e.target.value || undefined })} aria-label="From" />
        <span className="text-slate-400">–</span>
        <input type="time" className="input w-28" value={slot.to ?? ""} onChange={(e) => onChange({ ...slot, to: e.target.value || undefined })} aria-label="To" />
        <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={onRemove} aria-label="Remove slot">×</button>
      </div>
      <p className="text-xs text-slate-500">{formatSlot(slot, "bn", "bn") || "Pick days and times"}</p>
    </div>
  );
}

function ChamberForm({ initial, legacyHours, onSave, onCancel }: { initial: ChamberInput; legacyHours?: string | null; onSave: (c: ChamberInput) => Promise<void>; onCancel: () => void }) {
  const [c, setC] = useState<ChamberInput>(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ChamberInput>(k: K, v: ChamberInput[K]) => setC((p) => ({ ...p, [k]: v }));

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return setError("Please use a logo image under 200 KB.");
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    set("logoDataUrl", dataUrl);
  }

  async function save() {
    if (saving) return;
    if (!c.name.trim() || !c.address.trim()) return setError("Name and address are required.");
    setError(undefined);
    setSaving(true);
    try {
      await onSave({ ...c, schedule: c.schedule.filter((s) => s.days.length || s.from || s.to || s.label) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <datalist id="chamber-slot-labels">{SLOT_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-sm"><span className="label">Chamber / hospital name *</span>
          <textarea className="input" rows={3} value={c.name} onChange={(e) => set("name", e.target.value)} data-testid="chamber-name" /></label>
        <label className="text-sm"><span className="label">Address *</span>
          <textarea className="input" rows={3} value={c.address} onChange={(e) => set("address", e.target.value)} data-testid="chamber-address" /></label>
        <label className="text-sm"><span className="label">Phone</span>
          <input className="input" inputMode="tel" value={c.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="text-sm"><span className="label">Serial phone</span>
          <input className="input" inputMode="tel" value={c.serialPhone} onChange={(e) => set("serialPhone", e.target.value)} data-testid="chamber-serial" /></label>
      </div>
      <div className="space-y-1">
        <span className="label">Schedule</span>
        {legacyHours && !c.schedule.length && <p className="text-xs text-slate-500">Currently printed as: “{legacyHours}”. Add a schedule to replace it.</p>}
        {c.schedule.map((sl, i) => (
          <SlotEditor key={i} slot={sl} onChange={(n) => set("schedule", c.schedule.map((x, j) => (j === i ? n : x)))} onRemove={() => set("schedule", c.schedule.filter((_, j) => j !== i))} />
        ))}
        <button type="button" className="btn-ghost text-xs" onClick={() => set("schedule", [...c.schedule, { days: [] }])} data-testid="chamber-add-slot">+ Add days / times</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm"><span className="label">Free report showing within (working days)</span>
          <input className="input w-24" inputMode="numeric" value={c.freeReportDays ?? ""} data-testid="chamber-free-days"
            onChange={(e) => set("freeReportDays", e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null)} /></label>
        {!!c.freeReportDays && (
          <button type="button" className="btn-ghost text-xs" onClick={() => set("footerText", freeReportPolicyText(c.freeReportDays!, "bn", "bn"))}>
            Use as footer note
          </button>
        )}
      </div>
      <label className="block text-sm"><span className="label">Footer note (printed at the bottom of the letterhead)</span>
        <textarea className="input" rows={2} value={c.footerText} onChange={(e) => set("footerText", e.target.value)} data-testid="chamber-footer"
          placeholder="পরামর্শের ৫ কর্মদিবসের মধ্যে রিপোর্ট দেখাতে সিরিয়াল বা ভিজিট লাগবে না।" /></label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Logo</span>
        {c.logoDataUrl && <img src={c.logoDataUrl} alt="Logo" className="h-10 border border-slate-200 bg-white" />}
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => onLogo(e.target.files?.[0])} className="text-xs" />
        {c.logoDataUrl && <button type="button" className="btn-ghost text-xs" onClick={() => set("logoDataUrl", null)}>Remove</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-1.5">
        <SaveButton type="button" className="btn-primary" saving={saving} onClick={save} data-testid="chamber-save">Save chamber</SaveButton>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Add and edit the doctor's chambers: address, visiting schedule, serial phone, footer note and logo. */
export function ChamberManager() {
  const db = usePowerSync();
  const session = useSession();
  const { data: rows } = useQuery<ChamberRow>("SELECT * FROM chamber ORDER BY COALESCE(is_active, 1) DESC, name");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  // A clinic admin's new chamber is shared (no doctor); the server stamps a doctor's own id.
  const doctorUserId = session.tenantRole === "doctor" ? session.userId : null;

  return (
    <section className="card space-y-2 p-2.5">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Chambers</h2>
        {editing === null && <button className="btn-secondary ml-auto text-sm" onClick={() => setEditing("new")} data-testid="chamber-new">+ Add chamber</button>}
      </div>
      {editing === "new" && (
        <ChamberForm initial={blank()} onCancel={() => setEditing(null)}
          onSave={async (c) => { await saveChamber(db, { tenantId: session.tenantId, doctorUserId }, c); setEditing(null); }} />
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const active = r.is_active !== 0;
          return (
            <li key={r.id} className={`rounded border border-slate-200 p-2 text-sm ${active ? "" : "opacity-60"}`} data-testid="chamber-row">
              {editing === r.id ? (
                <ChamberForm initial={inputOf(r)} legacyHours={r.hours} onCancel={() => setEditing(null)}
                  onSave={async (c) => { await saveChamber(db, { tenantId: session.tenantId, doctorUserId, id: r.id }, c); setEditing(null); }} />
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1">
                    <div className="font-medium whitespace-pre-line">{r.name}{!active && " (inactive)"}</div>
                    <div className="whitespace-pre-line text-slate-600">{r.address}</div>
                    {parseJson<ChamberSlot[]>(r.schedule, []).map((sl, i) => <div key={i} className="text-slate-500">{formatSlot(sl, "bn", "bn")}</div>)}
                    {!parseJson<ChamberSlot[]>(r.schedule, []).length && r.hours && <div className="text-slate-500">{r.hours}</div>}
                    {r.serial_phone && <div className="text-slate-500">সিরিয়াল: {r.serial_phone}</div>}
                  </div>
                  {editing === null && (
                    <span className="flex gap-1">
                      <button className="btn-ghost text-xs" onClick={() => setEditing(r.id)}>Edit</button>
                      <button className="btn-ghost text-xs" onClick={() => setChamberActive(db, r.id, !active)}>{active ? "Deactivate" : "Activate"}</button>
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
