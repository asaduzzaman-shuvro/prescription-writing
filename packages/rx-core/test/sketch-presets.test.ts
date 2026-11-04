import { describe, expect, it } from "vitest";
import { applySketchPreset, ENT_TEMPLATE, sketchLegendSvg, sketchSvg, sanitizeSvg, syncSketchMaps, sketchPresets } from "../src";

describe("throat & neck answers draw on the pictures", () => {
  it("maps tonsils, posterior pharyngeal wall, cords and neck", () => {
    const p = sketchPresets({
      thr_tonsil_grade: { right: "Grade 4", left: "Grade 2" },
      thr_tonsil: ["Pus in crypts", "Jugulodigastric LN enlarged"],
      thr_ppw: "Bulge",
      thr_cords: "Nodule",
      thr_neck: "Thyroid swelling",
    });
    expect(p.oropharynx.zones).toEqual({});
    expect(p.oropharynx.sizes).toEqual({ r_tonsil: 4, l_tonsil: 2 });
    expect(p.oropharynx.marks.map((m) => m.kind)).toEqual(["pus", "pus", "bulge"]);
    expect(p.larynx.marks).toEqual([{ kind: "nodule", x: 46.6, y: 49.7 }, { kind: "nodule", x: 53.4, y: 49.7 }]);
    expect(p.neck.zones).toEqual({ r_ii: "enlarged", l_ii: "enlarged", thyroid: "enlarged" });
  });

  it("congested tonsils hatch at their grade's size; a palsy marks that cord fixed", () => {
    const p = sketchPresets({ thr_tonsil_grade: { right: "Grade 3" }, thr_tonsil: ["Congested"], thr_cords: "Left cord palsy", thr_neck: "Midline swelling" });
    expect(p.oropharynx.zones).toEqual({ r_tonsil: "congested", l_tonsil: "congested" });
    expect(p.oropharynx.sizes).toEqual({ r_tonsil: 3 });
    expect(p.larynx.zones).toEqual({ l_cord: "fixed" });
    expect(p.neck.marks).toEqual([{ kind: "mass", x: 50, y: 58 }]);
  });

  it("congested anterior pillars hatch both sides, alongside congested tonsils", () => {
    expect(sketchPresets({ thr_tonsil: ["Anterior tonsillar pillar congested"] }).oropharynx.zones).toEqual({ r_ant_pillar: "congested", l_ant_pillar: "congested" });
    const all = sketchPresets({ thr_tonsil: ["Congested", "Anterior tonsillar pillar congested"] }).oropharynx;
    expect(all.zones).toEqual({ r_tonsil: "congested", l_tonsil: "congested", r_ant_pillar: "congested", l_ant_pillar: "congested" });
    // Unticking the pillar option clears only the pillars.
    const drawn = applySketchPreset("oropharynx", undefined, { zones: {}, marks: [] }, all);
    const next = sketchPresets({ thr_tonsil: ["Congested"] }).oropharynx;
    expect(applySketchPreset("oropharynx", drawn, all, next).zones).toEqual({ r_tonsil: "congested", l_tonsil: "congested" });
  });

  it("every tonsil grade draws the tonsil at its size, per side; changing the grade swaps it", () => {
    for (const g of [0, 1, 2, 3, 4]) expect(sketchPresets({ thr_tonsil_grade: { right: `Grade ${g}`, left: `Grade ${g}` } }).oropharynx).toEqual({ zones: {}, sizes: { r_tonsil: g, l_tonsil: g }, marks: [] });
    expect(sketchPresets({ thr_tonsil_grade: { left: "Grade 1" } }).oropharynx.sizes).toEqual({ l_tonsil: 1 });
    const g3 = sketchPresets({ thr_tonsil_grade: { right: "Grade 3", left: "Grade 3" } }).oropharynx;
    const drawn = applySketchPreset("oropharynx", { zones: { uvula: "swollen" } }, { zones: {}, marks: [] }, g3);
    expect(drawn.sizes).toEqual({ r_tonsil: 3, l_tonsil: 3 });
    const g1 = sketchPresets({ thr_tonsil_grade: { right: "Grade 1", left: "Grade 3" } }).oropharynx;
    expect(applySketchPreset("oropharynx", drawn, g3, g1)).toEqual({ zones: { uvula: "swollen" }, sizes: { r_tonsil: 1, l_tonsil: 3 }, marks: [], strokes: [] });
    // Clearing the grade puts the usual outline back.
    expect(applySketchPreset("oropharynx", drawn, g3, { zones: {}, marks: [] }).sizes).toBeUndefined();
  });

  it("every posterior pharyngeal wall answer draws, and an old single answer still reads", () => {
    const at = (ppw: unknown) => sketchPresets({ thr_ppw: ppw }).oropharynx;
    expect(at(["Congested"]).zones).toEqual({ ppw: "congested" });
    expect(at(["Granular"]).zones).toEqual({ ppw: "granular" });
    expect(at(["Congested", "Granular"]).zones).toEqual({ ppw: "granular" }); // later option wins
    expect(at(["Post-nasal drip"]).marks).toEqual([{ kind: "pnd", x: 40, y: 44 }, { kind: "pnd", x: 60, y: 44 }]);
    expect(at(["Growth/Mass", "Bulge"]).marks).toEqual([{ kind: "bulge", x: 50, y: 56 }, { kind: "growth", x: 50, y: 62 }]);
    expect(at("Bulge").marks).toEqual([{ kind: "bulge", x: 50, y: 56 }]);
    expect(at(["Normal"])).toEqual({ zones: {}, marks: [] });
  });

  it("a vocal cord polyp is drawn on the cord its answer names", () => {
    expect(sketchPresets({ thr_cords: "Polyp (right)" }).larynx).toEqual({ zones: {}, marks: [{ kind: "polyp", x: 48.6, y: 54 }] });
    expect(sketchPresets({ thr_cords: "Polyp (left)" }).larynx).toEqual({ zones: {}, marks: [{ kind: "polyp", x: 51.4, y: 54 }] });
    // Changing the side moves the polyp.
    const r = sketchPresets({ thr_cords: "Polyp (right)" }).larynx, l = sketchPresets({ thr_cords: "Polyp (left)" }).larynx;
    expect(applySketchPreset("larynx", applySketchPreset("larynx", undefined, { zones: {}, marks: [] }, r), r, l).marks).toEqual(l.marks);
  });

  it("a vocal cord growth or ulcer is drawn on the cord its answer names", () => {
    const at = (cords: string) => sketchPresets({ thr_cords: cords }).larynx.marks;
    expect(at("Growth (right)")).toEqual([{ kind: "growth", x: 44, y: 61 }]);
    expect(at("Growth (left)")).toEqual([{ kind: "growth", x: 56, y: 61 }]);
    expect(at("Ulcer (right)")).toEqual([{ kind: "ulcer", x: 44, y: 61 }]);
    expect(at("Ulcer (left)")).toEqual([{ kind: "ulcer", x: 56, y: 61 }]);
    expect(at("Growth")).toEqual([]); // an old answer with no side draws nothing
  });

  it("draws nothing for normal answers, sideless lesions or renamed options", () => {
    const p = sketchPresets({ thr_tonsil: ["Normal"], thr_ppw: "Normal", thr_cords: "Polyp", thr_neck: "No lymphadenopathy", thr_uvula: "Pushed (quinsy)" });
    for (const s of Object.values(p)) expect(s).toEqual({ zones: {}, marks: [] });
    expect(sketchPresets({ thr_cords: "Renamed by admin" }).larynx).toEqual({ zones: {}, marks: [] });
  });

  it("swaps the old picture for the new one and keeps the doctor's own drawing", () => {
    const mine = { zones: { uvula: "swollen" }, marks: [{ kind: "ulcer", x: 30, y: 80 }], strokes: ["10,10 20,20"] };
    const before = sketchPresets({ thr_ppw: "Bulge" }).oropharynx;
    const drawn = applySketchPreset("oropharynx", mine, { zones: {}, marks: [] }, before);
    expect(drawn.marks).toHaveLength(2);
    const after = applySketchPreset("oropharynx", drawn, before, sketchPresets({ thr_ppw: "Congested" }).oropharynx);
    expect(after).toEqual({ zones: { uvula: "swollen", ppw: "congested" }, marks: mine.marks, strokes: mine.strokes });
    // A zone the doctor changed away from the preset state is left as they set it.
    const edited = { ...after, zones: { ...after.zones, ppw: "swollen" } };
    expect(applySketchPreset("oropharynx", edited, sketchPresets({ thr_ppw: "Congested" }).oropharynx, { zones: {}, marks: [] }).zones.ppw).toBe("swollen");
  });

  it("redraws only the picture whose answers changed", () => {
    const prev = { thr_neck_map: { zones: {}, marks: [], strokes: ["1,1 2,2"] } };
    const next = syncSketchMaps(ENT_TEMPLATE, prev, { ...prev, thr_cords: "Right cord palsy" });
    expect(next.thr_larynx_map).toEqual({ zones: { r_cord: "fixed" }, marks: [], strokes: [] });
    expect(next.thr_neck_map).toBe(prev.thr_neck_map);
    expect(next.thr_oro_map).toBeUndefined();
    const same = { ...next, thr_oral: "Ulcer" };
    expect(syncSketchMaps(ENT_TEMPLATE, next, same)).toBe(same);
  });

  it("drawn pictures survive the print sanitiser", () => {
    const p = sketchPresets({ thr_tonsil_grade: { right: "Grade 4", left: "Grade 0" }, thr_tonsil: ["Congested", "Anterior tonsillar pillar congested", "Pus in crypts", "Membrane"], thr_ppw: ["Granular", "Post-nasal drip", "Bulge", "Growth/Mass"], thr_cords: "Polyp (left)", thr_neck: "Midline swelling" });
    for (const id of ["oropharynx", "larynx", "neck"] as const) {
      const svg = sketchSvg(id, applySketchPreset(id, undefined, { zones: {}, marks: [] }, p[id]));
      expect(sanitizeSvg(svg)).toBe(svg);
    }
  });
});

describe("nose & PNS answers draw on the nose picture", () => {
  it("maps septum, turbinates, mucosa, polyps, discharge and sinus tenderness", () => {
    const p = sketchPresets({
      nose_septum: "DNS to left",
      nose_turbinate: { right: "Hypertrophied", left: "Pale & boggy" },
      nose_mucosa: "Congested",
      nose_polyp: { right: "Present (grade 2)", left: "Antrochoanal" },
      nose_discharge: { right: "Mucopurulent", left: "None" },
      nose_sinus_tender: ["Maxillary", "Frontal"],
    }).nose;
    expect(p.zones).toEqual({
      r_cavity: "congested", l_cavity: "congested", r_it: "hypertrophied", l_it: "pale",
      r_maxillary: "tender", l_maxillary: "tender", r_frontal: "tender", l_frontal: "tender",
    });
    expect(p.marks.map((m) => m.kind)).toEqual(["dev_l", "polyp", "polyp", "discharge", "polyp", "polyp"]);
    expect(p.marks.filter((m) => m.kind === "polyp").every((m, i) => (i < 2 ? m.x < 50 : m.x > 50))).toBe(true);
  });

  it("draws the septum findings on the septum", () => {
    const kinds = (septum: string) => sketchPresets({ nose_septum: septum }).nose.marks.map((m) => [m.kind, m.x]);
    expect(kinds("S-shaped DNS")).toEqual([["dev_r", 50], ["dev_l", 50]]);
    expect(kinds("Spur right")).toEqual([["spur_r", 50]]);
    expect(kinds("Perforation")).toEqual([["perforation", 50]]);
    expect(kinds("Haematoma")).toEqual([["haematoma", 50]]);
    expect(kinds("Central")).toEqual([]);
  });

  it("draws nothing for normal answers", () => {
    const p = sketchPresets({ nose_external: "Saddle", nose_septum: "Central", nose_turbinate: { right: "Normal" }, nose_mucosa: "Normal", nose_polyp: { right: "Absent" }, nose_cottle: { right: "Positive" }, nose_sinus_tender: ["None"] });
    expect(p.nose).toEqual({ zones: {}, marks: [] });
  });

  it("draws every answer of the multi-select fields, the later option winning a zone", () => {
    const p = sketchPresets({
      nose_septum: ["Spur left", "DNS to left", "Perforation"], // ticked out of order: drawn in option order
      nose_turbinate: { right: ["Congested", "Hypertrophied"], left: ["Pale & boggy"] },
      nose_mucosa: ["Congested", "Pale", "Crusting"],
      nose_discharge: { right: ["Mucoid", "Blood stained"], left: ["None"] },
    }).nose;
    expect(p.marks.map((m) => m.kind)).toEqual(["dev_l", "spur_l", "perforation", "crust", "crust", "discharge"]);
    expect(p.zones).toEqual({ r_cavity: "congested", l_cavity: "congested", r_it: "congested", l_it: "pale" });
    expect(p.marks.filter((m) => m.kind === "discharge")).toHaveLength(1); // one symbol for several kinds
    // Only normal answers, or nothing ticked, draw nothing.
    const normal = sketchPresets({ nose_external: ["Normal"], nose_septum: ["Central"], nose_turbinate: { right: ["Normal"], left: [] }, nose_mucosa: ["Normal"], nose_discharge: { right: ["None"] } });
    expect(normal.nose).toEqual({ zones: {}, marks: [] });
  });

  it("draws Nasal cavity findings on that side: polyps (one until graded), a mass and a foreign body", () => {
    const p = sketchPresets({ nose_cavity: { right: ["Polyp", "Nasal mass"], left: ["Polyp", "Foreign body"] }, nose_polyp: { left: "Present (grade 2)" } }).nose;
    expect(p.marks.map((m) => [m.kind, m.x < 50 ? "R" : "L"])).toEqual([["polyp", "R"], ["mass", "R"], ["polyp", "L"], ["polyp", "L"], ["fb", "L"]]);
    expect(sketchPresets({ nose_cavity: { right: ["Polyp"] }, nose_polyp: { right: "Antrochoanal" } }).nose.marks).toHaveLength(2);
    expect(sketchPresets({ nose_polyp: { right: "Present (Grade 3)" } }).nose.marks).toHaveLength(3); // either capitalisation
  });

  it("writes the nose picture into the ENT template's nose map", () => {
    const next = syncSketchMaps(ENT_TEMPLATE, {}, { nose_turbinate: { right: "Congested" } });
    expect(next.nose_map).toEqual({ zones: { r_it: "congested" }, marks: [], strokes: [] });
    const all = sketchPresets({ nose_septum: "S-shaped DNS", nose_mucosa: "Crusting", nose_polyp: { right: "Present (grade 3)" }, nose_discharge: { left: "Watery" }, nose_sinus_tender: ["Ethmoid"] }).nose;
    const svg = sketchSvg("nose", applySketchPreset("nose", undefined, { zones: {}, marks: [] }, all));
    expect(sanitizeSvg(svg)).toBe(svg);
  });
});

describe("nose key", () => {
  it("widens for long labels so none is cut off, and keeps the usual width otherwise", () => {
    expect(sketchLegendSvg("nose", { marks: [{ kind: "dev_l", x: 50, y: 58 }] })).toContain('viewBox="0 0 107 12"');
    expect(sketchLegendSvg("oropharynx", { zones: { uvula: "swollen" } })).toContain('viewBox="0 0 86 12"');
  });
});
