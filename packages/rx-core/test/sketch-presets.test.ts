import { describe, expect, it } from "vitest";
import { applySketchPreset, ENT_TEMPLATE, sketchSvg, sanitizeSvg, syncSketchMaps, sketchPresets } from "../src";

describe("throat & neck answers draw on the pictures", () => {
  it("maps tonsils, posterior pharyngeal wall, cords and neck", () => {
    const p = sketchPresets({
      thr_tonsil_grade: { right: "Grade 4", left: "Grade 2" },
      thr_tonsil: ["Pus in crypts", "Jugulodigastric LN enlarged"],
      thr_ppw: "Bulge",
      thr_cords: "Nodule",
      thr_neck: "Thyroid swelling",
    });
    expect(p.oropharynx.zones).toEqual({ r_tonsil: "swollen" });
    expect(p.oropharynx.marks.map((m) => m.kind)).toEqual(["pus", "pus", "bulge"]);
    expect(p.larynx.marks).toEqual([{ kind: "nodule", x: 46.6, y: 49.7 }, { kind: "nodule", x: 53.4, y: 49.7 }]);
    expect(p.neck.zones).toEqual({ r_ii: "enlarged", l_ii: "enlarged", thyroid: "enlarged" });
  });

  it("congested tonsils win over a grade's swelling; a palsy marks that cord fixed", () => {
    const p = sketchPresets({ thr_tonsil_grade: { right: "Grade 3" }, thr_tonsil: ["Congested"], thr_cords: "Left cord palsy", thr_neck: "Midline swelling" });
    expect(p.oropharynx.zones).toEqual({ r_tonsil: "congested", l_tonsil: "congested" });
    expect(p.larynx.zones).toEqual({ l_cord: "fixed" });
    expect(p.neck.marks).toEqual([{ kind: "mass", x: 50, y: 58 }]);
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
    const p = sketchPresets({ thr_tonsil: ["Congested", "Pus in crypts", "Membrane"], thr_ppw: "Bulge", thr_cords: "Nodule", thr_neck: "Midline swelling" });
    for (const id of ["oropharynx", "larynx", "neck"] as const) {
      const svg = sketchSvg(id, applySketchPreset(id, undefined, { zones: {}, marks: [] }, p[id]));
      expect(sanitizeSvg(svg)).toBe(svg);
    }
  });
});
