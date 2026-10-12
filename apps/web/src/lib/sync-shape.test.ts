import { describe, expect, it } from "vitest";
import { normalizeEtag, rowsFromBundle, shapeCell, shapeRow } from "./sync-shape";

describe("shapeCell", () => {
  it("maps postgres values onto sqlite types", () => {
    expect(shapeCell(null)).toBeNull();
    expect(shapeCell(true)).toBe(1);
    expect(shapeCell(false)).toBe(0);
    expect(shapeCell(new Date("2026-10-12T00:00:00.000Z"))).toBe("2026-10-12T00:00:00.000Z");
    expect(shapeCell({ a: 1 })).toBe('{"a":1}');
    expect(shapeCell(["penicillin"])).toBe('["penicillin"]');
    expect(shapeCell("2026-10-12")).toBe("2026-10-12");
  });
});

describe("shapeRow", () => {
  it("keeps client columns and coerces integers", () => {
    const row = shapeRow("complaint", { id: "abc", specialty_code: "ent", sort_order: "2", name: "Fever", name_bn: null, extra: "no" });
    expect(row).toEqual({ id: "abc", specialty_code: "ent", sort_order: 2, name: "Fever", name_bn: null });
  });

  it("drops a row without an id", () => {
    expect(shapeRow("company", { name: "Acme" })).toBeNull();
  });
});

describe("rowsFromBundle", () => {
  it("reads a json array and a json string", () => {
    expect(rowsFromBundle("company", [{ id: "1", name: "Acme" }])).toEqual([{ id: "1", name: "Acme" }]);
    expect(rowsFromBundle("company", JSON.stringify([{ id: "2", name: "Beta" }]))).toEqual([{ id: "2", name: "Beta" }]);
    expect(rowsFromBundle("company", null)).toEqual([]);
    expect(rowsFromBundle("company", "not-json")).toEqual([]);
  });
});

describe("normalizeEtag", () => {
  it("strips quotes and the weak validator", () => {
    expect(normalizeEtag('"abc"')).toBe("abc");
    expect(normalizeEtag('W/"abc"')).toBe("abc");
    expect(normalizeEtag(null)).toBeNull();
    expect(normalizeEtag("  ")).toBeNull();
  });
});
