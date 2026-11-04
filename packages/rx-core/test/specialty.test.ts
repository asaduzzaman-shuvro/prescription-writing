import { describe, expect, it } from "vitest";
import { airBoneGap, applyTmPreset, audiogramSvg, pruneSubFields, subFieldShown, withSubFieldParents, EARDRUM_LIMITS, EARDRUM_MARKS, eardrumSvg, ENT_TEMPLATE, normalizeEardrum, flattenFindings, hearingGrade, perforationBlocked, ptaAverage, resetTmMap, sanitizeSvg, syncTmMap, TM_LOOKS, tmPreset, validateTemplateSchema } from "../src";

describe("ENT template", () => {
  it("is a valid schema", () => {
    expect(validateTemplateSchema(ENT_TEMPLATE)).toEqual([]);
  });
  it("rejects broken schemas", () => {
    expect(validateTemplateSchema({})).toEqual(["root must be { sections: [...] }"]);
    expect(
      validateTemplateSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", label: "X", type: "select" }, { id: "x", label: "Y", type: "bogus" }] }] }),
    ).toEqual(["field x: options required for select", 'duplicate field id "x"', 'field x: unknown type "bogus"']);
    const grouped = (groups: (string | undefined)[]) =>
      validateTemplateSchema({ sections: [{ id: "s", title: "S", fields: groups.map((group, i) => ({ id: `f${i}`, label: "F", type: "text" as const, group })) }] });
    expect(grouped(["TFT", "TFT", undefined])).toEqual([]);
    expect(grouped([" "])).toEqual(["field f0: group must be a non-empty name"]);
    expect(grouped(["A", "B", "A"])).toEqual(['field f2: group "A" must be next to its other fields']);
  });
});

describe("audiology", () => {
  const right = { ac: { 250: 40, 500: 40, 1000: 45, 2000: 50, 4000: 55, 8000: 60 }, bc: { 500: 10, 1000: 15, 2000: 20 } };
  it("computes PTA, grade and air-bone gap", () => {
    expect(ptaAverage(right)).toBe(47.5);
    expect(hearingGrade(47.5)).toBe("Moderate");
    expect(hearingGrade(10)).toBe("Normal");
    expect(airBoneGap(right)).toBe(30);
    expect(ptaAverage({ ac: { 500: 10 }, bc: {} })).toBeNull();
  });
  it("draws an audiogram with right (O) and left (X) markers", () => {
    const svg = audiogramSvg({ right, left: { ac: { 500: 10, 1000: 10 }, bc: {} } });
    expect(svg).toContain("<circle");
    expect(svg).toContain('stroke="#00c"');
  });
});

describe("flattenFindings", () => {
  it("prints only abnormal answers, merges identical sides and adds diagrams", () => {
    const out = flattenFindings(ENT_TEMPLATE, {
      ear_pinna: { right: "Normal", left: "Normal" },
      ear_tm: { right: "Perforated", left: "Intact" },
      ear_tm_map: { right: { perforation: ["ai", "pi"], retraction: [] }, left: { perforation: [], retraction: [] } },
      ear_discharge: { right: "Mucopurulent", left: "None" },
      ear_weber: "Lateralised to right",
      nose_septum: "DNS to left",
      thr_tonsil_grade: { right: "Grade 3", left: "Grade 3" },
      aud_pta: { right: { ac: { 500: 40, 1000: 45, 2000: 50, 4000: 55 }, bc: { 500: 10, 1000: 15, 2000: 20 } } },
    });
    expect(out.groups.map((g) => g.title)).toEqual(["Ear", "Nose & PNS", "Throat", "Audiology"]);
    const ear = out.groups[0]!.lines;
    expect(ear).toContainEqual({ label: "TM", value: "R Perforated, L Intact" });
    expect(ear).toContainEqual({ label: "TM map", value: "R: perforation AI+PI", abovePictures: true });
    expect(ear).toContainEqual({ label: "Discharge", value: "R Mucopurulent" });
    expect(ear.find((l) => l.label === "Pinna / mastoid")).toBeUndefined();
    expect(out.groups[2]!.lines).toContainEqual({ label: "Tonsil (Brodsky)", value: "B/L Grade 3" });
    expect(out.groups[3]!.lines[0]!.value).toBe("R 47.5 dB (Moderate, A-B gap 30 dB)");
    expect(out.diagrams.map((d) => d.title)).toEqual(["Right TM", "Left TM", "Key", "Audiogram (O right, X left)"]);
  });
  it("prints several Pinna / mastoid findings, without Normal, and still reads an old single answer", () => {
    const pinna = (v: unknown) => flattenFindings(ENT_TEMPLATE, { ear_pinna: v }).groups[0]?.lines.find((l) => l.label === "Pinna / mastoid");
    expect(pinna({ right: ["Tender mastoid", "Swelling"], left: ["Normal"] })).toEqual({ label: "Pinna / mastoid", value: "R Tender mastoid, Swelling" });
    expect(pinna({ right: ["Swelling", "Post-aural scar"], left: ["Swelling", "Post-aural scar"] })).toEqual({ label: "Pinna / mastoid", value: "B/L Swelling, Post-aural scar" });
    expect(pinna({ right: "Swelling" })).toEqual({ label: "Pinna / mastoid", value: "R Swelling" });
    expect(pinna({ right: ["Normal"], left: ["Normal"] })).toBeUndefined();
  });
  it("prints several ear discharges, without None, and still reads an old single answer", () => {
    const discharge = (v: unknown) => flattenFindings(ENT_TEMPLATE, { ear_discharge: v }).groups[0]?.lines.find((l) => l.label === "Discharge");
    expect(discharge({ right: ["Mucopurulent", "Foul smelling"], left: ["None"] })).toEqual({ label: "Discharge", value: "R Mucopurulent, Foul smelling" });
    expect(discharge({ right: "Purulent" })).toEqual({ label: "Discharge", value: "R Purulent" });
    expect(discharge({ right: ["None"], left: ["None"] })).toBeUndefined();
  });
  it("prints the fistula test per ear, and an answer from before it was per ear", () => {
    const fistula = (v: unknown) => flattenFindings(ENT_TEMPLATE, { ear_fistula: v }).groups[0]?.lines.find((l) => l.label === "Fistula test");
    expect(fistula({ right: "Positive", left: "Negative" })).toEqual({ label: "Fistula test", value: "R Positive" });
    expect(fistula({ right: "Positive", left: "Positive" })).toEqual({ label: "Fistula test", value: "B/L Positive" });
    expect(fistula("Positive")).toEqual({ label: "Fistula test", value: "Positive" });
    expect(fistula({ right: "Negative", left: "Negative" })).toBeUndefined();
  });
  it("prints several nose findings per field, without Normal, None or Central, and still reads old single answers", () => {
    const nose = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "nose")?.lines ?? [];
    expect(nose({
      nose_external: ["Deviated", "Swelling"],
      nose_septum: ["DNS to left", "Spur left"],
      nose_turbinate: { right: ["Hypertrophied", "Congested"], left: ["Normal"] },
      nose_mucosa: ["Pale", "Crusting"],
      nose_discharge: { right: ["Mucoid", "Blood stained"], left: ["Mucoid", "Blood stained"] },
    })).toEqual([
      { label: "External nose", value: "Deviated, Swelling" },
      { label: "Septum", value: "DNS to left, Spur left" },
      { label: "Inferior turbinate", value: "R Hypertrophied, Congested" },
      { label: "Mucosa", value: "Pale, Crusting" },
      { label: "Nasal discharge", value: "B/L Mucoid, Blood stained" },
    ]);
    expect(nose({ nose_septum: ["Central"], nose_external: ["Normal"], nose_mucosa: ["Normal"], nose_discharge: { right: ["None"] } })).toEqual([]);
    expect(nose({ nose_septum: "DNS to right", nose_discharge: { left: "Watery" } })).toEqual([
      { label: "Septum", value: "DNS to right" },
      { label: "Nasal discharge", value: "L Watery" },
    ]);
  });
  it("lists Cottle's test right after Sinus tenderness, on screen and in print", () => {
    const ids = ENT_TEMPLATE.sections.find((x) => x.id === "nose")!.fields.map((f) => f.id);
    expect(ids.indexOf("nose_cottle")).toBe(ids.indexOf("nose_sinus_tender") + 1);
    const lines = flattenFindings(ENT_TEMPLATE, { nose_cottle: { right: "Positive" }, nose_sinus_tender: ["Maxillary"] }).groups[0]!.lines;
    expect(lines.map((l) => l.label)).toEqual(["Sinus tenderness", "Cottle's test"]);
  });
  it("prints the grouped tuning fork tests as their own lines", () => {
    const ear = flattenFindings(ENT_TEMPLATE, { ear_rinne: { right: "−ve", left: "+ve" }, ear_weber: "Lateralised to right", ear_abc: { right: "Reduced" } }).groups[0]!.lines;
    expect(ear).toEqual([{ label: "Rinne", value: "R −ve, L +ve" }, { label: "Weber", value: "Lateralised to right" }, { label: "ABC", value: "R Reduced" }]);
  });
  it("prints the perforation and its size as one line", () => {
    const ear = flattenFindings(ENT_TEMPLATE, { ear_perf_type: { right: "Central (small)" } }).groups[0]!.lines;
    expect(ear).toContainEqual({ label: "Perforation", value: "R Central (small)" });
    expect(ear.find((l) => l.label === "Perforation size")).toBeUndefined();
  });
  it("prints several Oral cavity findings, without Normal, and still reads an old single answer", () => {
    const oral = (v: unknown) => flattenFindings(ENT_TEMPLATE, { thr_oral: v }).groups.find((g) => g.id === "throat")?.lines.find((l) => l.label === "Oral cavity");
    expect(oral(["Ulcer", "Dental caries"])).toEqual({ label: "Oral cavity", value: "Ulcer, Dental caries" });
    expect(oral("Trismus")).toEqual({ label: "Oral cavity", value: "Trismus" });
    expect(oral(["Normal"])).toBeUndefined();
    expect(oral("Normal")).toBeUndefined();
    expect(oral(["Mass", "Growth"])).toEqual({ label: "Oral cavity", value: "Mass, Growth" });
  });
  it("prints the doctor's own Oral cavity words after Other, and drops them with Other", () => {
    const line = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "throat")?.lines.find((l) => l.label === "Oral cavity");
    const f = { thr_oral: ["Ulcer", "Other"], thr_oral_other: "Leukoplakia on buccal mucosa" };
    expect(line(f)).toEqual({ label: "Oral cavity", value: "Ulcer, Other (Leukoplakia on buccal mucosa)" });
    expect(line({ ...f, thr_oral: ["Ulcer"] })).toEqual({ label: "Oral cavity", value: "Ulcer" });
    expect(pruneSubFields(ENT_TEMPLATE, { ...f, thr_oral: ["Ulcer"] }).thr_oral_other).toBeUndefined();
  });
  it("prints the Ulcer description after Ulcer, and drops it with Ulcer", () => {
    const line = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "throat")?.lines.find((l) => l.label === "Oral cavity");
    const f = { thr_oral: ["Ulcer", "Dental caries"], thr_oral_ulcer: "Aphthous, 3 mm, lower lip" };
    expect(line(f)).toEqual({ label: "Oral cavity", value: "Ulcer (Aphthous, 3 mm, lower lip), Dental caries" });
    expect(line({ ...f, thr_oral: ["Dental caries"] })).toEqual({ label: "Oral cavity", value: "Dental caries" });
    expect(pruneSubFields(ENT_TEMPLATE, { ...f, thr_oral: ["Dental caries"] }).thr_oral_ulcer).toBeUndefined();
  });
  it("prints several Posterior pharyngeal wall findings with the Growth/Mass description, and drops it with the option", () => {
    const line = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "throat")?.lines.find((l) => l.label === "Posterior pharyngeal wall");
    const f = { thr_ppw: ["Granular", "Growth/Mass"], thr_ppw_growth: "Left lateral wall, 1.5 cm, friable" };
    expect(line(f)).toEqual({ label: "Posterior pharyngeal wall", value: "Granular, Growth/Mass (Left lateral wall, 1.5 cm, friable)" });
    expect(line({ thr_ppw: "Post-nasal drip" })).toEqual({ label: "Posterior pharyngeal wall", value: "Post-nasal drip" });
    expect(line({ thr_ppw: ["Normal"] })).toBeUndefined();
    expect(pruneSubFields(ENT_TEMPLATE, { ...f, thr_ppw: ["Granular"] }).thr_ppw_growth).toBeUndefined();
  });
  it("prints Mass and Growth descriptions after their options, in tick order", () => {
    const line = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "throat")?.lines.find((l) => l.label === "Oral cavity");
    const f = { thr_oral: ["Growth", "Mass"], thr_oral_mass: "Hard palate, 1 cm", thr_oral_growth: "Lateral tongue, ulcero-proliferative" };
    expect(line(f)).toEqual({ label: "Oral cavity", value: "Growth (Lateral tongue, ulcero-proliferative), Mass (Hard palate, 1 cm)" });
    const pruned = pruneSubFields(ENT_TEMPLATE, { ...f, thr_oral: ["Mass"] });
    expect(pruned.thr_oral_mass).toBe("Hard palate, 1 cm");
    expect(pruned.thr_oral_growth).toBeUndefined();
  });
  it("mirrors the left eardrum", () => {
    expect(eardrumSvg(undefined, "left")).toContain("scale(-1,1)");
    expect(eardrumSvg({ perforation: ["ai"], retraction: [] }, "right")).toContain('fill="#111"');
  });
});

describe("TM map symbols and drawing", () => {
  const all = EARDRUM_MARKS.map((kind, i) => ({ kind, x: 30 + i * 6, y: 40 }));

  it("draws every symbol, bulging and free-hand strokes inside the (mirrored) drum", () => {
    const svg = eardrumSvg({ perforation: [], retraction: [], marks: all, bulging: true, strokes: ["20,30 25,35 30,32"] }, "left");
    const inner = svg.slice(svg.indexOf("<g transform"), svg.indexOf("</g>"));
    expect(inner).toContain('<polyline points="20,30 25,35 30,32"');
    expect(inner).toContain('fill="url(#stipple)"'); // tympanosclerosis
    expect(inner).toContain('stroke-dasharray="2.5 1.5"'); // fluid level
    expect(inner).toContain('r="7"'); // graft
    expect(inner.match(/x2="9\d(\.\d)?"/)).not.toBeNull(); // bulging ticks reach past the rim
    expect(svg).toContain('<pattern id="stipple"');
    expect(inner).not.toContain("<text"); // nothing that would print mirrored
  });

  it("cleans untrusted values: unknown kinds, NaN, out-of-range coordinates and limits", () => {
    const v = normalizeEardrum({
      perforation: ["ai", "nope"],
      marks: [{ kind: "grommet", x: 150, y: -5 }, { kind: "bomb", x: 1, y: 1 }, { kind: "graft", x: Number.NaN, y: 2 }],
      strokes: ["1,1 2,2", "x,y 3,3", "5,5", 7, "0,0 120,-3"],
      bulging: "yes",
    });
    expect(v.perforation).toEqual(["ai"]);
    expect(v.marks).toEqual([{ kind: "grommet", x: 100, y: 0 }]);
    expect(v.strokes).toEqual(["1,1 2,2", "0,0 100,0"]);
    expect(v.bulging).toBe(false);
    const many = normalizeEardrum({ marks: Array.from({ length: 50 }, () => ({ kind: "grommet", x: 5, y: 5 })), strokes: Array.from({ length: 100 }, () => "1,1 2,2") });
    expect(many.marks).toHaveLength(EARDRUM_LIMITS.marks);
    expect(many.strokes).toHaveLength(EARDRUM_LIMITS.strokes);
    const long = normalizeEardrum({ strokes: [Array.from({ length: 3000 }, (_, i) => `${i % 100},5`).join(" ")] });
    expect(long.strokes[0]!.split(" ")).toHaveLength(EARDRUM_LIMITS.points);
  });

  it("words the findings and adds a key for whatever is drawn", () => {
    const out = flattenFindings(ENT_TEMPLATE, {
      ear_tm_map: {
        right: { perforation: ["ai"], retraction: [], marks: [{ kind: "grommet", x: 40, y: 50 }], strokes: ["10,10 20,20"] },
        left: { perforation: [], retraction: [], bulging: true, marks: [{ kind: "fluid", x: 50, y: 70 }] },
      },
    });
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "R: perforation AI; grommet; drawing · L: fluid level; bulging", abovePictures: true });
    expect(out.diagrams.map((d) => d.kind)).toEqual(["tm", "tm", "tm-legend"]);
    const key = out.diagrams[2]!.svg;
    for (const label of ["Perforation", "Grommet", "Fluid level", "Bulging"]) expect(key).toContain(`>${label}</text>`);
    expect(key).not.toContain("Retraction");

    const plain = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { right: { perforation: ["ai"], retraction: ["ps"] } } });
    expect(plain.diagrams.map((d) => d.kind)).toEqual(["tm", "tm", "tm-legend"]);
    for (const label of ["Perforation", "Retraction"]) expect(plain.diagrams[2]!.svg).toContain(`>${label}</text>`);
  });

  it("prints drums for a drawing alone", () => {
    const out = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { left: { perforation: [], retraction: [], strokes: ["10,10 20,20"] } } });
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "L: drawing", abovePictures: true });
    expect(out.diagrams).toHaveLength(2);
  });
});

describe("TM answer draws on the TM map", () => {
  it("maps every TM option, and perforation type/size", () => {
    expect(tmPreset("Intact")).toEqual({ look: "intact" });
    expect(tmPreset("Intact (Normal)")).toEqual({ look: "intact" });
    expect(tmPreset("Retracted")).toEqual({ retraction: ["as", "ai", "ps", "pi"] });
    expect(tmPreset("Bulging")).toEqual({ bulging: true });
    expect(tmPreset("Congested")).toEqual({ look: "congested" });
    expect(tmPreset("Dull")).toEqual({ look: "dull" });
    expect(tmPreset("Not visible")).toEqual({ look: "hidden" });
    expect(tmPreset("Perforated")).toEqual({ disc: "medium" });
    expect(tmPreset("Perforated", "Central", "Large")).toEqual({ disc: "large" });
    expect(tmPreset("Perforated", "Central (small)")).toEqual({ disc: "small" });
    expect(tmPreset("Perforated", "Central (large)")).toEqual({ disc: "large" });
    expect(tmPreset("Perforated", "Central")).toEqual({ disc: "medium" });
    expect(tmPreset("Perforated", "Central (subtotal)")).toEqual({ perforation: ["as", "ai", "ps", "pi"] });
    expect(tmPreset("Perforated", "Subtotal")).toEqual({ perforation: ["as", "ai", "ps", "pi"] });
    expect(tmPreset("Perforated", "Total")).toEqual({ perforation: ["attic", "as", "ai", "ps", "pi"] });
    expect(tmPreset("Perforated", "Attic")).toEqual({ perforation: ["attic"] });
    expect(tmPreset("Perforated", "Marginal")).toEqual({ perforation: ["ps"] });
    expect(tmPreset(undefined)).toEqual({});
    expect(tmPreset("Renamed by admin")).toEqual({});
  });

  it("swaps the old picture for the new one and keeps the doctor's marks and strokes", () => {
    const mine = { marks: [{ kind: "grommet" as const, x: 40, y: 50 }], strokes: ["10,10 20,20"] };
    const perforated = applyTmPreset({ perforation: ["attic"], retraction: [], ...mine }, {}, tmPreset("Perforated", "Subtotal"));
    expect(perforated.perforation).toEqual(["attic", "as", "ai", "ps", "pi"]);
    const retracted = applyTmPreset(perforated, tmPreset("Perforated", "Subtotal"), tmPreset("Retracted"));
    expect(retracted).toMatchObject({ perforation: ["attic"], retraction: ["as", "ai", "ps", "pi"], ...mine, bulging: false });
    const congested = applyTmPreset({ ...retracted, bulging: true }, tmPreset("Retracted"), tmPreset("Congested"));
    expect(congested).toMatchObject({ perforation: ["attic"], retraction: [], bulging: true, look: "congested" });
    const cleared = applyTmPreset(congested, tmPreset("Congested"), {});
    expect(cleared.look).toBeUndefined();
    expect(applyTmPreset({ perforation: [], retraction: [], bulging: true }, tmPreset("Bulging"), tmPreset("Dull")).bulging).toBe(false);
  });

  it("redraws only the ear whose answers changed", () => {
    const prev = { ear_tm: { right: "Intact", left: "Dull" }, ear_tm_map: { left: { perforation: [], retraction: [], look: "dull", strokes: ["1,1 2,2"] } } };
    const next = syncTmMap(ENT_TEMPLATE, prev, { ...prev, ear_tm: { right: "Perforated", left: "Dull" } });
    expect(next.ear_tm_map).toEqual({ right: { perforation: [], retraction: [], marks: [], strokes: [], bulging: false, disc: "medium" }, left: prev.ear_tm_map.left });
    const sized = syncTmMap(ENT_TEMPLATE, next, { ...next, ear_perf_type: { right: "Central (small)" } });
    expect((sized.ear_tm_map as { right: { disc: string } }).right.disc).toBe("small");
    // Same picture: the doctor's edits are left alone.
    const edited = { ...prev, ear_tm: { right: "Retracted" }, ear_tm_map: { right: { perforation: [], retraction: ["ai"] } } };
    expect(syncTmMap(ENT_TEMPLATE, edited, { ...edited, ear_perf_type: { right: "Central (large)" } })).toEqual({ ...edited, ear_perf_type: { right: "Central (large)" } });
    // Picking a perforation for an ear with no TM answer sets it to Perforated (only that ear), so it draws.
    const left = syncTmMap(ENT_TEMPLATE, { ear_tm: { right: "Intact" } }, { ear_tm: { right: "Intact" }, ear_perf_type: { left: "Central (subtotal)" } });
    expect(left.ear_tm).toEqual({ right: "Intact", left: "Perforated" });
    expect((left.ear_tm_map as { left: { perforation: string[] } }).left.perforation).toEqual(["as", "ai", "ps", "pi"]);
    expect((left.ear_tm_map as { right?: unknown }).right).toBeUndefined();
    // An intact TM blocks and clears that ear's Perforation, and only that ear's.
    const intact = syncTmMap(ENT_TEMPLATE, left, { ...left, ear_tm: { right: "Intact (Normal)", left: "Perforated" }, ear_perf_type: { right: "Central (small)", left: "Central (subtotal)" } });
    expect(intact.ear_perf_type).toEqual({ right: undefined, left: "Central (subtotal)" });
    expect(perforationBlocked(intact, "right")).toBe(true);
    expect(perforationBlocked(intact, "left")).toBe(false);
    expect(perforationBlocked({ ear_tm: { left: "Intact" } }, "left")).toBe(true);
    // Reset sets both TMs to Intact (Normal), redraws both maps as that, and clears Perforation; other fields stay.
    const full = { ear_tm: { right: "Perforated" }, ear_perf_type: { right: "Central (small)" }, ear_perf_size: { left: "Large" }, ear_tm_map: left.ear_tm_map, ear_weber: "Central" };
    const normalDrum = { perforation: [], retraction: [], marks: [], strokes: [], bulging: false, look: "intact" };
    expect(resetTmMap(full)).toEqual({ ear_tm: { right: "Intact (Normal)", left: "Intact (Normal)" }, ear_tm_map: { right: normalDrum, left: normalDrum }, ear_weber: "Central" });
    // The next TM answer swaps out the normal picture as usual.
    const reset = resetTmMap(full);
    const bulging = syncTmMap(ENT_TEMPLATE, reset, { ...reset, ear_tm: { right: "Bulging", left: "Intact (Normal)" } });
    expect((bulging.ear_tm_map as { right: { look?: string; bulging: boolean } }).right).toMatchObject({ bulging: true });
    expect((bulging.ear_tm_map as { right: { look?: string } }).right.look).toBeUndefined();
    // Templates without a TM map are untouched.
    const eye = { sections: [{ id: "x", title: "X", fields: [{ id: "ear_tm", label: "TM", type: "select" as const, lateral: true, options: ["Intact"] }] }] };
    const f = { ear_tm: { right: "Intact" } };
    expect(syncTmMap(eye, {}, f)).toBe(f);
  });

  it("draws each look and the central perforation, cleans bad values, and survives the sanitiser", () => {
    for (const look of TM_LOOKS) {
      const svg = eardrumSvg({ perforation: [], retraction: [], look, disc: "large" }, "left");
      expect(sanitizeSvg(svg)).toBe(svg);
      expect(svg.slice(svg.indexOf("<g transform"), svg.indexOf("</g>"))).not.toContain("<text");
    }
    expect(eardrumSvg({ perforation: [], retraction: [], look: "hidden" }, "right")).toContain('fill="#bbb"');
    expect(eardrumSvg({ perforation: [], retraction: [], disc: "small" }, "right")).toContain('r="7" fill="#111"');
    const bad = normalizeEardrum({ look: "<script>", disc: "huge" });
    expect(bad.look).toBeUndefined();
    expect(bad.disc).toBeUndefined();
  });

  it("prints the central perforation in words, and prints drums for an appearance alone", () => {
    const out = flattenFindings(ENT_TEMPLATE, { ear_tm: { right: "Perforated", left: "Dull" }, ear_tm_map: { right: { perforation: [], retraction: [], disc: "medium" }, left: { perforation: [], retraction: [], look: "dull" } } });
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "R: central perforation (medium)", abovePictures: true });
    expect(out.diagrams.map((d) => d.kind)).toEqual(["tm", "tm", "tm-legend"]);
    const lookOnly = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { left: { perforation: [], retraction: [], look: "hidden" } } });
    expect(lookOnly.groups).toEqual([{ id: "ear", title: "Ear", lines: [] }]); // a heading for the drums
    expect(lookOnly.diagrams).toHaveLength(2); // and no key: the TM line names the appearance
  });
});

describe("sub-options shown under one option of another field (Polyp grades under Nasal cavity)", () => {
  const cavity = ENT_TEMPLATE.sections.find((x) => x.id === "nose")!.fields.find((f) => f.id === "nose_polyp")!;
  const noseLines = (f: Record<string, unknown>) => flattenFindings(ENT_TEMPLATE, f).groups.find((g) => g.id === "nose")?.lines ?? [];

  it("validates the parent: an earlier select field in the section, a real option, the same right/left-ness", () => {
    const tpl = (fields: object[]) => ({ sections: [{ id: "s", title: "S", fields }] });
    const parent = { id: "p", label: "P", type: "multiselect", lateral: true, options: ["A", "B"] };
    expect(validateTemplateSchema(tpl([parent, { id: "c", label: "C", type: "select", lateral: true, options: ["x"], parent: { field: "p", option: "A" } }]))).toEqual([]);
    expect(validateTemplateSchema(tpl([{ id: "c", label: "C", type: "select", lateral: true, options: ["x"], parent: { field: "p", option: "A" } }, parent]))).toEqual(['field c: parent "p" must be an earlier field in section s']);
    expect(validateTemplateSchema(tpl([parent, { id: "c", label: "C", type: "select", lateral: true, options: ["x"], parent: { field: "p", option: "Z" } }]))).toEqual(['field c: parent option "Z" must be one of p\'s options']);
    expect(validateTemplateSchema(tpl([parent, { id: "c", label: "C", type: "select", options: ["x"], parent: { field: "p", option: "A" } }]))).toEqual(["field c: must be right/left exactly when its parent p is"]);
  });

  it("shows a sub-option only on the side whose parent answer includes its option", () => {
    const f = { nose_cavity: { right: ["Polyp", "Foreign body"], left: ["Nasal mass"] } };
    expect(subFieldShown(f, cavity, "right")).toBe(true);
    expect(subFieldShown(f, cavity, "left")).toBe(false);
    expect(subFieldShown({}, cavity, "right")).toBe(false);
  });

  it("prints the grade in brackets after Polyp, per side, merging identical sides", () => {
    expect(noseLines({ nose_cavity: { right: ["Polyp", "Foreign body"], left: ["Nasal mass"] }, nose_polyp: { right: "Present (grade 2)" } }))
      .toEqual([{ label: "Nasal cavity", value: "R Polyp (Present (grade 2)), Foreign body, L Nasal mass" }]);
    expect(noseLines({ nose_cavity: { right: ["Polyp"], left: ["Polyp"] }, nose_polyp: { right: "Antrochoanal", left: "Antrochoanal" } }))
      .toEqual([{ label: "Nasal cavity", value: "B/L Polyp (Antrochoanal)" }]);
    // Polyp ticked but not graded yet; a grade left behind on a side without Polyp isn't printed.
    expect(noseLines({ nose_cavity: { right: ["Polyp"], left: ["Foreign body"] }, nose_polyp: { left: "Present (grade 3)" } }))
      .toEqual([{ label: "Nasal cavity", value: "R Polyp, L Foreign body" }]);
  });

  it("prints the doctor's Nasal mass and Foreign body descriptions after them, and drops each with its option", () => {
    const f = { nose_cavity: { right: ["Nasal mass", "Polyp"], left: ["Foreign body"] }, nose_mass: { right: "Pedunculated, bleeds on touch", left: "left over" }, nose_polyp: { right: "Present (grade 1)" }, nose_fb: { left: "Button battery" } };
    expect(noseLines(f)).toEqual([{ label: "Nasal cavity", value: "R Nasal mass (Pedunculated, bleeds on touch), Polyp (Present (grade 1)), L Foreign body (Button battery)" }]); // in tick order
    expect(pruneSubFields(ENT_TEMPLATE, f).nose_mass).toEqual({ right: "Pedunculated, bleeds on touch", left: undefined });
    expect(pruneSubFields(ENT_TEMPLATE, { ...f, nose_cavity: { right: ["Polyp"] } }).nose_fb).toEqual({ left: undefined });
  });

  it("drops a grade when Polyp is unticked on that side, and only there", () => {
    const f = { nose_cavity: { right: ["Foreign body"], left: ["Polyp"] }, nose_polyp: { right: "Present (grade 1)", left: "Present (grade 2)" } };
    expect(pruneSubFields(ENT_TEMPLATE, f)).toEqual({ ...f, nose_polyp: { right: undefined, left: "Present (grade 2)" } });
    const kept = { nose_cavity: { right: ["Polyp"] }, nose_polyp: { right: "Present (grade 1)" } };
    expect(pruneSubFields(ENT_TEMPLATE, kept)).toBe(kept);
  });

  it("shows an old Polyp answer, saved before Nasal cavity existed, under a ticked Polyp", () => {
    const old = { nose_polyp: { right: "Present (grade 2)", left: "Absent" } };
    expect(withSubFieldParents(ENT_TEMPLATE, old)).toEqual({ ...old, nose_cavity: { right: ["Polyp"] } });
    expect(noseLines(old)).toEqual([{ label: "Nasal cavity", value: "R Polyp (Present (grade 2))" }]); // old "Absent" prints nothing
    // A side the doctor has already answered in Nasal cavity is left as it is.
    const answered = { nose_cavity: { right: ["Nasal mass"] }, nose_polyp: { right: "Present (grade 1)" } };
    expect(withSubFieldParents(ENT_TEMPLATE, answered)).toBe(answered);
  });
});
