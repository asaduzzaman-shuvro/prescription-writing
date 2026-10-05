import type { DoseUnit, Route } from "./types";

export interface FormDefaults {
  shortLabel: string;
  route: Route;
  unit: DoseUnit;
}

/** Ordered rules: first match wins. */
const RULES: [RegExp, FormDefaults][] = [
  [/ear drop/i, { shortLabel: "Ear Drop", route: "ear", unit: "drop" }],
  [/nasal spray/i, { shortLabel: "Nasal Spray", route: "nose", unit: "spray" }],
  [/nasal drop/i, { shortLabel: "Nasal Drop", route: "nose", unit: "drop" }],
  [/nasal ointment/i, { shortLabel: "Nasal Oint.", route: "nose", unit: "application" }],
  [/eye drop|ophthalmic (solution|suspension|emulsion)|ocular spray/i, { shortLabel: "Eye Drop", route: "eye", unit: "drop" }],
  [/ophthalmic (ointment|gel)|eye capsule/i, { shortLabel: "Eye Oint.", route: "eye", unit: "application" }],
  [/pediatric drops/i, { shortLabel: "Paed. Drop", route: "oral", unit: "ml" }],
  [/inhalation capsule/i, { shortLabel: "Inh. Cap.", route: "inhalation", unit: "cap" }],
  [/inhaler/i, { shortLabel: "Inhaler", route: "inhalation", unit: "puff" }],
  [/nebuli[sz]er|respirator solution|solution for inhalation/i, { shortLabel: "Neb.", route: "inhalation", unit: "ml" }],
  [/mouthwash/i, { shortLabel: "Mouthwash", route: "gargle", unit: "ml" }],
  [/sublingual/i, { shortLabel: "SL Tab.", route: "sublingual", unit: "tab" }],
  [/vaginal (tablet|pessary|suppository)/i, { shortLabel: "Vag. Tab.", route: "vaginal", unit: "supp" }],
  [/vaginal/i, { shortLabel: "Vag.", route: "vaginal", unit: "application" }],
  [/rectal|suppository/i, { shortLabel: "Supp.", route: "rectal", unit: "supp" }],
  [/injection|infusion|powder for injection/i, { shortLabel: "Inj.", route: "injection", unit: "amp" }],
  [/capsule/i, { shortLabel: "Cap.", route: "oral", unit: "cap" }],
  [/tablet/i, { shortLabel: "Tab.", route: "oral", unit: "tab" }],
  [/syrup/i, { shortLabel: "Syp.", route: "oral", unit: "tsf" }],
  [/suspension/i, { shortLabel: "Susp.", route: "oral", unit: "tsf" }],
  [/oral (solution|emulsion)|liquid/i, { shortLabel: "Sol.", route: "oral", unit: "ml" }],
  [/sachet|oral powder|granules|effervescent powder/i, { shortLabel: "Sachet", route: "oral", unit: "sachet" }],
  [/cream/i, { shortLabel: "Cream", route: "topical", unit: "application" }],
  [/ointment/i, { shortLabel: "Oint.", route: "topical", unit: "application" }],
  [/gel/i, { shortLabel: "Gel", route: "topical", unit: "application" }],
  [/lotion|shampoo|topical|scalp|patch|lacquer|soap|bar|rub|scrub/i, { shortLabel: "", route: "topical", unit: "application" }],
];

/** Default printed label, route and dose unit for a dosage-form name (e.g. "Capsule (Delayed Release)"). */
export function classifyDosageForm(name: string): FormDefaults {
  for (const [re, d] of RULES) if (re.test(name)) return { ...d, shortLabel: d.shortLabel || name };
  return { shortLabel: name, route: "other", unit: "unit" };
}
