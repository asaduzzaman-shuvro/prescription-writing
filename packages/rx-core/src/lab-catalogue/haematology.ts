import { labBuilders, labPanelDef } from "../lab-types";

const { num, coded, text } = labBuilders("haematology");

/** Adult ranges as Bangladeshi labs print them; children 6 months–12 years get their own Hb band. */
export const HAEMATOLOGY_TESTS = [
  num("718-7", "Hb", "Haemoglobin", "g/dL", { male: { low: 13, high: 17 }, female: { low: 12, high: 15 }, bands: [{ minAgeDays: 182, maxAgeDays: 4383, low: 11.5, high: 15.5 }] },
    { aliases: ["hb", "hgb", "hb%", "haemoglobin", "hemoglobin"], decimals: 1 }),
  num("30341-2", "ESR", "ESR", "mm/1st hr", { male: { high: 15 }, female: { high: 20 } }, { aliases: ["esr"], method: "Westergren" }),
  num("789-8", "RBC", "Total RBC count", "×10⁶/µL", { male: { low: 4.5, high: 5.5 }, female: { low: 3.8, high: 4.8 } }, { aliases: ["rbccount", "trbc", "totalrbc"], decimals: 2 }),
  num("6690-2", "WBC", "Total WBC count", "×10³/µL", { low: 4, high: 11 }, { perCmmFrom: 1000, printAs: "per_cmm", aliases: ["wbc", "tc", "totalcount", "wbccount"] }),
  num("777-3", "Platelets", "Platelet count", "×10³/µL", { low: 150, high: 400 }, { perCmmFrom: 5000, printAs: "per_cmm", aliases: ["plt", "platelet", "platelets", "pc"] }),
  num("770-8", "Neutrophils", "Neutrophils", "%", { low: 40, high: 75 }, { aliases: ["n", "neut", "neutrophil", "neutrophils", "poly"] }),
  num("736-9", "Lymphocytes", "Lymphocytes", "%", { low: 20, high: 45 }, { aliases: ["l", "lymph", "lymphocyte", "lymphocytes"] }),
  num("5905-5", "Monocytes", "Monocytes", "%", { low: 2, high: 10 }, { aliases: ["mono", "monocyte", "monocytes"] }),
  num("713-8", "Eosinophils", "Eosinophils", "%", { low: 1, high: 6 }, { aliases: ["eos", "eosinophil", "eosinophils"] }),
  num("706-2", "Basophils", "Basophils", "%", { high: 1 }, { aliases: ["baso", "basophil", "basophils"] }),
  num("4544-3", "PCV", "Haematocrit (PCV)", "%", { male: { low: 40, high: 50 }, female: { low: 36, high: 46 } }, { aliases: ["pcv", "hct", "haematocrit", "hematocrit"], decimals: 1 }),
  num("787-2", "MCV", "Mean corpuscular volume", "fL", { low: 80, high: 100 }, { aliases: ["mcv"], decimals: 1 }),
  num("785-6", "MCH", "Mean corpuscular haemoglobin", "pg", { low: 27, high: 32 }, { aliases: ["mch"], decimals: 1 }),
  num("786-4", "MCHC", "Mean corpuscular Hb concentration", "g/dL", { low: 32, high: 36 }, { aliases: ["mchc"], decimals: 1 }),
  num("788-0", "RDW-CV", "Red cell distribution width", "%", { low: 11.5, high: 14.5 }, { aliases: ["rdw", "rdwcv"], decimals: 1 }),
  num("711-2", "CE", "Circulating eosinophil count", "/cumm", { low: 40, high: 440 }, { aliases: ["ce", "aec"] }),
  num("4679-7", "Retic", "Reticulocyte count", "%", { low: 0.5, high: 2.5 }, { aliases: ["retic", "reticulocyte"], decimals: 1 }),
  coded("32700-7", "MP", "Malarial parasite (MP)", ["Not found", "P. vivax found", "P. falciparum found", "Mixed infection"], ["Not found"], { aliases: ["mp"] }),
  text("bd-pbf", "PBF", "Peripheral blood film", {
    options: ["Normocytic normochromic", "Microcytic hypochromic", "Macrocytic", "Dimorphic", "Leucocytosis with neutrophilia"],
    aliases: ["pbf"],
  }),
  num("bd-bt", "BT", "Bleeding time", "min", { low: 1, high: 6 }, { aliases: ["bt"] }),
  num("bd-ct", "CT", "Clotting time", "min", { low: 5, high: 11 }, { aliases: ["ct"] }),
];

export const HAEMATOLOGY_PANELS = [
  labPanelDef("cbc", "CBC", "haematology", [
    { tests: ["718-7", "30341-2"] },
    { title: "Total count", tests: ["789-8", "6690-2", "777-3"] },
    { title: "Differential count", tests: ["770-8", "736-9", "5905-5", "713-8", "706-2"] },
    { title: "RBC indices", tests: ["4544-3", "787-2", "785-6", "786-4", "788-0"] },
  ], { code: "58410-2", specimen: "Blood (EDTA)", aliases: ["cbc", "completebloodcount", "hbtcdcesr"] }),
  labPanelDef("esr", "ESR", "haematology", ["30341-2"], { specimen: "Blood (EDTA)" }),
  labPanelDef("ce", "Circulating eosinophil count", "haematology", ["711-2"], { specimen: "Blood (EDTA)" }),
  labPanelDef("retic", "Reticulocyte count", "haematology", ["4679-7"], { specimen: "Blood (EDTA)" }),
  labPanelDef("mp", "Malarial parasite (MP)", "haematology", ["32700-7"], { specimen: "Blood" }),
  labPanelDef("pbf", "Peripheral blood film", "haematology", ["bd-pbf"], { specimen: "Blood (EDTA)" }),
  labPanelDef("bt-ct", "BT & CT", "haematology", ["bd-bt", "bd-ct"], { specimen: "Blood" }),
];
