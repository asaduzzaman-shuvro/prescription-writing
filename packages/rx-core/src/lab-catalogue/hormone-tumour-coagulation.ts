import { labBuilders, labPanelDef } from "../lab-types";

const { num } = labBuilders("hormone");
const tumour = labBuilders("tumour_marker");
const coag = labBuilders("coagulation");

/** Hormone ranges depend on the assay, sex and cycle phase: where one range can't say it, the printed text does. */
export const HORMONE_TESTS = [
  num("3016-3", "TSH", "TSH", "µIU/mL", { low: 0.4, high: 4.5 }, { aliases: ["tsh"], decimals: 2 }),
  num("14920-3", "FT4", "Free T4", "pmol/L", { low: 12, high: 22 }, { aliases: ["ft4"], decimals: 1 }),
  num("14928-6", "FT3", "Free T3", "pmol/L", { low: 3.1, high: 6.8 }, { aliases: ["ft3"], decimals: 1 }),
  num("3053-6", "T3", "Total T3", "ng/dL", { low: 80, high: 200 }, { aliases: ["t3"] }),
  num("3026-2", "T4", "Total T4", "µg/dL", { low: 5, high: 12 }, { aliases: ["t4"], decimals: 1 }),
  num("8099-4", "Anti-TPO", "Anti-TPO antibody", "IU/mL", { high: 34 }, { aliases: ["antitpo", "tpo"] }),
  num("10501-5", "LH", "LH", "mIU/mL", undefined, { aliases: ["lh"], refText: "Varies with sex and cycle phase" }),
  num("15067-2", "FSH", "FSH", "mIU/mL", undefined, { aliases: ["fsh"], refText: "Varies with sex and cycle phase" }),
  num("2842-3", "Prolactin", "Prolactin", "ng/mL", { male: { low: 4, high: 15 }, female: { low: 4, high: 23 } }, { aliases: ["prolactin", "prl"], decimals: 1 }),
  num("2243-4", "Estradiol", "Estradiol (E2)", "pg/mL", undefined, { aliases: ["e2", "estradiol"], refText: "Varies with cycle phase" }),
  num("2839-9", "Progesterone", "Progesterone", "ng/mL", undefined, { aliases: ["progesterone"], refText: "Varies with cycle phase" }),
  num("2986-8", "Testosterone", "Testosterone", "ng/dL", { male: { low: 300, high: 1000 }, female: { low: 15, high: 70 } }, { aliases: ["testosterone"] }),
  num("38476-3", "AMH", "Anti-Müllerian hormone", "ng/mL", undefined, { aliases: ["amh"], refText: "Varies with age", decimals: 2 }),
  num("21198-7", "β-hCG", "Beta hCG", "mIU/mL", { high: 5 }, { aliases: ["bhcg", "betahcg", "hcg"], refText: "Non-pregnant < 5" }),
  num("2143-6", "Cortisol", "Serum cortisol", "µg/dL", undefined, { aliases: ["cortisol"], refText: "Morning (8 am) 6–23", decimals: 1 }),
  num("2731-8", "PTH", "Parathyroid hormone", "pg/mL", { low: 15, high: 65 }, { aliases: ["pth"] }),
  // Tumour markers
  tumour.num("1834-1", "AFP", "Alpha-fetoprotein", "ng/mL", { high: 10 }, { aliases: ["afp"] }),
  tumour.num("2857-1", "PSA", "Total PSA", "ng/mL", { high: 4 }, { aliases: ["psa", "tpsa"], decimals: 2 }),
  tumour.num("10886-0", "Free PSA", "Free PSA", "ng/mL", undefined, { aliases: ["fpsa", "freepsa"], decimals: 2 }),
  tumour.num("2039-6", "CEA", "Carcinoembryonic antigen", "ng/mL", { high: 5 }, { aliases: ["cea"], decimals: 1 }),
  tumour.num("10334-1", "CA-125", "CA-125", "U/mL", { high: 35 }, { aliases: ["ca125"] }),
  tumour.num("24108-3", "CA 19-9", "CA 19-9", "U/mL", { high: 37 }, { aliases: ["ca199"] }),
  tumour.num("6875-9", "CA 15-3", "CA 15-3", "U/mL", { high: 30 }, { aliases: ["ca153"] }),
  // Coagulation
  coag.num("5902-2", "PT", "Prothrombin time", "sec", { low: 11, high: 13.5 }, { aliases: ["pt"], decimals: 1 }),
  coag.num("6301-6", "INR", "INR", "", { low: 0.8, high: 1.2 }, { aliases: ["inr"], decimals: 2 }),
  coag.num("3173-2", "APTT", "Activated partial thromboplastin time", "sec", { low: 25, high: 35 }, { aliases: ["aptt"], decimals: 1 }),
  coag.num("3255-7", "Fibrinogen", "Fibrinogen", "mg/dL", { low: 200, high: 400 }, { aliases: ["fibrinogen"] }),
  coag.num("48065-7", "D-dimer", "D-dimer", "µg/mL FEU", { high: 0.5 }, { aliases: ["ddimer"], decimals: 2 }),
];

export const HORMONE_PANELS = [
  labPanelDef("thyroid", "Thyroid", "hormone", ["3016-3", "14920-3", "14928-6", "3053-6", "3026-2", "8099-4"], { specimen: "Blood", aliases: ["thyroid", "tft", "thyroidprofile"] }),
  labPanelDef("reproductive", "Reproductive hormones", "hormone", ["10501-5", "15067-2", "2842-3", "2243-4", "2839-9", "2986-8", "38476-3"], { specimen: "Blood", aliases: ["lhfsh", "hormones"] }),
  labPanelDef("bhcg", "Beta hCG", "hormone", ["21198-7"], { specimen: "Blood", aliases: ["bhcg", "betahcg"] }),
  labPanelDef("cortisol", "Serum cortisol", "hormone", ["2143-6"], { specimen: "Blood" }),
  labPanelDef("pth", "PTH", "hormone", ["2731-8"], { specimen: "Blood" }),
  labPanelDef("tumour", "Tumour markers", "tumour_marker", ["1834-1", "2857-1", "10886-0", "2039-6", "10334-1", "24108-3", "6875-9"], { specimen: "Blood", aliases: ["tumourmarker", "tumormarker"] }),
  labPanelDef("coag", "Coagulation profile", "coagulation", ["5902-2", "6301-6", "3173-2", "3255-7", "48065-7"], { specimen: "Blood (citrate)", aliases: ["ptinr", "coagulation", "coagulationprofile"] }),
];
