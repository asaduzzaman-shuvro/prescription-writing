import { labBuilders, labPanelDef } from "../lab-types";

const { coded, text, culture } = labBuilders("microbiology");

/** Cultures report the organisms grown (with a count) and an S/I/R sensitivity table for each. */
export const MICROBIOLOGY_TESTS = [
  culture("630-4", "Urine C/S", "Urine culture & sensitivity", { aliases: ["urinecs", "urineculture"] }),
  culture("600-7", "Blood C/S", "Blood culture & sensitivity", { aliases: ["bloodcs", "bloodculture"] }),
  culture("625-4", "Stool C/S", "Stool culture & sensitivity", { aliases: ["stoolcs", "stoolculture"] }),
  culture("624-7", "Sputum C/S", "Sputum culture & sensitivity", { aliases: ["sputumcs", "sputumculture"] }),
  culture("6462-6", "Pus C/S", "Wound / pus culture & sensitivity", { aliases: ["puscs", "woundcs", "swabcs"] }),
  culture("626-2", "Throat swab C/S", "Throat swab culture & sensitivity", { aliases: ["throatcs", "throatswab"] }),
  text("664-3", "Gram stain", "Gram stain", {
    options: ["No organism seen", "Gram positive cocci", "Gram positive cocci in clusters", "Gram positive cocci in chains", "Gram negative bacilli", "Gram positive bacilli", "Gram negative diplococci"],
    normal: ["No organism seen"], aliases: ["gram", "gramstain"],
  }),
  coded("11545-1", "AFB", "AFB (Ziehl-Neelsen stain)", ["No AFB seen", "Scanty", "1+", "2+", "3+"], ["No AFB seen"], { aliases: ["afb", "znstain"] }),
];

const cs = (id: string, name: string, test: string, specimen: string, aliases: string[]) =>
  labPanelDef(id, name, "microbiology", [test], { specimen, layout: "culture", aliases });

export const MICROBIOLOGY_PANELS = [
  cs("urine-cs", "Urine C/S", "630-4", "Urine (midstream)", ["urinecs", "urineculture"]),
  cs("blood-cs", "Blood C/S", "600-7", "Blood", ["bloodcs", "bloodculture"]),
  cs("stool-cs", "Stool C/S", "625-4", "Stool", ["stoolcs", "stoolculture"]),
  cs("sputum-cs", "Sputum C/S", "624-7", "Sputum", ["sputumcs", "sputumculture"]),
  cs("pus-cs", "Pus C/S", "6462-6", "Pus / wound swab", ["puscs", "woundswab"]),
  cs("throat-cs", "Throat swab C/S", "626-2", "Throat swab", ["throatswabcs", "throatcs"]),
  labPanelDef("gram", "Gram stain", "microbiology", ["664-3"], { aliases: ["gramstain"] }),
  labPanelDef("afb", "AFB stain", "microbiology", ["11545-1"], { specimen: "Sputum", aliases: ["afb", "sputumafb", "sputumforafb"] }),
];
