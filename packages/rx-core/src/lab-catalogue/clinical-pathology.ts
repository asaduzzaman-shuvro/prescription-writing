import { ABSENT_PRESENT, DIPSTICK, labBuilders, labPanelDef, NEG_POS } from "../lab-types";

const { num, coded, text } = labBuilders("clinical_pathology");

const FEW = ["Nil", "Occasional", "Few", "Moderate", "Plenty"];

/** Urine and stool R/M/E as printed in Bangladesh: physical, chemical and microscopic sections. Semen: WHO 2010 limits. */
export const CLINICAL_PATHOLOGY_TESTS = [
  // Urine
  text("bd-urine-qty", "Quantity", "Urine quantity", { options: ["10 mL", "20 mL", "30 mL"] }),
  coded("5778-6", "Colour", "Urine colour", ["Straw", "Pale yellow", "Yellow", "Dark yellow", "Amber", "Reddish", "Brown"], ["Straw", "Pale yellow", "Yellow"]),
  coded("5767-9", "Appearance", "Urine appearance", ["Clear", "Slightly hazy", "Hazy", "Turbid"], ["Clear"]),
  coded("bd-urine-sediment", "Sediment", "Urine sediment", ["Nil", "Present"], ["Nil"]),
  num("5811-5", "Sp. gravity", "Urine specific gravity", "", { low: 1.005, high: 1.03 }, { aliases: ["sg", "spgr"], decimals: 3 }),
  num("5803-2", "pH", "Urine pH", "", { low: 4.5, high: 8 }, { aliases: ["ph", "uph"], decimals: 1 }),
  coded("20454-5", "Albumin", "Urine albumin (protein)", DIPSTICK, ["Nil"], { aliases: ["alb", "albumin", "protein", "ualb"] }),
  coded("25428-4", "Sugar", "Urine sugar", DIPSTICK, ["Nil"], { aliases: ["usugar", "urinesugar"] }),
  coded("5797-6", "Ketones", "Urine ketones", DIPSTICK, ["Nil"], { aliases: ["ketone", "ketones", "acetone"] }),
  coded("5770-3", "Bilirubin", "Urine bilirubin", ["Nil", "+", "++", "+++"], ["Nil"], { aliases: ["ubil", "urinebilirubin"] }),
  coded("5818-0", "Urobilinogen", "Urine urobilinogen", ["Normal", "Increased"], ["Normal"], { aliases: ["urobilinogen"] }),
  coded("5802-4", "Nitrite", "Urine nitrite", NEG_POS, ["Negative"], { aliases: ["nitrite"] }),
  coded("5794-3", "Blood", "Urine blood", DIPSTICK, ["Nil"], { aliases: ["ublood"] }),
  num("5821-4", "Pus cells", "Urine pus cells", "/HPF", { high: 5 }, { aliases: ["pus", "puscell", "puscells"], allowRange: true }),
  num("13945-1", "RBC", "Urine RBC", "/HPF", { high: 2 }, { aliases: ["rbc", "urbc"], allowRange: true }),
  text("11277-1", "Epithelial cells", "Urine epithelial cells", { options: FEW, normal: ["Nil", "Occasional", "Few"], aliases: ["epi", "epithelial", "epithelialcells"] }),
  text("9842-6", "Casts", "Urine casts", { options: ["Nil", "Hyaline cast", "Granular cast", "RBC cast", "WBC cast"], normal: ["Nil", "Hyaline cast"], aliases: ["cast", "casts"] }),
  text("bd-urine-crystals", "Crystals", "Urine crystals", {
    options: ["Nil", "Calcium oxalate", "Uric acid", "Triple phosphate", "Amorphous urates", "Amorphous phosphates"], normal: ["Nil"], aliases: ["crystal", "crystals"],
  }),
  text("bd-urine-others", "Others", "Urine others", { options: ["Nil", "Yeast cells", "Bacteria", "Trichomonas"] }),
  // Stool
  coded("bd-stool-colour", "Colour", "Stool colour", ["Yellowish", "Brown", "Greenish", "Black", "Reddish", "Clay"], ["Yellowish", "Brown"]),
  coded("bd-stool-consistency", "Consistency", "Stool consistency", ["Formed", "Semi-formed", "Soft", "Loose", "Watery", "Mucoid"], ["Formed", "Semi-formed", "Soft"]),
  coded("bd-stool-mucus", "Mucus", "Stool mucus", ABSENT_PRESENT, ["Absent"]),
  coded("bd-stool-blood", "Blood", "Stool blood (visible)", ABSENT_PRESENT, ["Absent"]),
  coded("2335-8", "OBT", "Occult blood test", NEG_POS, ["Negative"], { aliases: ["obt", "occultblood"] }),
  coded("bd-stool-reducing", "Reducing substance", "Stool reducing substance", NEG_POS, ["Negative"], { aliases: ["reducing", "reducingsubstance"] }),
  num("bd-stool-pus", "Pus cells", "Stool pus cells", "/HPF", { high: 5 }, { allowRange: true }),
  num("bd-stool-rbc", "RBC", "Stool RBC", "/HPF", { high: 0 }, { allowRange: true }),
  text("bd-stool-ova", "Ova", "Ova of helminths", {
    options: ["Not found", "Ascaris lumbricoides", "Trichuris trichiura", "Hookworm", "Enterobius vermicularis", "Taenia"], normal: ["Not found"],
  }),
  text("bd-stool-cyst", "Cyst", "Cysts of protozoa", { options: ["Not found", "Entamoeba histolytica", "Entamoeba coli", "Giardia lamblia"], normal: ["Not found"] }),
  text("bd-stool-veg", "Vegetative forms", "Vegetative forms", { options: ["Not found", "E. histolytica (trophozoite)", "Giardia lamblia (trophozoite)"], normal: ["Not found"] }),
  text("bd-stool-fat", "Fat globules", "Fat globules", { options: ["Nil", "Few", "Present"], normal: ["Nil", "Few"] }),
  text("bd-stool-starch", "Starch granules", "Starch granules", { options: ["Nil", "Few", "Present"], normal: ["Nil", "Few"] }),
  text("bd-stool-vegcells", "Vegetable cells", "Vegetable cells", { options: ["Nil", "Few", "Present"] }),
  // Semen
  num("bd-semen-volume", "Volume", "Semen volume", "mL", { low: 1.5 }, { decimals: 1 }),
  coded("bd-semen-colour", "Colour", "Semen colour", ["Greyish white", "Yellowish", "Reddish"], ["Greyish white"]),
  num("bd-semen-liquefaction", "Liquefaction time", "Liquefaction time", "min", { high: 60 }),
  coded("bd-semen-viscosity", "Viscosity", "Semen viscosity", ["Normal", "Increased"], ["Normal"]),
  num("bd-semen-ph", "pH", "Semen pH", "", { low: 7.2 }, { aliases: ["semenph"], decimals: 1 }),
  num("bd-semen-count", "Sperm count", "Sperm concentration", "million/mL", { low: 15 }, { aliases: ["spermcount"] }),
  num("bd-semen-motility", "Total motility", "Total motility (PR + NP)", "%", { low: 40 }),
  num("bd-semen-progressive", "Progressive motility", "Progressive motility (PR)", "%", { low: 32 }),
  num("bd-semen-morphology", "Normal forms", "Normal morphology", "%", { low: 4 }),
  num("bd-semen-pus", "Pus cells", "Semen pus cells", "/HPF", { high: 5 }, { allowRange: true }),
  // Pregnancy
  coded("2106-3", "Pregnancy test", "Urine for pregnancy test", NEG_POS, undefined, { aliases: ["upt", "pregnancy", "pregnancytest"] }),
];

export const CLINICAL_PATHOLOGY_PANELS = [
  labPanelDef("urine", "Urine R/M/E", "clinical_pathology", [
    { title: "Physical examination", tests: ["bd-urine-qty", "5778-6", "5767-9", "bd-urine-sediment"] },
    { title: "Chemical examination", tests: ["5811-5", "5803-2", "20454-5", "25428-4", "5797-6", "5770-3", "5818-0", "5802-4", "5794-3"] },
    { title: "Microscopic examination", tests: ["5821-4", "13945-1", "11277-1", "9842-6", "bd-urine-crystals", "bd-urine-others"] },
  ], { code: "24356-8", specimen: "Urine", aliases: ["urinere", "urinerme", "urineroutine", "cua"] }),
  labPanelDef("stool", "Stool R/M/E", "clinical_pathology", [
    { title: "Physical examination", tests: ["bd-stool-colour", "bd-stool-consistency", "bd-stool-mucus", "bd-stool-blood"] },
    { title: "Chemical examination", tests: ["2335-8", "bd-stool-reducing"] },
    { title: "Microscopic examination", tests: ["bd-stool-pus", "bd-stool-rbc", "bd-stool-ova", "bd-stool-cyst", "bd-stool-veg", "bd-stool-fat", "bd-stool-starch", "bd-stool-vegcells"] },
  ], { specimen: "Stool", aliases: ["stoolre", "stoolrme", "stoolroutine"] }),
  labPanelDef("obt", "Stool for OBT", "clinical_pathology", ["2335-8"], { specimen: "Stool", aliases: ["obt", "stoolobt"] }),
  labPanelDef("semen", "Semen analysis", "clinical_pathology", [
    { title: "Physical examination", tests: ["bd-semen-volume", "bd-semen-colour", "bd-semen-liquefaction", "bd-semen-viscosity", "bd-semen-ph"] },
    { title: "Microscopic examination", tests: ["bd-semen-count", "bd-semen-motility", "bd-semen-progressive", "bd-semen-morphology", "bd-semen-pus"] },
  ], { specimen: "Semen", aliases: ["semenanalysis", "semen"] }),
  labPanelDef("upt", "Pregnancy test", "clinical_pathology", ["2106-3"], { specimen: "Urine", aliases: ["upt", "urinepregnancytest"] }),
];
