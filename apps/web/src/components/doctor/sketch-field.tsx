"use client";

import {
  DRAWING_DEFS,
  DRAWING_LIMITS,
  eraseAt,
  normalizeSketch,
  SKETCHES,
  sketchOverlaySvg,
  sketchText,
  sketchZoneFill,
  type NormalizedSketch,
  type SketchId,
  type SketchValue,
} from "@rx/core";
import { useState } from "react";
import { useDrawingSurface } from "./use-drawing";

type Tool = `state:${string}` | "mark" | "pen" | "eraser";

/** A throat or neck picture: tap areas to set a state, place symbols, or draw free-hand (mouse, stylus or finger). */
export function SketchField({ sketch, value, onChange, disabled }: { sketch: SketchId; value: SketchValue | undefined; onChange: (v: SketchValue) => void; disabled: boolean }) {
  const def = SKETCHES[sketch];
  const [tool, setTool] = useState<Tool>(`state:${def.states[0]!.id}`);
  const [markKind, setMarkKind] = useState(def.marks[0]!.kind);
  const [undo, setUndo] = useState<SketchValue | null>(null);
  const surface = useDrawingSurface();
  const v = normalizeSketch(sketch, value);

  const commit = (next: NormalizedSketch) => {
    setUndo(v);
    onChange(next);
  };

  function onDown(ev: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    const pt = surface.toPoint(ev);
    if (!pt) return;
    if (tool.startsWith("state:")) {
      const zone = (ev.target as Element).getAttribute("data-zone");
      if (!zone) return;
      const st = tool.slice(6);
      const zones = { ...v.zones };
      if (zones[zone] === st) delete zones[zone];
      else zones[zone] = st;
      commit({ ...v, zones });
    } else if (tool === "mark") {
      if (v.marks.length < DRAWING_LIMITS.marks) commit({ ...v, marks: [...v.marks, { kind: markKind, x: pt[0], y: pt[1] }] });
    } else if (tool === "eraser") {
      const next = eraseAt(v, pt);
      if (next !== v) commit(next);
    } else if (v.strokes.length < DRAWING_LIMITS.strokes) {
      surface.start(ev, pt);
    }
  }

  function onUp() {
    const stroke = surface.end();
    if (stroke) commit({ ...v, strokes: [...v.strokes, stroke] });
  }

  const btn = (on: boolean) => `rounded px-2 py-0.5 ${on ? "bg-slate-800 text-white" : "bg-slate-100"}`;
  const summary = sketchText(sketch, v);
  return (
    <div>
      {!disabled && (
        <div className="mb-1 flex flex-wrap items-center gap-1 text-xs" data-testid={`sketch-tools-${sketch}`}>
          {def.states.map((s) => (
            <button key={s.id} type="button" aria-pressed={tool === `state:${s.id}`} onClick={() => setTool(`state:${s.id}`)} className={btn(tool === `state:${s.id}`)}>{s.label}</button>
          ))}
          {(["mark", "pen", "eraser"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)} className={btn(tool === t)}>{{ mark: "Mark", pen: "Pen", eraser: "Eraser" }[t]}</button>
          ))}
          {tool === "mark" && (
            <select className="input w-auto py-0.5 text-xs" value={markKind} onChange={(e) => setMarkKind(e.target.value)} aria-label="Mark type">
              {def.marks.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
            </select>
          )}
          <button type="button" className="btn-ghost px-1 text-xs" disabled={!undo} onClick={() => { onChange(undo ?? {}); setUndo(null); }}>Undo</button>
          <button type="button" className="rounded px-1 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={() => window.confirm(`Reset the ${def.title.toLowerCase()} picture? Everything drawn on it will be cleared.`) && commit({ zones: {}, marks: [], strokes: [] })}>Reset</button>
          <span className="text-slate-400">
            {tool.startsWith("state:") ? "Tap an area (tap again to undo)" : tool === "mark" ? "Tap where it is" : tool === "pen" ? "Draw on the picture" : "Tap a mark or line"}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${def.viewBox[0]} ${def.viewBox[1]}`} className="h-56 w-auto max-w-full select-none" data-testid={`sketch-${sketch}`}
        style={{ touchAction: disabled ? undefined : "none" }}
        onPointerDown={onDown} onPointerMove={(e) => surface.move(e)} onPointerUp={onUp} onPointerCancel={surface.cancel}>
        <defs dangerouslySetInnerHTML={{ __html: DRAWING_DEFS }} />
        <g ref={surface.groupRef}>
          {def.zones.map((z) => (
            <path key={z.id} d={z.path} data-zone={z.id} fill={sketchZoneFill(sketch, v, z.id)} stroke="#999" strokeWidth="0.5"
              className={!disabled && tool.startsWith("state:") ? "cursor-pointer hover:opacity-70" : ""}>
              <title>{z.label}</title>
            </path>
          ))}
          {/* Outline, labels and marks sit above the zones but never take the tap. Same drawing code as the printout. */}
          <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: def.base }} />
          <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: sketchOverlaySvg(sketch, v) }} />
          {surface.draft && surface.draft.length > 1 && (
            <polyline points={surface.draft.map((p) => p.join(",")).join(" ")} fill="none" stroke="#111" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          )}
        </g>
      </svg>
      {summary && <p className="text-xs text-slate-600" data-testid={`sketch-summary-${sketch}`}>{summary}</p>}
    </div>
  );
}
