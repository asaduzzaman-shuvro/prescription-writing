import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_SETTINGS,
  DRAWING_LIMITS,
  ENT_TEMPLATE,
  eraseAt,
  flattenFindings,
  normalizeSketch,
  renderPrescriptionHtml,
  sanitizeSvg,
  SAMPLE_CHAMBER,
  SAMPLE_DOC,
  SAMPLE_DOCTOR,
  SAMPLE_PATIENT,
  SKETCH_IDS,
  SKETCHES,
  sketchLegendSvg,
  sketchSvg,
  sketchText,
  validateTemplateSchema,
  type PrescriptionDoc,
  type SketchId,
} from "../src";

/** Every state on some zone, every symbol, and a stroke. */
function everything(id: SketchId) {
  const def = SKETCHES[id];
  return {
    zones: Object.fromEntries(def.zones.map((z, i) => [z.id, def.states[i % def.states.length]!.id])),
    marks: def.marks.map((m, i) => ({ kind: m.kind, x: 20 + i * 10, y: 50 })),
    strokes: ["10,10 20,20 30,15"],
  };
}

describe("sketch definitions", () => {
  it.each(SKETCH_IDS)("%s has unique zones, states and symbols", (id) => {
    const def = SKETCHES[id];
    for (const list of [def.zones.map((z) => z.id), def.states.map((s) => s.id), def.marks.map((m) => m.kind)]) expect(new Set(list).size).toBe(list.length);
    for (const z of def.zones) expect(z.path).toMatch(/^M[\d.,\sA-Z-]+$/);
  });

  it.each(SKETCH_IDS)("%s survives the print sanitiser byte-for-byte, blank and fully marked", (id) => {
    for (const svg of [sketchSvg(id), sketchSvg(id, everything(id)), sketchLegendSvg(id, everything(id))]) expect(sanitizeSvg(svg)).toBe(svg);
  });

  it("puts the patient's right on the viewer's left", () => {
    for (const id of SKETCH_IDS) {
      const svg = sketchSvg(id);
      expect(svg.indexOf('x="5"')).toBeLessThan(svg.indexOf('x="95"'));
      expect(svg).toMatch(/<text x="5"[^>]*>R<\/text>/);
    }
    const left = (p: string) => Number(/^M(-?[\d.]+)/.exec(p)![1]);
    const zone = (id: SketchId, z: string) => SKETCHES[id].zones.find((x) => x.id === z)!.path;
    expect(left(zone("oropharynx", "r_tonsil"))).toBeLessThan(left(zone("oropharynx", "l_tonsil")));
    expect(left(zone("oropharynx", "r_ant_pillar"))).toBeLessThan(50);
    expect(left(zone("oropharynx", "l_ant_pillar"))).toBeGreaterThan(50);
    expect(left(zone("neck", "r_iii"))).toBeLessThan(50);
    expect(left(zone("neck", "l_iii"))).toBeGreaterThan(50);
  });
});

describe("sketch values", () => {
  it("drops unknown zones, states, symbols and bad coordinates", () => {
    const v = normalizeSketch("oropharynx", {
      zones: { r_tonsil: "congested", l_tonsil: "on fire", bogus: "swollen", uvula: 3 },
      marks: [{ kind: "ulcer", x: 500, y: -1 }, { kind: "nodule", x: 5, y: 5 }, { kind: "pus", x: Number.NaN, y: 1 }],
      strokes: ["1,1 2,2", "oops", 7],
    });
    expect(v).toEqual({ zones: { r_tonsil: "congested" }, marks: [{ kind: "ulcer", x: 100, y: 0 }], strokes: ["1,1 2,2"] });
    // The neck is taller than it is wide: y may go past 100.
    expect(normalizeSketch("neck", { marks: [{ kind: "scar", x: 50, y: 106 }] }).marks[0]!.y).toBe(106);
    const many = normalizeSketch("larynx", { marks: Array.from({ length: 60 }, () => ({ kind: "nodule", x: 1, y: 1 })) });
    expect(many.marks).toHaveLength(DRAWING_LIMITS.marks);
  });

  it("words findings in drawing order, whatever the tap order", () => {
    expect(sketchText("oropharynx", { zones: { uvula: "swollen", r_tonsil: "congested" }, marks: [{ kind: "membrane", x: 1, y: 1 }, { kind: "ulcer", x: 2, y: 2 }], strokes: ["1,1 2,2"] }))
      .toBe("Uvula swollen, R tonsil congested; ulcer, membrane / slough; drawing");
    expect(sketchText("larynx", { zones: { l_cord: "fixed" } })).toBe("L vocal cord fixed (palsy)");
    expect(sketchText("oropharynx", { zones: { l_ant_pillar: "congested", r_ant_pillar: "congested", palate: "swollen" } }))
      .toBe("Soft palate swollen, R anterior pillar congested, L anterior pillar congested");
    expect(sketchText("neck", {})).toBe("");
  });

  it("erases the nearest symbol first, then a stroke", () => {
    const v = { zones: {}, marks: [{ kind: "node", x: 30, y: 30 }], strokes: ["10,10 20,20"] };
    expect(eraseAt(v, [31, 31]).marks).toHaveLength(0);
    expect(eraseAt(v, [15, 15]).strokes).toHaveLength(0);
    expect(eraseAt(v, [80, 80])).toBe(v);
  });
});

describe("sketches in the ENT exam", () => {
  it("are valid template fields; an unknown picture is rejected", () => {
    expect(validateTemplateSchema(ENT_TEMPLATE)).toEqual([]);
    const bad = { sections: [{ id: "t", title: "T", fields: [{ id: "x", label: "X", type: "sketch", sketch: "foot" }] }] };
    expect(validateTemplateSchema(bad)).toEqual([`field x: "sketch" must be one of nose, oropharynx, larynx, neck`]);
  });

  it("print a line, the picture and its key; a drawing alone needs no key", () => {
    const out = flattenFindings(ENT_TEMPLATE, {
      thr_oro_map: { zones: { r_tonsil: "congested" }, marks: [{ kind: "ulcer", x: 60, y: 80 }] },
      thr_neck_map: { strokes: ["20,30 25,40"] },
    });
    const throat = out.groups.find((g) => g.title === "Throat")!.lines;
    const neck = out.groups.find((g) => g.title === "Neck")!.lines;
    expect(throat).toContainEqual({ label: "Oropharynx map", value: "R tonsil congested; ulcer" });
    expect(neck).toContainEqual({ label: "Neck map", value: "drawing" });
    expect(out.diagrams.map((d) => d.title)).toEqual(["Oropharynx", "Key", "Neck"]);
    expect(out.diagrams.map((d) => [d.kind, d.ref])).toEqual([["sketch", "oropharynx"], ["legend", "oropharynx"], ["sketch", "neck"]]);
    expect(out.diagrams[1]!.svg).toContain(">Congested</text>");
    expect(out.diagrams[1]!.svg).toContain(">Ulcer</text>");
  });
});

describe("always-print sketches", () => {
  const render = (doc: Partial<PrescriptionDoc>, sketchesAlways: SketchId[], mode: "letterhead" | "pad" = "letterhead") =>
    renderPrescriptionHtml({
      doc: { ...SAMPLE_DOC, ...doc }, patient: SAMPLE_PATIENT, doctor: SAMPLE_DOCTOR, chamber: SAMPLE_CHAMBER, date: "2026-10-06",
      settings: { ...DEFAULT_PRINT_SETTINGS, mode, sketchesAlways }, fonts: { bengali: "", latin: "" },
    });
  const captions = (html: string) => [...html.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((m) => m[1]);

  it("prints the chosen pictures blank, on letterhead and on a pad", () => {
    expect(captions(render({ diagrams: [] }, []))).toEqual([]);
    expect(captions(render({ diagrams: [] }, ["oropharynx", "neck"]))).toEqual(["Oropharynx", "Neck"]);
    expect(captions(render({ diagrams: [] }, ["larynx"], "pad"))).toEqual(["Larynx (IDL)"]);
    expect(render({ diagrams: [] }, ["neck"])).toContain(`<figure class="diagram neck">`);
  });

  it("doesn't add a blank copy of a picture that was marked", () => {
    const doc = { diagrams: [{ title: "Oropharynx", svg: sketchSvg("oropharynx", { zones: { uvula: "swollen" } }), kind: "sketch" as const, ref: "oropharynx" }] };
    expect(captions(render(doc, ["oropharynx", "larynx"]))).toEqual(["Oropharynx", "Larynx (IDL)"]);
  });

  it("ignores unknown ids in stored settings", () => {
    expect(captions(render({ diagrams: [] }, ["foot" as SketchId]))).toEqual([]);
  });
});
