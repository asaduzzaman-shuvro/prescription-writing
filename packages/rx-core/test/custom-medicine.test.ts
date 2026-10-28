import { describe, expect, it } from "vitest";
import { customMedicineGenericIds, customMedicineProblem } from "../src/custom-medicine";

const FORM = "0b6f3c1e-9a43-4a5e-8f43-2f1f6f0f7c11";
const GEN = "6a1d5a52-7c8e-4f0b-a0a4-5d5c6a7c8e90";

const row = (over: Record<string, unknown> = {}) => ({ brand_name: "Napa Extra", form_id: FORM, generic_ids: [GEN], ...over });

describe("customMedicineProblem", () => {
  it("accepts a picked generic or a typed one", () => {
    expect(customMedicineProblem(row())).toBeNull();
    expect(customMedicineProblem(row({ generic_ids: JSON.stringify([GEN]) }))).toBeNull();
    expect(customMedicineProblem(row({ generic_ids: "[]", generic_text: "Paracetamol + Caffeine" }))).toBeNull();
  });

  it("requires a brand, a form and a generic", () => {
    expect(customMedicineProblem(row({ brand_name: "  " }))).toBe("brand name is required");
    expect(customMedicineProblem(row({ form_id: null }))).toBe("form is required");
    expect(customMedicineProblem(row({ generic_ids: [], generic_text: " " }))).toBe("generic is required");
  });

  it("rejects malformed ids and over-long text", () => {
    expect(customMedicineProblem(row({ form_id: "tab" }))).toBe("invalid form");
    expect(customMedicineProblem(row({ company_id: "acme" }))).toBe("invalid company");
    expect(customMedicineProblem(row({ generic_ids: ["x"] }))).toBe("invalid generics");
    expect(customMedicineProblem(row({ generic_ids: "{bad" }))).toBe("invalid generics");
    expect(customMedicineProblem(row({ generic_ids: Array(9).fill(GEN) }))).toBe("at most 8 generics");
    expect(customMedicineProblem(row({ brand_name: "x".repeat(121) }))).toBe("brand name is too long (max 120)");
    expect(customMedicineProblem(row({ strength_text: 500 }))).toBe("strength must be text");
  });
});

describe("customMedicineGenericIds", () => {
  it("reads arrays, JSON strings and empty values", () => {
    expect(customMedicineGenericIds([GEN])).toEqual([GEN]);
    expect(customMedicineGenericIds(`["${GEN}"]`)).toEqual([GEN]);
    expect(customMedicineGenericIds(null)).toEqual([]);
    expect(customMedicineGenericIds("{x")).toBeNull();
    expect(customMedicineGenericIds([1])).toBeNull();
  });
});
