import { describe, expect, it } from "vitest";
import { buildPlan, guessMapping, parseCsv, parsePacks, productKey, rowsToProducts, splitGenerics, splitStrength, type CatalogueSnapshot } from "../src/import";

describe("normalisers", () => {
  it("splits combination generics", () => {
    expect(splitGenerics("Paracetamol + Caffeine")).toEqual(["Paracetamol", "Caffeine"]);
    expect(splitGenerics("Multivitamin & Cod Liver Oil")).toEqual(["Multivitamin & Cod Liver Oil"]);
  });
  it("splits strengths with a liquid basis", () => {
    expect(splitStrength("(10 mg+30 mg+1.25 mg)/5 ml", 3)).toEqual([
      { strengthValue: 10, strengthUnit: "mg", basis: "5 ml" },
      { strengthValue: 30, strengthUnit: "mg", basis: "5 ml" },
      { strengthValue: 1.25, strengthUnit: "mg", basis: "5 ml" },
    ]);
    expect(splitStrength("250 mg/5 ml", 1)).toEqual([{ strengthValue: 250, strengthUnit: "mg", basis: "5 ml" }]);
    expect(splitStrength("20 mg+500 mg", 3)).toEqual([]);
  });
  it("parses MedEx pack text", () => {
    expect(parsePacks("Unit Price: ৳ 15.00,(20's pack: ৳ 300.00),")).toEqual([
      { description: "Unit Price", packSize: undefined, mrp: 15 },
      { description: "20's pack", packSize: "20", mrp: 300 },
    ]);
    expect(parsePacks("100 ml bottle: ৳ 40.12")).toEqual([{ description: "100 ml bottle", packSize: "100 ml", mrp: 40.12 }]);
  });
  it("builds case/space-insensitive keys", () => {
    expect(productKey({ company: "ACI ", brandName: "Napa", dosageForm: "Tablet", strengthText: "500 mg" })).toBe(
      productKey({ company: "aci", brandName: "NAPA", dosageForm: "tablet", strengthText: "500mg" }),
    );
  });
});

const CSV = `brand_name,generic,dosage_form,company,strength,dar_number,packs
Napa,Paracetamol,Tablet,Beximco,500 mg,,10's pack: 12
Napa,Paracetamol,Tablet,Beximco,500 mg,,10's pack: 12
Fexo,Fexofenadine,Tablet,Square,120 mg,DAR-1,
Ciprocin,Ciprofloxacin,Ear Drop,Square,0.3%,DAR-2,
,Paracetamol,Tablet,Beximco,,,
`;

function snapshot(): CatalogueSnapshot {
  return {
    companies: new Map([["square", "c1"]]),
    forms: new Map([["tablet", "f1"]]),
    generics: new Map([["fexofenadine", "g1"]]),
    products: [
      { id: "p1", brandName: "Fexo", formName: "Tablet", companyName: "Square", strengthText: "120 mg", darNumber: null, medicineSystem: "allopathic", isActive: true, genericText: "Fexofenadine", packs: [] },
      { id: "p2", brandName: "Other", formName: "Ear Drop", companyName: "Square", strengthText: "1%", darNumber: "DAR-2", medicineSystem: "allopathic", isActive: true, genericText: "X", packs: [] },
    ],
  };
}

describe("buildPlan", () => {
  const { headers, rows } = parseCsv(CSV);
  const { products, errors } = rowsToProducts(rows, guessMapping(headers));
  const plan = buildPlan(products, errors, snapshot());

  it("reports invalid rows", () => {
    expect(errors).toEqual([{ row: 6, message: "missing brand name" }]);
  });
  it("classifies new, changed, duplicate and DAR conflicts", () => {
    expect(plan.rows.map((r) => [r.product.row, r.kind])).toEqual([
      [2, "new"],
      [3, "conflict"],
      [4, "changed"],
      [5, "conflict"],
    ]);
    const changed = plan.rows.find((r) => r.kind === "changed");
    expect(changed?.kind === "changed" && changed.changes).toEqual([{ field: "darNumber", from: "", to: "DAR-1" }]);
    const darConflict = plan.rows[3];
    expect(darConflict?.kind === "conflict" && darConflict.reason).toMatch(/already belongs to "Other"/);
  });
  it("lists reference data to create", () => {
    expect(plan.newCompanies).toEqual(["Beximco"]);
    expect(plan.newGenerics).toEqual(["Paracetamol"]);
    expect(plan.summary).toMatchObject({ new: 1, changed: 1, conflict: 2, errors: 1 });
  });
});
