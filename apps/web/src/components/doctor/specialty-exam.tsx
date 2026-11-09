"use client";

import { saveExamFindings } from "@/lib/doctor/data";
import { parseJson } from "@/lib/doctor/util";
import { usePowerSync, useQuery } from "@powersync/react";
import {
  airBoneGap,
  AUDIO_FREQS,
  audiogramSvg,
  EARDRUM_DEFS,
  EARDRUM_LIMITS,
  EARDRUM_MARK_LABEL,
  EARDRUM_MARKS,
  EARDRUM_ZONES,
  eardrumLegendSvg,
  eardrumOverlaySvg,
  eardrumUsed,
  eardrumZonePath,
  flattenFindings,
  hearingGrade,
  normalizeEardrum,
  perforationBlocked,
  pruneSubFields,
  ptaAverage,
  resetTmMap,
  syncSketchMaps,
  subFieldShown,
  syncTmMap,
  TM_LINK,
  TM_RESET_KEYS,
  type AudiogramEar,
  type AudiogramValue,
  type Diagram,
  type EardrumMarkKind,
  type EardrumValue,
  type EardrumZone,
  type ExamFindingLine,
  type Findings,
  type LateralValue,
  type Side2,
  type SketchValue,
  type SpecialtyTemplateSchema,
  type TemplateField,
  type TemplateSection,
  withSubFieldParents,
} from "@rx/core";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SketchField } from "./sketch-field";

type Flatten = (
  groups: { title: string; lines: ExamFindingLine[] }[],
  diagrams: Diagram[],
) => void;

// ---------------------------------------------------------------------------
// Field widgets
// ---------------------------------------------------------------------------

function SelectField({
  f,
  value,
  onChange,
  disabled,
}: {
  f: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  if (f.type === "multiselect") {
    // A field that was a single select before keeps its saved answer as a one-item list.
    const arr = Array.isArray(value) ? (value as string[]) : typeof value === "string" && value ? [value] : [];
    return (
      <div className="flex flex-wrap gap-1">
        {f.options!.map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  on
                    ? arr.filter((x) => x !== o)
                    : o === f.normal
                      ? [o]
                      : [...arr.filter((x) => x !== f.normal), o],
                )
              }
              className={`rounded border px-2 py-0.5 text-xs ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  // A free-writing box, for doctors who would rather write the findings than pick them.
  if (f.type === "text" && f.multiline)
    return (
      <textarea
        className="input"
        rows={2}
        disabled={disabled}
        placeholder="Write the findings…"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-label={f.label}
        data-testid={`exam-${f.id}`}
      />
    );
  if (f.type === "text")
    return (
      <input
        className="input"
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  if (f.type === "number")
    return (
      <input
        className="input w-24"
        inputMode="decimal"
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    );
  return (
    <select
      className="input"
      disabled={disabled}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label={f.label}
    >
      <option value="">—</option>
      {f.options!.map((o) => (
        <option key={o}>{o}</option>
      ))}
      {/* An answer whose option has since been renamed or merged (e.g. an old "Central") still shows. */}
      {typeof value === "string" && value && !f.options!.includes(value) && <option>{value}</option>}
    </select>
  );
}

type DrumTool =
  | "perforation"
  | "retraction"
  | "mark"
  | "bulging"
  | "pen"
  | "eraser";
type Pt = [number, number];

const TOOL_LABEL: Record<DrumTool, string> = {
  perforation: "Perforation",
  retraction: "Retraction",
  mark: "Mark",
  bulging: "Bulging",
  pen: "Pen",
  eraser: "Eraser",
};
const round1 = (n: number) =>
  Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
const near = (a: Pt, b: Pt, d: number) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 <= d * d;
/** Index of the last item matching `f` (lib target predates Array#findLastIndex). */
function lastIndex<T>(a: T[], f: (x: T) => boolean): number {
  for (let i = a.length - 1; i >= 0; i--) if (f(a[i]!)) return i;
  return -1;
}
const strokePts = (s: string): Pt[] =>
  s.split(" ").map((p) => p.split(",").map(Number) as Pt);

/** Right/left eardrums: tap quadrants, place symbols, toggle bulging, or draw free-hand (mouse, stylus or finger). */
function EardrumField({
  value,
  onChange,
  onReset,
  disabled,
}: {
  value: LateralValue<EardrumValue> | undefined;
  onChange: (v: LateralValue<EardrumValue>) => void;
  /** Reset both maps and the answers linked to them (TM back to normal); returns how to undo it. Without it, Reset clears the maps only. */
  onReset?: () => () => void;
  disabled: boolean;
}) {
  const [tool, setTool] = useState<DrumTool>("perforation");
  const [markKind, setMarkKind] = useState<EardrumMarkKind>("grommet");
  const [undo, setUndo] = useState<LateralValue<EardrumValue> | null>(null);
  const [undoReset, setUndoReset] = useState<(() => void) | null>(null);
  const [draft, setDraft] = useState<{ side: Side2; pts: Pt[] } | null>(null);
  const groups = useRef<Partial<Record<Side2, SVGGElement | null>>>({});

  const ear = (side: Side2) => normalizeEardrum(value?.[side]);
  const setEar = (side: Side2, e: EardrumValue) => {
    setUndo(value ?? {});
    setUndoReset(null);
    onChange({ ...value, [side]: e });
  };

  /** Pointer position in drum coordinates (inside the mirrored group for the left ear, so it prints where drawn). */
  const toDrum = (side: Side2, ev: React.PointerEvent): Pt | null => {
    const m = groups.current[side]?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return [round1(p.x), round1(p.y)];
  };

  function onDown(side: Side2, ev: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    const pt = toDrum(side, ev);
    if (!pt) return;
    const e = ear(side);
    if (tool === "perforation" || tool === "retraction") {
      const zone = (ev.target as Element).getAttribute(
        "data-zone",
      ) as EardrumZone | null;
      if (!zone) return;
      const other = tool === "perforation" ? "retraction" : "perforation";
      const list = e[tool].includes(zone)
        ? e[tool].filter((z) => z !== zone)
        : [...e[tool], zone];
      setEar(side, {
        ...e,
        [tool]: list,
        [other]: e[other].filter((z) => z !== zone),
      });
    } else if (tool === "mark") {
      if (e.marks.length < EARDRUM_LIMITS.marks)
        setEar(side, {
          ...e,
          marks: [...e.marks, { kind: markKind, x: pt[0], y: pt[1] }],
        });
    } else if (tool === "bulging") {
      setEar(side, { ...e, bulging: !e.bulging });
    } else if (tool === "eraser") {
      // Nearest mark first, then the most recent stroke passing close by.
      const mi = lastIndex(e.marks, (m) => near([m.x, m.y], pt, 6));
      if (mi >= 0)
        return setEar(side, {
          ...e,
          marks: e.marks.filter((_, i) => i !== mi),
        });
      const si = lastIndex(e.strokes, (s) =>
        strokePts(s).some((p) => near(p, pt, 4)),
      );
      if (si >= 0)
        setEar(side, { ...e, strokes: e.strokes.filter((_, i) => i !== si) });
    } else if (tool === "pen" && e.strokes.length < EARDRUM_LIMITS.strokes) {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      setDraft({ side, pts: [pt] });
    }
  }

  function onMove(side: Side2, ev: React.PointerEvent<SVGSVGElement>) {
    if (draft?.side !== side) return;
    const pt = toDrum(side, ev);
    const last = draft.pts[draft.pts.length - 1]!;
    if (pt && !near(pt, last, 1)) setDraft({ side, pts: [...draft.pts, pt] });
  }

  function onUp(side: Side2) {
    if (draft?.side !== side) return;
    const e = ear(side);
    // Saved once per stroke; normalizeEardrum enforces the point budget when printing.
    if (draft.pts.length >= 2)
      setEar(side, {
        ...e,
        strokes: [...e.strokes, draft.pts.map((p) => p.join(",")).join(" ")],
      });
    setDraft(null);
  }

  function reset() {
    if (
      !window.confirm(
        onReset
          ? "Reset both ears? TM goes back to Intact (Normal) and everything drawn on the right and left eardrums is cleared."
          : "Reset both TM maps? Everything drawn on the right and left eardrums will be cleared.",
      )
    )
      return;
    if (onReset) {
      const restore = onReset();
      setUndo(null);
      setUndoReset(() => restore);
      return;
    }
    setUndo(value ?? {});
    onChange({});
  }

  const btn = (on: boolean) =>
    `rounded px-2 py-0.5 ${on ? "bg-slate-800 text-white" : "bg-slate-100"}`;
  const used = [...eardrumUsed(ear("right")), ...eardrumUsed(ear("left"))];
  return (
    <div>
      {!disabled && (
        <div
          className="mb-1 flex flex-wrap items-center gap-1 text-xs"
          data-testid="eardrum-tools"
        >
          {(
            [
              "perforation",
              "retraction",
              "mark",
              "bulging",
              "pen",
              "eraser",
            ] as const
          ).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
              className={btn(tool === t)}
            >
              {TOOL_LABEL[t]}
            </button>
          ))}
          {tool === "mark" && (
            <select
              className="input w-auto py-0.5 text-xs"
              value={markKind}
              onChange={(e) => setMarkKind(e.target.value as EardrumMarkKind)}
              aria-label="Mark type"
            >
              {EARDRUM_MARKS.map((k) => (
                <option key={k} value={k}>
                  {EARDRUM_MARK_LABEL[k]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-ghost px-1 text-xs"
            disabled={!undo && !undoReset}
            onClick={() => {
              if (undoReset) undoReset();
              else onChange(undo ?? {});
              setUndo(null);
              setUndoReset(null);
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded px-1 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={reset}
          >
            Reset
          </button>
          <span className="basis-full text-slate-400">
            {tool === "perforation" || tool === "retraction"
              ? "Tap quadrants: attic, AS, AI, PS, PI"
              : tool === "mark"
                ? "Tap where it is"
                : tool === "pen"
                  ? "Draw on the drum"
                  : tool === "eraser"
                    ? "Tap a mark or line"
                    : "Tap a drum"}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(["right", "left"] as const).map((side) => {
          const v = ear(side);
          return (
            <div key={side} className="flex flex-col items-center">
              <svg
                viewBox="0 0 100 108"
                className="h-36 w-36 select-none @min-[36rem]:h-48 @min-[36rem]:w-48"
                data-testid={`eardrum-${side}`}
                style={{ touchAction: disabled ? undefined : "none" }}
                onPointerDown={(e) => onDown(side, e)}
                onPointerMove={(e) => onMove(side, e)}
                onPointerUp={() => onUp(side)}
                onPointerCancel={() => setDraft(null)}
              >
                <defs dangerouslySetInnerHTML={{ __html: EARDRUM_DEFS }} />
                <g
                  ref={(el) => {
                    groups.current[side] = el;
                  }}
                  transform={
                    side === "left" ? "translate(100,0) scale(-1,1)" : undefined
                  }
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="#fff"
                    stroke="#111"
                    strokeWidth="1.5"
                  />
                  {EARDRUM_ZONES.map((z) => (
                    <path
                      key={z}
                      d={eardrumZonePath(z)}
                      data-zone={z}
                      stroke="#666"
                      strokeWidth="0.8"
                      className={
                        !disabled &&
                        (tool === "perforation" || tool === "retraction")
                          ? "cursor-pointer hover:opacity-70"
                          : ""
                      }
                      fill={
                        v.perforation.includes(z)
                          ? "#111"
                          : v.retraction.includes(z)
                            ? "url(#hatch)"
                            : "#f8fafc"
                      }
                    />
                  ))}
                  <line
                    x1="50"
                    y1="26"
                    x2="54"
                    y2="56"
                    stroke="#111"
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                  {/* Same drawing code as the printout, so screen and paper can't disagree. */}
                  <g
                    pointerEvents="none"
                    dangerouslySetInnerHTML={{ __html: eardrumOverlaySvg(v) }}
                  />
                  {draft?.side === side && draft.pts.length > 1 && (
                    <polyline
                      points={draft.pts.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke="#111"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                  )}
                </g>
                <text x="50" y="106" fontSize="9" textAnchor="middle">
                  {side === "right" ? "Right" : "Left"}
                </text>
              </svg>
            </div>
          );
        })}
        {/* As printed: the key right after the left drum. */}
        {used.length > 0 && (
          <div className="self-start text-xs" data-testid="eardrum-key">
            <p className="font-medium text-slate-700">Key</p>
            <div className="w-24 @min-[36rem]:w-28" dangerouslySetInnerHTML={{ __html: eardrumLegendSvg(used) }} />
          </div>
        )}
      </div>
    </div>
  );
}

function AudiogramField({
  value,
  onChange,
  disabled,
}: {
  value: AudiogramValue | undefined;
  onChange: (v: AudiogramValue) => void;
  disabled: boolean;
}) {
  const set = (
    side: Side2,
    kind: "ac" | "bc",
    f: (typeof AUDIO_FREQS)[number],
    raw: string,
  ) => {
    const ear: AudiogramEar = value?.[side] ?? { ac: {}, bc: {} };
    const n =
      raw === "" ? undefined : Math.max(-10, Math.min(120, Number(raw)));
    const next = {
      ...ear,
      [kind]: { ...ear[kind], [f]: Number.isFinite(n) ? n : undefined },
    };
    onChange({ ...value, [side]: next });
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="pr-2 text-left">dB HL</th>
              {AUDIO_FREQS.map((f) => (
                <th key={f} className="px-0.5">
                  {f >= 1000 ? `${f / 1000}k` : f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["right", "left"] as const).flatMap((side) =>
              (["ac", "bc"] as const).map((kind) => {
                return (
                  <tr key={side + kind}>
                    <td
                      className={`pr-2 font-medium ${side === "right" ? "text-red-700" : "text-blue-700"}`}
                    >
                      {side === "right" ? "R" : "L"} {kind.toUpperCase()}
                    </td>
                    {AUDIO_FREQS.map((f) => (
                      <td key={f} className="px-0.5">
                        <input
                          className="input w-11 px-1 py-0.5 text-center text-xs"
                          inputMode="numeric"
                          disabled={disabled}
                          value={value?.[side]?.[kind][f] ?? ""}
                          onChange={(e) =>
                            set(
                              side,
                              kind,
                              f,
                              e.target.value.replace(/[^\d-]/g, ""),
                            )
                          }
                          aria-label={`${side} ${kind} ${f}`}
                        />
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
            <li key={side}>
              <b
                className={side === "right" ? "text-red-700" : "text-blue-700"}
              >
                {side === "right" ? "Right" : "Left"}
              </b>{" "}
              PTA {pta} dB ({hearingGrade(pta)})
              {gap !== null && gap > 10 ? ` · A-B gap ${gap} dB` : ""}
            </li>
          );
        })}
      </ul>
      <div
        className="w-56"
        dangerouslySetInnerHTML={{ __html: audiogramSvg(value) }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template form
// ---------------------------------------------------------------------------

export function SpecialtyExam({
  encounterId,
  specialtyCode,
  readOnly,
  onFlatten,
  ixSlot,
  after,
}: {
  encounterId: string;
  specialtyCode: string;
  readOnly: boolean;
  onFlatten: Flatten;
  /**
   * Where sections placed under Investigations (audiology) render: an element below the Ix list. They stay part of
   * this one form, so there is one set of answers and one autosave. Without a slot they render with the exam.
   */
  ixSlot?: HTMLElement | null;
  /**
   * Something of the visit's to show right after one exam section (Other Findings after Neck). Without that section,
   * or without an exam, it shows after the exam.
   */
  after?: { section: string; node: ReactNode };
}) {
  const db = usePowerSync();
  const { data: tpls } = useQuery<{ id: string; name: string; schema: string }>(
    "SELECT id, name, schema FROM specialty_template WHERE specialty_code = ? ORDER BY version DESC LIMIT 1",
    [specialtyCode],
  );
  const { data: encs } = useQuery<{ exam_findings: string | null }>(
    "SELECT exam_findings FROM encounter WHERE id = ?",
    [encounterId],
  );
  const tpl = tpls[0];
  const schema = tpl
    ? parseJson<SpecialtyTemplateSchema | null>(tpl.schema, null)
    : null;
  const [findings, setFindings] = useState<Findings | null>(null);
  /** Newest findings, for an undo that runs after later edits. */
  const latest = useRef<Findings>({});
  if (findings) latest.current = findings;
  // The first section starts open (Ear for ENT, Vision for eyes).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /** Field groups inside a section (e.g. Tuning Fork Test), keyed `section:group`; closed until opened. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastFlat = useRef("");
  const pending = useRef<Findings | null>(null);
  const tplId = tpls[0]?.id ?? null;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current)
        void saveExamFindings(db, encounterId, pending.current, tplId);
    },
    [db, encounterId, tplId],
  );

  useEffect(() => {
    // An answer saved before its field became a sub-option (an old Polyp grade) shows under its parent option.
    if (findings === null && encs[0] && schema)
      setFindings(withSubFieldParents(schema, parseJson<Findings>(encs[0].exam_findings, {})));
  }, [encs, findings, tpl?.schema]);

  if (!schema || findings === null) return after ? <>{after.node}</> : null;

  function update(id: string, v: unknown) {
    // A TM / perforation answer redraws that ear's TM map; a nose, throat or neck answer redraws its picture.
    // Unticking an option drops its sub-option answers first (e.g. the Polyp grade), so they neither print nor draw.
    commit(
      syncSketchMaps(
        schema!,
        findings!,
        syncTmMap(schema!, findings!, pruneSubFields(schema!, { ...findings, [id]: v })),
      ),
    );
  }

  /** TM map Reset: TM back to Intact (Normal), both maps redrawn as that, Perforation cleared; the returned undo puts just those back. */
  function resetTm(): () => void {
    const before = Object.fromEntries(TM_RESET_KEYS.map((k) => [k, findings![k]]));
    commit(resetTmMap(findings!));
    return () => commit({ ...latest.current, ...before });
  }

  function commit(next: Findings) {
    latest.current = next;
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

  /** A section's field rows; a run of fields sharing a `group` folds under its own collapsible heading. */
  function sectionFields(s: TemplateSection, row: (f: TemplateField) => ReactNode): ReactNode[] {
    const out: ReactNode[] = [];
    for (let i = 0; i < s.fields.length; ) {
      const g = s.fields[i]!.group;
      if (!g) {
        out.push(row(s.fields[i++]!));
        continue;
      }
      const run: TemplateField[] = [];
      while (i < s.fields.length && s.fields[i]!.group === g) run.push(s.fields[i++]!);
      const key = `${s.id}:${g}`;
      const isOpen = !!openGroups[key];
      const answered = run.filter((f) => findings![f.id] !== undefined).length;
      out.push(
        <div key={key} className="rounded border border-slate-200" data-testid="exam-group">
          <button
            type="button"
            aria-expanded={isOpen}
            className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium text-slate-700"
            onClick={() => setOpenGroups((o) => ({ ...o, [key]: !o[key] }))}
          >
            <span>
              {g}
              {answered > 0 && <span className="badge ml-1 bg-brand-50 text-brand-700">{answered}</span>}
            </span>
            <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
          </button>
          {isOpen && <div className="space-y-2 border-t border-slate-100 p-2">{run.map(row)}</div>}
        </div>,
      );
    }
    return out;
  }

  /** A sub-option's row shows only where its option is chosen (on either side, for right/left fields). */
  const rowShown = (f: TemplateField) =>
    !f.parent || (f.lateral ? subFieldShown(findings, f, "right") || subFieldShown(findings, f, "left") : subFieldShown(findings, f));

  const filled = (sid: string) =>
    schema.sections
      .find((s) => s.id === sid)!
      .fields.filter((f) => findings[f.id] !== undefined).length;

  /** One collapsible section; the first exam section starts open. */
  const sectionBlock = (s: TemplateSection, si: number) => (
    <div key={s.id} className="rounded-md border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-2 py-1.5 text-sm font-medium"
        onClick={() =>
          setOpen((o) => ({ ...o, [s.id]: !(o[s.id] ?? si === 0) }))
        }
      >
        <span>
          {s.title}{" "}
          {filled(s.id) > 0 && (
            <span className="badge ml-1 bg-brand-50 text-brand-700">
              {filled(s.id)}
            </span>
          )}
        </span>
        <span className="text-slate-400">
          {(open[s.id] ?? si === 0) ? "−" : "+"}
        </span>
      </button>
      {(open[s.id] ?? si === 0) && (
        <div className="space-y-2 border-t border-slate-100 p-2">
          {sectionFields(s, (f) => !rowShown(f) ? null : (
            <div
              key={f.id}
              className="grid items-start gap-1 @min-[36rem]:grid-cols-[7.5rem_1fr]"
            >
              {/* A sub-option (e.g. Polyp grade) sits indented under the option it belongs to. */}
              <span className={`pt-1.5 text-xs text-slate-600${f.parent ? " pl-2 before:mr-1 before:content-['↳']" : ""}`}>
                {f.label}
              </span>
              {f.type === "eardrum" ? (
                <EardrumField
                  value={findings[f.id] as LateralValue<EardrumValue>}
                  onChange={(v) => update(f.id, v)}
                  onReset={f.id === TM_LINK.map ? resetTm : undefined}
                  disabled={readOnly}
                />
              ) : f.type === "sketch" && f.sketch ? (
                <SketchField
                  sketch={f.sketch}
                  value={findings[f.id] as SketchValue}
                  onChange={(v) => update(f.id, v)}
                  disabled={readOnly}
                />
              ) : f.type === "audiogram" ? (
                <AudiogramField
                  value={findings[f.id] as AudiogramValue}
                  onChange={(v) => update(f.id, v)}
                  disabled={readOnly}
                />
              ) : f.lateral ? (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-1">
                  {(["right", "left"] as const).map((side) => f.parent && !subFieldShown(findings, f, side) ? <div key={side} /> : (
                    <div key={side} className="flex min-w-0 items-start gap-1">
                      <span
                        className={`pt-1.5 text-xs font-semibold ${side === "right" ? "text-red-700" : "text-blue-700"}`}
                      >
                        {side === "right"
                          ? (schema.lateralLabels?.right ?? "R")
                          : (schema.lateralLabels?.left ?? "L")}
                      </span>
                      <div className="flex-1">
                        <SelectField
                          f={f}
                          value={
                            (findings[f.id] as LateralValue<unknown>)?.[
                              side
                            ]
                          }
                          // No perforation on an ear whose TM is intact.
                          disabled={readOnly || (f.id === TM_LINK.perfType && perforationBlocked(findings, side))}
                          onChange={(v) =>
                            update(f.id, {
                              ...(findings[f.id] as object),
                              [side]: v,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {!readOnly && !f.parent && (
                    <button
                      type="button"
                      title="Copy right to left"
                      className="btn-ghost px-1 text-xs"
                      onClick={() =>
                        update(f.id, {
                          ...(findings[f.id] as object),
                          left: (findings[f.id] as LateralValue<unknown>)
                            ?.right,
                        })
                      }
                    >
                      R→L
                    </button>
                  )}
                </div>
              ) : (
                <SelectField
                  f={f}
                  value={findings[f.id]}
                  onChange={(v) => update(f.id, v)}
                  disabled={readOnly}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const inExam = schema.sections.filter((s) => s.placement !== "ix");
  const inIx = schema.sections.filter((s) => s.placement === "ix");
  const ixBlock = inIx.length ? (
    <section className="@container space-y-2" data-testid="specialty-exam-ix">
      {inIx.map((s) => sectionBlock(s, -1))}
    </section>
  ) : null;

  return (
    <>
      <section className="@container space-y-2" data-testid="specialty-exam">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {tpl!.name}
        </h3>
        {inExam.map((s, si) => (
          <Fragment key={s.id}>
            {sectionBlock(s, si)}
            {after?.section === s.id && after.node}
          </Fragment>
        ))}
        {after && !inExam.some((s) => s.id === after.section) && after.node}
        {!ixSlot && ixBlock}
      </section>
      {ixSlot && ixBlock && createPortal(ixBlock, ixSlot)}
    </>
  );
}
