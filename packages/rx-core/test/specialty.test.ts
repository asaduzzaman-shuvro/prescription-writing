import { describe, expect, it } from "vitest";
import { airBoneGap, applyTmPreset, audiogramSvg, EARDRUM_LIMITS, EARDRUM_MARKS, eardrumSvg, ENT_TEMPLATE, normalizeEardrum, flattenFindings, hearingGrade, ptaAverage, resetTmMap, sanitizeSvg, syncTmMap, TM_LOOKS, tmPreset, validateTemplateSchema } from "../src";

describe("ENT template", () => {
  it("is a valid schema", () => {
    expect(validateTemplateSchema(ENT_TEMPLATE)).toEqual([]);
  });
  it("rejects broken schemas", () => {
    expect(validateTemplateSchema({})).toEqual(["root must be { sections: [...] }"]);
    expect(
      validateTemplateSchema({ sections: [{ id: "a", title: "A", fields: [{ id: "x", label: "X", type: "select" }, { id: "x", label: "Y", type: "bogus" }] }] }),
    ).toEqual(["field x: options required for select", 'duplicate field id "x"', 'field x: unknown type "bogus"']);
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
    expect(out.groups.map((g) => g.title)).toEqual(["Ear", "Nose & PNS", "Throat & neck", "Audiology"]);
    const ear = out.groups[0]!.lines;
    expect(ear).toContainEqual({ label: "TM", value: "R Perforated, L Intact" });
    expect(ear).toContainEqual({ label: "TM map", value: "R: perforation AI+PI" });
    expect(ear).toContainEqual({ label: "Discharge", value: "R Mucopurulent" });
    expect(ear.find((l) => l.label === "Pinna / mastoid")).toBeUndefined();
    expect(out.groups[2]!.lines).toContainEqual({ label: "Tonsil (Brodsky)", value: "B/L Grade 3" });
    expect(out.groups[3]!.lines[0]!.value).toBe("R 47.5 dB (Moderate, A-B gap 30 dB)");
    expect(out.diagrams.map((d) => d.title)).toEqual(["Right TM", "Left TM", "Audiogram (O right, X left)"]);
  });
  it("prints several Pinna / mastoid findings, without Normal, and still reads an old single answer", () => {
    const pinna = (v: unknown) => flattenFindings(ENT_TEMPLATE, { ear_pinna: v }).groups[0]?.lines.find((l) => l.label === "Pinna / mastoid");
    expect(pinna({ right: ["Tender mastoid", "Swelling"], left: ["Normal"] })).toEqual({ label: "Pinna / mastoid", value: "R Tender mastoid, Swelling" });
    expect(pinna({ right: ["Swelling", "Post-aural scar"], left: ["Swelling", "Post-aural scar"] })).toEqual({ label: "Pinna / mastoid", value: "B/L Swelling, Post-aural scar" });
    expect(pinna({ right: "Swelling" })).toEqual({ label: "Pinna / mastoid", value: "R Swelling" });
    expect(pinna({ right: ["Normal"], left: ["Normal"] })).toBeUndefined();
  });
  it("prints the perforation and its size as one line", () => {
    const ear = flattenFindings(ENT_TEMPLATE, { ear_perf_type: { right: "Central (small)" } }).groups[0]!.lines;
    expect(ear).toContainEqual({ label: "Perforation", value: "R Central (small)" });
    expect(ear.find((l) => l.label === "Perforation size")).toBeUndefined();
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

  it("words the findings and adds a key only for the new symbols", () => {
    const out = flattenFindings(ENT_TEMPLATE, {
      ear_tm_map: {
        right: { perforation: ["ai"], retraction: [], marks: [{ kind: "grommet", x: 40, y: 50 }], strokes: ["10,10 20,20"] },
        left: { perforation: [], retraction: [], bulging: true, marks: [{ kind: "fluid", x: 50, y: 70 }] },
      },
    });
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "R: perforation AI; grommet; drawing · L: fluid level; bulging" });
    expect(out.diagrams.map((d) => d.kind)).toEqual(["tm", "tm", "tm-legend"]);
    const key = out.diagrams[2]!.svg;
    for (const label of ["Perforation", "Grommet", "Fluid level", "Bulging"]) expect(key).toContain(`>${label}</text>`);
    expect(key).not.toContain("Retraction");

    const plain = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { right: { perforation: ["ai"], retraction: ["ps"] } } });
    expect(plain.diagrams.map((d) => d.kind)).toEqual(["tm", "tm"]);
  });

  it("prints drums for a drawing alone", () => {
    const out = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { left: { perforation: [], retraction: [], strokes: ["10,10 20,20"] } } });
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "L: drawing" });
    expect(out.diagrams).toHaveLength(2);
  });
});

describe("TM answer draws on the TM map", () => {
  it("maps every TM option, and perforation type/size", () => {
    expect(tmPreset("Intact")).toEqual({ look: "intact" });
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
    // Reset empties both maps and the Perforation answers; TM answers and other fields stay.
    const full = { ear_tm: { right: "Perforated" }, ear_perf_type: { right: "Central (small)" }, ear_perf_size: { left: "Large" }, ear_tm_map: left.ear_tm_map, ear_weber: "Central" };
    expect(resetTmMap(full)).toEqual({ ear_tm: { right: "Perforated" }, ear_tm_map: {}, ear_weber: "Central" });
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
    expect(out.groups[0]!.lines).toContainEqual({ label: "TM map", value: "R: central perforation (medium)" });
    expect(out.diagrams.map((d) => d.kind)).toEqual(["tm", "tm"]);
    const lookOnly = flattenFindings(ENT_TEMPLATE, { ear_tm_map: { left: { perforation: [], retraction: [], look: "hidden" } } });
    expect(lookOnly.groups).toEqual([{ id: "ear", title: "Ear", lines: [] }]); // a heading for the drums
    expect(lookOnly.diagrams).toHaveLength(2);
  });
});
