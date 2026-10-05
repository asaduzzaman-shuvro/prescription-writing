"use client";

import type { Point } from "@rx/core";
import { useRef, useState } from "react";

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pointer handling for one drawing surface: screen → drawing coordinates (through the group's own
 * transform, so mirrored or zoomed drawings store what the doctor sees) and a free-hand stroke draft.
 */
export function useDrawingSurface() {
  const groupRef = useRef<SVGGElement | null>(null);
  const [draft, setDraft] = useState<Point[] | null>(null);

  const toPoint = (ev: { clientX: number; clientY: number }): Point | null => {
    const m = groupRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return [round1(p.x), round1(p.y)];
  };

  return {
    groupRef,
    draft,
    toPoint,
    /** Begin a stroke; the svg keeps receiving moves even if the pointer leaves it. */
    start(ev: React.PointerEvent<SVGSVGElement>, pt: Point) {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      setDraft([pt]);
    },
    /** Add a point when it is at least 1 unit from the last one. */
    move(ev: React.PointerEvent<SVGSVGElement>) {
      if (!draft) return;
      const pt = toPoint(ev);
      const last = draft[draft.length - 1]!;
      if (pt && (pt[0] - last[0]) ** 2 + (pt[1] - last[1]) ** 2 >= 1) setDraft([...draft, pt]);
    },
    /** Finish: the stroke as "x,y x,y …", or null when it was only a tap. */
    end(): string | null {
      const pts = draft;
      setDraft(null);
      return pts && pts.length >= 2 ? pts.map((p) => p.join(",")).join(" ") : null;
    },
    cancel: () => setDraft(null),
  };
}
