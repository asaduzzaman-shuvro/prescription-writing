import { describe, expect, it } from "vitest";
import { historyHas, toggleHistoryPick } from "../src/history-picks";

describe("toggleHistoryPick", () => {
  it("adds picks with commas", () => {
    let h = toggleHistoryPick("", "DM");
    expect(h).toBe("DM");
    h = toggleHistoryPick(h, "HTN");
    h = toggleHistoryPick(h, "BA");
    expect(h).toBe("DM, HTN, BA");
  });

  it("removes a pick and keeps the rest", () => {
    expect(toggleHistoryPick("DM, HTN, BA", "HTN")).toBe("DM, BA");
    expect(toggleHistoryPick("DM, HTN, BA", "DM")).toBe("HTN, BA");
    expect(toggleHistoryPick("DM", "DM")).toBe("");
    expect(toggleHistoryPick("dm, HTN", "DM")).toBe("HTN");
  });

  it("keeps what the doctor wrote, adding picks to the first line", () => {
    expect(toggleHistoryPick("DM, HTN\nOn insulin for 5 yrs", "BA")).toBe("DM, HTN, BA\nOn insulin for 5 yrs");
    expect(toggleHistoryPick("On insulin", "DM")).toBe("On insulin, DM");
    expect(toggleHistoryPick("DM,", "HTN")).toBe("DM, HTN");
    expect(toggleHistoryPick("\nFather has DM", "HTN")).toBe("HTN\nFather has DM");
  });

  it("removes only a whole item, never part of a sentence", () => {
    expect(toggleHistoryPick("DM, HTN\nFather has DM", "DM")).toBe("HTN\nFather has DM");
    expect(toggleHistoryPick("Smoker\nStopped 2 yrs ago", "Smoker")).toBe("Stopped 2 yrs ago");
  });
});

describe("historyHas", () => {
  it("matches whole items only", () => {
    expect(historyHas("DM, HTN", "HTN")).toBe(true);
    expect(historyHas("DM, HTN\nBA", "BA")).toBe(true);
    expect(historyHas("Father has DM", "DM")).toBe(false);
    expect(historyHas("", "DM")).toBe(false);
  });
});
