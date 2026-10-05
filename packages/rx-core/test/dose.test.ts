import { describe, expect, it } from "vitest";
import {
  bmi,
  formatDuration,
  formatInstruction,
  parseDuration,
  parsePattern,
  parseShortcut,
  toBnDigits,
  toEnDigits,
  type RxItem,
} from "../src";

describe("parsePattern", () => {
  it("parses BD slot notation", () => {
    expect(parsePattern("1+0+1")).toEqual([1, 0, 1]);
    expect(parsePattern("½+0+½")).toEqual([0.5, 0, 0.5]);
    expect(parsePattern("1+1+1+1")).toEqual([1, 1, 1, 1]);
    expect(parsePattern("১+০+১")).toEqual([1, 0, 1]);
    expect(parsePattern(" 0 + 0 + 1 ")).toEqual([0, 0, 1]);
  });
  it("rejects non-patterns", () => {
    expect(parsePattern("1+0")).toBeNull();
    expect(parsePattern("tds")).toBeNull();
    expect(parsePattern("1+a+1")).toBeNull();
  });
});

describe("parseDuration", () => {
  it("parses shortcuts", () => {
    expect(parseDuration("5d")).toEqual({ kind: "fixed", value: 5, unit: "day" });
    expect(parseDuration("2w")).toEqual({ kind: "fixed", value: 2, unit: "week" });
    expect(parseDuration("1M")).toEqual({ kind: "fixed", value: 1, unit: "month" });
    expect(parseDuration("cont")).toEqual({ kind: "continue" });
    expect(parseDuration("৭d")).toEqual({ kind: "fixed", value: 7, unit: "day" });
    expect(parseDuration("x")).toBeNull();
  });
});

describe("parseShortcut", () => {
  it("parses a tablet line", () => {
    const r = parseShortcut("1+0+1 af 7d");
    expect(r.frequency).toEqual({ kind: "pattern", slots: [1, 0, 1] });
    expect(r.timing).toBe("after_food");
    expect(r.duration).toEqual({ kind: "fixed", value: 7, unit: "day" });
    expect(r.unknown).toEqual([]);
  });
  it("parses an ear-drop line", () => {
    const r = parseShortcut("2 drops tds re 5d");
    expect(r.doseQty).toBe(2);
    expect(r.doseUnit).toBe("drop");
    expect(r.frequency).toEqual({ kind: "times_per_day", times: 3 });
    expect(r.side).toBe("right");
    expect(r.duration).toEqual({ kind: "fixed", value: 5, unit: "day" });
  });
  it("keeps unknown tokens", () => {
    expect(parseShortcut("0+0+1 hs cont foo").unknown).toEqual(["foo"]);
  });
  it("parses q6h and sos", () => {
    expect(parseShortcut("q6h").frequency).toEqual({ kind: "every_hours", hours: 6 });
    expect(parseShortcut("sos").frequency).toEqual({ kind: "sos" });
  });
});

describe("formatting", () => {
  const tab: RxItem = {
    id: "1",
    brandName: "Napa",
    frequency: { kind: "pattern", slots: [1, 0, 1] },
    timing: "after_food",
    duration: { kind: "fixed", value: 7, unit: "day" },
  };
  it("formats a Bangla instruction with Bangla digits", () => {
    expect(formatInstruction(tab, "bn", "bn")).toBe("১+০+১ — খাবারের পরে — ৭ দিন");
  });
  it("formats an English instruction", () => {
    expect(formatInstruction(tab, "en", "en")).toBe("1+0+1 — after meal — 7 days");
  });
  it("formats ear drops with side", () => {
    const drop: RxItem = {
      id: "2",
      brandName: "Ciprocin",
      frequency: { kind: "times_per_day", times: 3 },
      doseQty: 2,
      doseUnit: "drop",
      route: "ear",
      side: "right",
      duration: { kind: "fixed", value: 5, unit: "day" },
    };
    expect(formatInstruction(drop, "bn", "bn")).toBe("২ ফোঁটা করে দিনে ৩ বার — ডান কানে — ৫ দিন");
    expect(formatInstruction(drop, "en", "en")).toBe("2 drop(s) 3 times daily — right ear — 5 days");
  });
  it("formats syrup spoon doses and continue", () => {
    const syp: RxItem = {
      id: "3",
      brandName: "Fexo",
      frequency: { kind: "pattern", slots: [0, 0, 1] },
      doseQty: 2,
      doseUnit: "tsf",
      duration: { kind: "continue" },
    };
    expect(formatInstruction(syp, "bn", "bn")).toBe("২ চামচ করে (০+০+১) — চলবে");
  });
  it("formats half tablets", () => {
    const half: RxItem = { ...tab, frequency: { kind: "pattern", slots: [0.5, 0, 0.5] }, timing: undefined };
    expect(formatInstruction(half, "bn", "bn")).toBe("½+০+½ — ৭ দিন");
  });
  it("singular english duration", () => {
    expect(formatDuration({ kind: "fixed", value: 1, unit: "month" }, "en", "en")).toBe("1 month");
  });
});

describe("helpers", () => {
  it("converts digits both ways", () => {
    expect(toBnDigits("1+0+1")).toBe("১+০+১");
    expect(toEnDigits("১২৩")).toBe("123");
  });
  it("computes BMI", () => {
    expect(bmi(68, 170)).toBe(23.5);
    expect(bmi(undefined, 170)).toBeNull();
  });
});
