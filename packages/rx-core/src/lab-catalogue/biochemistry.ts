import { labBuilders, labPanelDef } from "../lab-types";

const { num } = labBuilders("biochemistry");

/** Glucose in mmol/L, creatinine and lipids in mg/dL, as Bangladeshi labs print them. */
export const BIOCHEMISTRY_TESTS = [
  // Sugar
  num("14749-6", "RBS", "Random blood sugar", "mmol/L", { high: 7.8 }, { aliases: ["rbs"], decimals: 1 }),
  num("14771-0", "FBS", "Fasting blood sugar", "mmol/L", { low: 3.9, high: 6.1 }, { aliases: ["fbs"], decimals: 1 }),
  num("14761-1", "2HABF", "Blood sugar 2 h after breakfast", "mmol/L", { high: 7.8 }, { aliases: ["2habf", "abf", "ppbs", "2hpp"], decimals: 1 }),
  num("bd-ogtt-2h", "OGTT 2 h", "Blood sugar 2 h after 75 g glucose", "mmol/L", { high: 7.8 }, { aliases: ["ogtt", "ogtt2h"], decimals: 1 }),
  num("4548-4", "HbA1c", "HbA1c", "%", { high: 5.7 }, { aliases: ["hba1c", "a1c"], decimals: 1, refText: "Normal < 5.7, prediabetes 5.7–6.4, diabetes ≥ 6.5" }),
  // Renal
  num("2160-0", "S. creatinine", "Serum creatinine", "mg/dL", { low: 0.6, high: 1.2 }, { aliases: ["cr", "creat", "creatinine", "screatinine", "scr", "screat"], decimals: 2 }),
  num("3091-6", "Urea", "Blood urea", "mg/dL", { low: 15, high: 40 }, { aliases: ["urea", "bu", "burea"] }),
  num("3094-0", "BUN", "Blood urea nitrogen", "mg/dL", { low: 7, high: 20 }, { aliases: ["bun"] }),
  num("98979-8", "eGFR", "eGFR", "mL/min/1.73m²", { low: 90 }, { aliases: ["egfr", "gfr"] }),
  num("3084-1", "Uric acid", "Serum uric acid", "mg/dL", { male: { high: 7 }, female: { high: 6 } }, { aliases: ["ua", "uricacid", "suricacid"], decimals: 1 }),
  // Liver
  num("1975-2", "Bilirubin", "Total bilirubin", "mg/dL", { high: 1.2 }, { aliases: ["bil", "bili", "bilirubin", "sbilirubin", "tbil"], decimals: 2 }),
  num("1968-7", "Direct bilirubin", "Direct bilirubin", "mg/dL", { high: 0.3 }, { aliases: ["dbil", "directbilirubin"], decimals: 2 }),
  num("1971-1", "Indirect bilirubin", "Indirect bilirubin", "mg/dL", { high: 0.9 }, { aliases: ["ibil", "indirectbilirubin"], decimals: 2 }),
  num("1742-6", "SGPT", "SGPT (ALT)", "U/L", { high: 40 }, { aliases: ["sgpt", "alt"] }),
  num("1920-8", "SGOT", "SGOT (AST)", "U/L", { high: 40 }, { aliases: ["sgot", "ast"] }),
  num("6768-6", "ALP", "Alkaline phosphatase", "U/L", { low: 40, high: 130 }, { aliases: ["alp", "alkphos", "salp"] }),
  num("2324-2", "GGT", "Gamma GT", "U/L", { male: { high: 55 }, female: { high: 38 } }, { aliases: ["ggt", "ggtp"] }),
  num("2885-2", "T. protein", "Total protein", "g/dL", { low: 6, high: 8.3 }, { aliases: ["tp", "totalprotein", "sprotein"], decimals: 1 }),
  num("1751-7", "S. albumin", "Serum albumin", "g/dL", { low: 3.5, high: 5.2 }, { aliases: ["salb", "serumalbumin"], decimals: 1 }),
  num("10834-0", "Globulin", "Globulin", "g/dL", { low: 2, high: 3.5 }, { aliases: ["glob", "globulin"], decimals: 1 }),
  num("1759-0", "A/G ratio", "Albumin/globulin ratio", "", { low: 1.1, high: 2.5 }, { aliases: ["ag", "agratio"], decimals: 2 }),
  // Lipids
  num("2093-3", "T. cholesterol", "Total cholesterol", "mg/dL", { high: 200 }, { aliases: ["chol", "cholesterol", "tchol", "tcholesterol"], refText: "Desirable < 200, borderline 200–239, high ≥ 240" }),
  num("2571-8", "TG", "Triglycerides", "mg/dL", { high: 150 }, { aliases: ["tg", "triglyceride", "triglycerides"], refText: "Normal < 150" }),
  num("2085-9", "HDL", "HDL cholesterol", "mg/dL", { low: 40 }, { aliases: ["hdl"], refText: "> 40" }),
  num("13457-7", "LDL", "LDL cholesterol", "mg/dL", { high: 100 }, { aliases: ["ldl"], refText: "Optimal < 100" }),
  num("13458-5", "VLDL", "VLDL cholesterol", "mg/dL", { high: 30 }, { aliases: ["vldl"] }),
  // Electrolytes and minerals
  num("2951-2", "Na", "Serum sodium", "mmol/L", { low: 135, high: 145 }, { aliases: ["na", "sodium", "sna"] }),
  num("2823-3", "K", "Serum potassium", "mmol/L", { low: 3.5, high: 5.1 }, { aliases: ["k", "potassium", "sk"], decimals: 1 }),
  num("2075-0", "Cl", "Serum chloride", "mmol/L", { low: 98, high: 107 }, { aliases: ["cl", "chloride", "scl"] }),
  num("2028-9", "HCO₃", "Bicarbonate", "mmol/L", { low: 22, high: 29 }, { aliases: ["hco3", "bicarb", "bicarbonate", "tco2"] }),
  num("17861-6", "Calcium", "Serum calcium", "mg/dL", { low: 8.5, high: 10.5 }, { aliases: ["calcium", "sca", "scalcium"], decimals: 1 }),
  num("2777-1", "Phosphate", "Serum phosphate", "mg/dL", { low: 2.5, high: 4.5 }, { aliases: ["po4", "phosphate", "sphosphate", "phosphorus"], decimals: 1 }),
  num("19123-9", "Magnesium", "Serum magnesium", "mg/dL", { low: 1.7, high: 2.4 }, { aliases: ["mg", "magnesium", "smg"], decimals: 1 }),
  // Cardiac, pancreas
  num("10839-9", "Troponin I", "Troponin I", "ng/mL", { high: 0.04 }, { aliases: ["trop", "tropi", "troponin", "troponini"], decimals: 3 }),
  num("bd-ckmb", "CK-MB", "CK-MB", "U/L", { high: 25 }, { aliases: ["ckmb"] }),
  num("2157-6", "CPK", "Creatine kinase (CPK)", "U/L", { male: { low: 39, high: 308 }, female: { low: 26, high: 192 } }, { aliases: ["cpk", "ck"] }),
  num("2532-0", "LDH", "Lactate dehydrogenase", "U/L", { low: 140, high: 280 }, { aliases: ["ldh"] }),
  num("1798-8", "Amylase", "Serum amylase", "U/L", { low: 28, high: 100 }, { aliases: ["amylase", "samylase"] }),
  num("3040-3", "Lipase", "Serum lipase", "U/L", { low: 13, high: 60 }, { aliases: ["lipase", "slipase"] }),
  // Inflammation, iron, vitamins, urine
  num("1988-5", "CRP", "C-reactive protein", "mg/L", { high: 6 }, { aliases: ["crp"] }),
  num("2498-4", "Iron", "Serum iron", "µg/dL", { low: 60, high: 170 }, { aliases: ["iron", "siron"] }),
  num("2500-7", "TIBC", "Total iron binding capacity", "µg/dL", { low: 250, high: 450 }, { aliases: ["tibc"] }),
  num("2276-4", "Ferritin", "Serum ferritin", "ng/mL", { male: { low: 30, high: 400 }, female: { low: 13, high: 150 } }, { aliases: ["ferritin", "sferritin"] }),
  num("2132-9", "Vit B12", "Vitamin B12", "pg/mL", { low: 200, high: 900 }, { aliases: ["b12", "vitb12"] }),
  num("1989-3", "Vit D", "25-OH vitamin D", "ng/mL", { low: 30, high: 100 }, { aliases: ["vitd", "vitamind", "25ohd"], refText: "Deficient < 20, insufficient 20–29, sufficient 30–100" }),
  num("9318-7", "Urine ACR", "Urine albumin/creatinine ratio", "mg/g", { high: 30 }, { aliases: ["acr", "uacr"] }),
];

export const BIOCHEMISTRY_PANELS = [
  labPanelDef("sugar", "Blood sugar", "biochemistry", ["14749-6", "14771-0", "14761-1", "4548-4"], { specimen: "Blood", aliases: ["bloodsugar", "glucose"] }),
  labPanelDef("rft", "RFT", "biochemistry", ["2160-0", "3091-6", "3094-0", "98979-8", "3084-1"], { specimen: "Blood", aliases: ["renalfunction", "renalfunctiontest"] }),
  labPanelDef("lft", "LFT", "biochemistry", ["1975-2", "1968-7", "1971-1", "1742-6", "1920-8", "6768-6", "2324-2", "2885-2", "1751-7", "10834-0", "1759-0"],
    { specimen: "Blood", aliases: ["liverfunction", "liverfunctiontest"] }),
  labPanelDef("lipid", "Lipid profile", "biochemistry", ["2093-3", "2571-8", "2085-9", "13457-7", "13458-5"], { code: "24331-1", specimen: "Blood (fasting)", aliases: ["lipidprofile", "fastinglipidprofile"] }),
  labPanelDef("electrolytes", "Electrolytes", "biochemistry", ["2951-2", "2823-3", "2075-0", "2028-9"], { code: "24326-1", specimen: "Blood", aliases: ["electrolytes", "serumelectrolytes"] }),
  labPanelDef("ogtt", "OGTT", "biochemistry", ["14771-0", "bd-ogtt-2h"], { specimen: "Blood", aliases: ["ogtt", "glucosetolerancetest"] }),
  labPanelDef("minerals", "Calcium, phosphate & magnesium", "biochemistry", ["17861-6", "2777-1", "19123-9"], { specimen: "Blood" }),
  labPanelDef("cardiac", "Cardiac enzymes", "biochemistry", ["10839-9", "bd-ckmb", "2157-6", "2532-0"], { specimen: "Blood", aliases: ["cardiacenzymes", "troponin"] }),
  labPanelDef("pancreas", "Amylase & lipase", "biochemistry", ["1798-8", "3040-3"], { specimen: "Blood" }),
  labPanelDef("iron", "Iron profile", "biochemistry", ["2498-4", "2500-7", "2276-4"], { specimen: "Blood", aliases: ["ironprofile", "ironstudy"] }),
  labPanelDef("vitamins", "Vitamin B12 & D", "biochemistry", ["2132-9", "1989-3"], { specimen: "Blood" }),
  labPanelDef("uacr", "Urine ACR", "biochemistry", ["9318-7"], { specimen: "Urine (spot)", aliases: ["acr", "urineacr", "microalbumin"] }),
];
