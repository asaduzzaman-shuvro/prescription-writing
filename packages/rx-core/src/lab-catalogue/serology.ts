import { labBuilders, labPanelDef, NEG_POS, NONREACTIVE } from "../lab-types";

const { num, coded, titre } = labBuilders("serology");
const bank = labBuilders("blood_bank");

/** Widal and Weil-Felix: titres at or above 1:160 are flagged (each lab prints its own cut-off; clinics can change it). */
export const SEROLOGY_TESTS = [
  coded("5196-1", "HBsAg", "HBsAg", NEG_POS, ["Negative"], { aliases: ["hbsag"] }),
  coded("16128-1", "Anti-HCV", "Anti-HCV", NEG_POS, ["Negative"], { aliases: ["antihcv", "hcv"] }),
  coded("bd-anti-hiv", "Anti-HIV", "Anti-HIV (1 & 2)", NONREACTIVE, ["Non-reactive"], { aliases: ["hiv", "antihiv"] }),
  coded("5292-8", "VDRL", "VDRL", NONREACTIVE, ["Non-reactive"], { aliases: ["vdrl"] }),
  coded("bd-tpha", "TPHA", "TPHA", NONREACTIVE, ["Non-reactive"], { aliases: ["tpha"] }),
  titre("bd-widal-to", "TO", "S. Typhi O", "1:160", { aliases: ["to"] }),
  titre("bd-widal-th", "TH", "S. Typhi H", "1:160", { aliases: ["th"] }),
  titre("bd-widal-ah", "AH", "S. Paratyphi A H", "1:160", { aliases: ["ah"] }),
  titre("bd-widal-bh", "BH", "S. Paratyphi B H", "1:160", { aliases: ["bh"] }),
  titre("bd-weilfelix-ox19", "OX-19", "Proteus OX-19", "1:160", { aliases: ["ox19"] }),
  titre("bd-weilfelix-ox2", "OX-2", "Proteus OX-2", "1:160", { aliases: ["ox2"] }),
  titre("bd-weilfelix-oxk", "OX-K", "Proteus OX-K", "1:160", { aliases: ["oxk"] }),
  titre("bd-brucella", "Brucella", "Brucella abortus", "1:160", { aliases: ["brucella"] }),
  coded("bd-typhidot-igm", "Typhidot IgM", "Typhidot IgM", NEG_POS, ["Negative"]),
  coded("bd-typhidot-igg", "Typhidot IgG", "Typhidot IgG", NEG_POS, ["Negative"]),
  coded("75377-6", "Dengue NS1", "Dengue NS1 antigen", NEG_POS, ["Negative"], { aliases: ["ns1", "denguens1"] }),
  coded("bd-dengue-igm", "Dengue IgM", "Dengue IgM antibody", NEG_POS, ["Negative"], { aliases: ["dengueigm"] }),
  coded("bd-dengue-igg", "Dengue IgG", "Dengue IgG antibody", NEG_POS, ["Negative"], { aliases: ["dengueigg"] }),
  coded("bd-ict-malaria", "ICT malaria", "ICT for malaria", ["Negative", "P. falciparum positive", "P. vivax positive", "Mixed positive"], ["Negative"], { aliases: ["ictmalaria", "ictmp"] }),
  coded("bd-ict-kalaazar", "ICT kala-azar", "ICT for kala-azar (rK39)", NEG_POS, ["Negative"], { aliases: ["ictka", "ictkalaazar", "rk39"] }),
  num("5370-2", "ASO", "ASO titre", "IU/mL", { high: 200 }, { aliases: ["aso", "asotitre"] }),
  coded("bd-ra", "RA test", "RA test (rheumatoid factor)", NEG_POS, ["Negative"], { aliases: ["ra", "ratest", "rf"] }),
  coded("bd-hpylori", "H. pylori Ab", "H. pylori antibody", NEG_POS, ["Negative"], { aliases: ["hpylori"] }),
  // Blood bank
  bank.coded("883-9", "ABO group", "ABO blood group", ["A", "B", "AB", "O"], undefined, { aliases: ["abo", "bloodgroup"] }),
  bank.coded("10331-7", "Rh", "Rh (D) type", ["Positive", "Negative"], undefined, { aliases: ["rh"] }),
  bank.coded("bd-crossmatch", "Cross match", "Cross matching", ["Compatible", "Incompatible"], ["Compatible"], { aliases: ["crossmatch"] }),
  bank.coded("bd-coombs-direct", "Direct Coombs", "Direct Coombs test", NEG_POS, ["Negative"], { aliases: ["dct"] }),
  bank.coded("bd-coombs-indirect", "Indirect Coombs", "Indirect Coombs test", NEG_POS, ["Negative"], { aliases: ["idct"] }),
];

const WIDAL = ["bd-widal-to", "bd-widal-th", "bd-widal-ah", "bd-widal-bh"];

export const SEROLOGY_PANELS = [
  labPanelDef("serology", "Serology", "serology", ["5196-1", "16128-1", "1988-5"], { specimen: "Blood" }),
  labPanelDef("widal", "Widal test", "serology", WIDAL, { specimen: "Blood", aliases: ["widal", "widaltest"] }),
  labPanelDef("febrile", "Febrile antigen", "serology", [
    { title: "Widal", tests: WIDAL },
    { title: "Weil-Felix", tests: ["bd-weilfelix-ox19", "bd-weilfelix-ox2", "bd-weilfelix-oxk"] },
    { title: "Brucella", tests: ["bd-brucella"] },
  ], { specimen: "Blood", aliases: ["febrileantigen", "tripleantigen"] }),
  labPanelDef("typhidot", "Typhidot", "serology", ["bd-typhidot-igm", "bd-typhidot-igg"], { specimen: "Blood", aliases: ["typhidot"] }),
  labPanelDef("dengue", "Dengue", "serology", ["75377-6", "bd-dengue-igm", "bd-dengue-igg"], { specimen: "Blood", aliases: ["dengue", "ns1", "dengueigmigg"] }),
  labPanelDef("ict-malaria", "ICT for malaria", "serology", ["bd-ict-malaria"], { specimen: "Blood", aliases: ["ictmalaria"] }),
  labPanelDef("ict-kalaazar", "ICT for kala-azar", "serology", ["bd-ict-kalaazar"], { specimen: "Blood", aliases: ["ictkalaazar", "rk39"] }),
  labPanelDef("hiv", "Anti-HIV", "serology", ["bd-anti-hiv"], { specimen: "Blood" }),
  labPanelDef("vdrl", "VDRL & TPHA", "serology", ["5292-8", "bd-tpha"], { specimen: "Blood", aliases: ["vdrl", "tpha"] }),
  labPanelDef("aso", "ASO titre", "serology", ["5370-2"], { specimen: "Blood", aliases: ["aso", "asotitre"] }),
  labPanelDef("ra", "RA test", "serology", ["bd-ra"], { specimen: "Blood", aliases: ["ra", "ratest", "rafactor"] }),
  labPanelDef("hpylori", "H. pylori antibody", "serology", ["bd-hpylori"], { specimen: "Blood", aliases: ["hpylori"] }),
  labPanelDef("grouping", "Blood grouping & Rh", "blood_bank", ["883-9", "10331-7"], { specimen: "Blood", aliases: ["bloodgrouping", "bloodgroup", "grouping", "abo"] }),
  labPanelDef("crossmatch", "Cross matching", "blood_bank", ["bd-crossmatch"], { specimen: "Blood", aliases: ["crossmatching", "crossmatch"] }),
  labPanelDef("coombs", "Coombs test", "blood_bank", ["bd-coombs-direct", "bd-coombs-indirect"], { specimen: "Blood", aliases: ["coombs", "coombstest"] }),
];
