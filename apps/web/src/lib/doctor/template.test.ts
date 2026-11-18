import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  classifyTemplatePayload,
  clearTemplate,
  emptyDoc,
  templateKindLabel,
  templatePayloadEmpty,
  templatePayloadFromDoc,
  templatePayloadFromParts,
  type TemplatePayload,
} from "./data";
import type { RxItem } from "@rx/core";

const sampleItem = {
  id: "m1",
  productId: null,
  brandName: "Napa",
  genericName: "paracetamol",
  form: "Tab",
  route: "oral",
  doseUnit: "tab",
  isAntibiotic: false,
  frequency: { kind: "pattern", slots: [1, 0, 1] },
  timing: "after_food",
  duration: { kind: "fixed", value: 3, unit: "day" },
} as RxItem;

describe("template payload helpers", () => {
  it("classifies clinical / medicine / both including history and exam", () => {
    expect(classifyTemplatePayload({ diagnoses: ["Otitis"] })).toBe("clinical");
    expect(classifyTemplatePayload({ history: "DM, HTN" })).toBe("clinical");
    expect(classifyTemplatePayload({ examFindings: { ear_tm_r: "intact" } })).toBe("clinical");
    expect(classifyTemplatePayload({ items: [sampleItem] })).toBe("medicine");
    expect(
      classifyTemplatePayload({ diagnoses: ["Otitis"], items: [sampleItem] }),
    ).toBe("both");
    expect(classifyTemplatePayload({})).toBe("empty");
    expect(templateKindLabel("clinical")).toBe("Clinical");
  });

  it("builds kind-scoped payloads from a prescription including full clinical", () => {
    const doc = {
      ...emptyDoc(),
      chiefComplaints: ["Fever"],
      diagnoses: ["Pharyngitis"],
      investigations: ["CBC"],
      history: "DM",
      plan: ["Review"],
      notes: ["H/O PNA"],
      oeFindings: [{ label: "Pulse", value: "Normal" }],
      items: [sampleItem],
      advice: ["গার্গল"],
      followUp: { kind: "after" as const, value: 7, unit: "day" as const },
    };
    const clinical = templatePayloadFromDoc(doc, "clinical", { ear: "ok" });
    expect(clinical.chiefComplaints).toEqual(["Fever"]);
    expect(clinical.history).toBe("DM");
    expect(clinical.plan).toEqual(["Review"]);
    expect(clinical.notes).toEqual(["H/O PNA"]);
    expect(clinical.oeFindings).toEqual([{ label: "Pulse", value: "Normal" }]);
    expect(clinical.examFindings).toEqual({ ear: "ok" });
    expect(clinical.items).toBeUndefined();

    const med = templatePayloadFromDoc(doc, "medicine");
    expect(med.items).toHaveLength(1);
    expect(med.advice).toEqual(["গার্গল"]);
    expect(med.chiefComplaints).toBeUndefined();
  });

  it("omits the other section when saving from the Templates form", () => {
    const clinical = templatePayloadFromParts("clinical", {
      chiefComplaints: ["Fever"],
      investigations: [],
      diagnoses: ["Pharyngitis"],
      history: "COPD",
      oeFindings: [],
      specialtyFindings: [],
      diagrams: [],
      plan: [],
      notes: [],
      examFindings: {},
      items: [sampleItem],
      advice: ["ignore"],
      followUp: { kind: "none" },
    });
    expect(clinical.history).toBe("COPD");
    expect(clinical.items).toBeUndefined();
    expect(templatePayloadEmpty(clinical)).toBe(false);
  });

  it("applies clinical fields including history/plan without wiping medicines", () => {
    const base = {
      ...emptyDoc(),
      chiefComplaints: ["Old"],
      diagnoses: ["Old dx"],
      history: "Old hx",
      items: [sampleItem],
      advice: ["Old advice"],
    };
    const clinicalOnly: TemplatePayload = {
      chiefComplaints: ["Fever"],
      diagnoses: ["Pharyngitis"],
      investigations: ["CBC"],
      history: "DM, HTN",
      plan: ["Review with reports"],
      notes: ["note"],
    };
    const next = applyTemplate(base, clinicalOnly);
    expect(next.chiefComplaints).toEqual(["Fever"]);
    expect(next.history).toBe("DM, HTN");
    expect(next.plan).toEqual(["Review with reports"]);
    expect(next.notes).toEqual(["note"]);
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.brandName).toBe("Napa");
    expect(next.advice).toEqual(["Old advice"]);
  });

  it("clears template-owned fields with clearTemplate", () => {
    const cleared = clearTemplate({
      ...emptyDoc(),
      chiefComplaints: ["Fever"],
      history: "DM",
      plan: ["x"],
      items: [sampleItem],
      advice: ["x"],
      followUp: { kind: "after", value: 5, unit: "day" },
      referredBy: "Dr. A",
    });
    expect(cleared.chiefComplaints).toEqual([]);
    expect(cleared.history).toBeUndefined();
    expect(cleared.plan).toEqual([]);
    expect(cleared.items).toEqual([]);
    expect(cleared.advice).toEqual([]);
    expect(cleared.followUp).toEqual({ kind: "none" });
    expect(cleared.referredBy).toBe("Dr. A");
  });
});
