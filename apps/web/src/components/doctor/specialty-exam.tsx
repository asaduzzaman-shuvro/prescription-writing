"use client";

import {
  AUDIO_FREQS,
  airBoneGap,
  audiogramSvg,
  EARDRUM_ZONES,
  eardrumZonePath,
  flattenFindings,
  hearingGrade,
  ptaAverage,
  type AudiogramEar,
  type AudiogramValue,
  type EardrumValue,
  type EardrumZone,
  type ExamFindingLine,
  type Findings,
  type LateralValue,
  type Side2,
  type SpecialtyTemplateSchema,
  type TemplateField,
} from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { saveExamFindings } from "@/lib/doctor/data";
import { parseJson } from "@/lib/doctor/util";

type Flatten = (groups: { title: string; lines: ExamFindingLine[] }[], diagrams: { title: string; svg: string }[]) => void;

// ---------------------------------------------------------------------------
// Field widgets
// ---------------------------------------------------------------------------

function SelectField({ f, value, onChange, disabled }: { f: TemplateField; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  if (f.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {f.options!.map((o) => {
          const on = arr.includes(o);
          return (
            <button key={o} type="button" disabled={disabled}
              onClick={() => onChange(on ? arr.filter((x) => x !== o) : o === f.normal ? [o] : [...arr.filter((x) => x !== f.normal), o])}
              className={`rounded border px-2 py-0.5 text-xs ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === "text") return <input className="input" disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)} />;
  if (f.type === "number") return <input className="input w-24" inputMode="decimal" disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  return (
    <select className="input" disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)} aria-label={f.label}>
      <option value="">—</option>
      {f.options!.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

function EardrumField({ value, onChange, disabled }: { value: LateralValue<EardrumValue> | undefined; onChange: (v: LateralValue<EardrumValue>) => void; disabled: boolean }) {
  const [mode, setMode] = useState<"perforation" | "retraction">("perforation");
  const toggle = (side: Side2, zone: EardrumZone) => {
    const cur = value?.[side] ?? { perforation: [], retraction: [] };
    const list = cur[mode].includes(zone) ? cur[mode].filter((z) => z !== zone) : [...cur[mode], zone];
    const other = mode === "perforation" ? "retraction" : "perforation";
    onChange({ ...value, [side]: { ...cur, [mode]: list, [other]: cur[other].filter((z) => z !== zone) } });
  };
  return (
    <div>
      <div className="mb-1 flex gap-1 text-xs">
        {(["perforation", "retraction"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? "bg-slate-800 text-white" : "bg-slate-100"}`}>Mark {m}</button>
        ))}
        <span className="text-slate-400">Tap quadrants: attic, AS, AI, PS, PI</span>
      </div>
      <div className="flex gap-4">
        {(["right", "left"] as const).map((side) => {
          const v = value?.[side] ?? { perforation: [], retraction: [] };
          return (
            <svg key={side} viewBox="0 0 100 108" className="h-32 w-32" data-testid={`eardrum-${side}`}>
              <defs><pattern id={`h-${side}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#333" strokeWidth="1" /></pattern></defs>
              <g transform={side === "left" ? "translate(100,0) scale(-1,1)" : undefined}>
                <circle cx="50" cy="50" r="38" fill="#fff" stroke="#111" strokeWidth="1.5" />
                {EARDRUM_ZONES.map((z) => (
                  <path key={z} d={eardrumZonePath(z)} data-zone={z} stroke="#666" strokeWidth="0.8" className={disabled ? "" : "cursor-pointer hover:opacity-70"}
                    fill={v.perforation.includes(z) ? "#111" : v.retraction.includes(z) ? `url(#h-${side})` : "#f8fafc"}
                    onClick={() => !disabled && toggle(side, z)} />
                ))}
                <line x1="50" y1="26" x2="54" y2="56" stroke="#111" strokeWidth="2" pointerEvents="none" />
              </g>
              <text x="50" y="106" fontSize="9" textAnchor="middle">{side === "right" ? "Right" : "Left"}</text>
            </svg>
          );
        })}
      </div>
    </div>
  );
}

function AudiogramField({ value, onChange, disabled }: { value: AudiogramValue | undefined; onChange: (v: AudiogramValue) => void; disabled: boolean }) {
  const set = (side: Side2, kind: "ac" | "bc", f: (typeof AUDIO_FREQS)[number], raw: string) => {
    const ear: AudiogramEar = value?.[side] ?? { ac: {}, bc: {} };
    const n = raw === "" ? undefined : Math.max(-10, Math.min(120, Number(raw)));
    const next = { ...ear, [kind]: { ...ear[kind], [f]: Number.isFinite(n) ? n : undefined } };
    onChange({ ...value, [side]: next });
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
      <table className="text-xs">
        <thead><tr><th className="pr-2 text-left">dB HL</th>{AUDIO_FREQS.map((f) => <th key={f} className="px-0.5">{f >= 1000 ? `${f / 1000}k` : f}</th>)}</tr></thead>
        <tbody>
          {(["right", "left"] as const).flatMap((side) =>
            (["ac", "bc"] as const).map((kind) => {
              return (
                <tr key={side + kind}>
                  <td className={`pr-2 font-medium ${side === "right" ? "text-red-700" : "text-blue-700"}`}>{side === "right" ? "R" : "L"} {kind.toUpperCase()}</td>
                  {AUDIO_FREQS.map((f) => (
                    <td key={f} className="px-0.5">
                      <input className="input w-11 px-1 py-0.5 text-center text-xs" inputMode="numeric" disabled={disabled} value={value?.[side]?.[kind][f] ?? ""}
                        onChange={(e) => set(side, kind, f, e.target.value.replace(/[^\d-]/g, ""))} aria-label={`${side} ${kind} ${f}`} />
                    </td>
                  ))}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
      </div>
      <ul className="text-xs text-slate-700">
        {(["right", "left"] as const).map((side) => {
          const pta = ptaAverage(value?.[side]);
          const gap = airBoneGap(value?.[side]);
          return pta === null ? null : (
            <li key={side}><b className={side === "right" ? "text-red-700" : "text-blue-700"}>{side === "right" ? "Right" : "Left"}</b> PTA {pta} dB ({hearingGrade(pta)}){gap !== null && gap > 10 ? ` · A-B gap ${gap} dB` : ""}</li>
          );
        })}
      </ul>
      <div className="w-56" dangerouslySetInnerHTML={{ __html: audiogramSvg(value) }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template form
// ---------------------------------------------------------------------------

export function SpecialtyExam({ encounterId, specialtyCode, readOnly, onFlatten }: { encounterId: string; specialtyCode: string; readOnly: boolean; onFlatten: Flatten }) {
  const db = usePowerSync();
  const { data: tpls } = useQuery<{ id: string; name: string; schema: string }>(
    "SELECT id, name, schema FROM specialty_template WHERE specialty_code = ? ORDER BY version DESC LIMIT 1",
    [specialtyCode],
  );
  const { data: encs } = useQuery<{ exam_findings: string | null }>("SELECT exam_findings FROM encounter WHERE id = ?", [encounterId]);
  const tpl = tpls[0];
  const schema = tpl ? parseJson<SpecialtyTemplateSchema | null>(tpl.schema, null) : null;
  const [findings, setFindings] = useState<Findings | null>(null);
  // The first section starts open (Ear for ENT, Vision for eyes).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastFlat = useRef("");
  const pending = useRef<Findings | null>(null);
  const tplId = tpls[0]?.id ?? null;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) void saveExamFindings(db, encounterId, pending.current, tplId);
    },
    [db, encounterId, tplId],
  );

  useEffect(() => {
    if (findings === null && encs[0]) setFindings(parseJson<Findings>(encs[0].exam_findings, {}));
  }, [encs, findings]);

  if (!schema || findings === null) return null;

  function update(id: string, v: unknown) {
    const next = { ...findings, [id]: v };
    setFindings(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      void saveExamFindings(db, encounterId, next, tpl!.id);
      const flat = flattenFindings(schema!, next);
      const key = JSON.stringify(flat);
      if (key !== lastFlat.current) {
        lastFlat.current = key;
        onFlatten(flat.groups, flat.diagrams);
      }
    }, 400);
  }

  const filled = (sid: string) => schema.sections.find((s) => s.id === sid)!.fields.filter((f) => findings[f.id] !== undefined).length;

  return (
    <section className="space-y-2" data-testid="specialty-exam">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tpl!.name}</h3>
      {schema.sections.map((s, si) => (
        <div key={s.id} className="rounded-md border border-slate-200">
          <button type="button" className="flex w-full items-center justify-between px-2 py-1.5 text-sm font-medium" onClick={() => setOpen((o) => ({ ...o, [s.id]: !(o[s.id] ?? si === 0) }))}>
            <span>{s.title} {filled(s.id) > 0 && <span className="badge ml-1 bg-brand-50 text-brand-700">{filled(s.id)}</span>}</span>
            <span className="text-slate-400">{(open[s.id] ?? si === 0) ? "−" : "+"}</span>
          </button>
          {(open[s.id] ?? si === 0) && (
            <div className="space-y-2 border-t border-slate-100 p-2">
              {s.fields.map((f) => (
                <div key={f.id} className="grid items-start gap-1 sm:grid-cols-[8rem_1fr]">
                  <span className="pt-1.5 text-xs text-slate-600">{f.label}</span>
                  {f.type === "eardrum" ? (
                    <EardrumField value={findings[f.id] as LateralValue<EardrumValue>} onChange={(v) => update(f.id, v)} disabled={readOnly} />
                  ) : f.type === "audiogram" ? (
                    <AudiogramField value={findings[f.id] as AudiogramValue} onChange={(v) => update(f.id, v)} disabled={readOnly} />
                  ) : f.lateral ? (
                    <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-1">
                      {(["right", "left"] as const).map((side) => (
                        <div key={side} className="flex items-start gap-1">
                          <span className={`pt-1.5 text-xs font-semibold ${side === "right" ? "text-red-700" : "text-blue-700"}`}>{side === "right" ? (schema.lateralLabels?.right ?? "R") : (schema.lateralLabels?.left ?? "L")}</span>
                          <div className="flex-1">
                            <SelectField f={f} value={(findings[f.id] as LateralValue<unknown>)?.[side]} disabled={readOnly}
                              onChange={(v) => update(f.id, { ...(findings[f.id] as object), [side]: v })} />
                          </div>
                        </div>
                      ))}
                      {!readOnly && (
                        <button type="button" title="Copy right to left" className="btn-ghost px-1 text-xs"
                          onClick={() => update(f.id, { ...(findings[f.id] as object), left: (findings[f.id] as LateralValue<unknown>)?.right })}>R→L</button>
                      )}
                    </div>
                  ) : (
                    <SelectField f={f} value={findings[f.id]} onChange={(v) => update(f.id, v)} disabled={readOnly} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
