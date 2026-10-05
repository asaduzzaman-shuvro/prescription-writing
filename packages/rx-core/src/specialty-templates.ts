import type { SpecialtyTemplateSchema } from "./specialty";

/**
 * Starter ophthalmology and vascular examination templates (admin-editable after seeding).
 * Option lists follow common practice and must be reviewed by a consultant in each specialty
 * before production use.
 */

const VA = ["6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60", "3/60", "1/60", "CF", "HM", "PL+", "PL−", "NPL"];

export const OPHTHALMOLOGY_TEMPLATE: SpecialtyTemplateSchema = {
  lateralLabels: { right: "RE", left: "LE", both: "B/E" },
  sections: [
    {
      id: "vision",
      title: "Vision",
      fields: [
        { id: "eye_va", label: "VA (unaided)", type: "select", lateral: true, options: VA },
        { id: "eye_va_ph", label: "VA (pinhole)", type: "select", lateral: true, options: VA },
        { id: "eye_va_glass", label: "VA (with glasses)", type: "select", lateral: true, options: VA },
        { id: "eye_near", label: "Near vision", type: "select", lateral: true, options: ["N6", "N8", "N10", "N12", "N18", "N24", "N36"] },
        { id: "eye_refraction", label: "Refraction", type: "text" },
      ],
    },
    {
      id: "anterior",
      title: "Anterior segment",
      fields: [
        { id: "eye_lids", label: "Lids", type: "select", lateral: true, options: ["Normal", "Swelling", "Ptosis", "Entropion", "Ectropion", "Chalazion", "Stye", "Blepharitis"], normal: "Normal" },
        { id: "eye_conj", label: "Conjunctiva", type: "select", lateral: true, options: ["Normal", "Congested", "Chemosis", "Subconjunctival haemorrhage", "Pterygium", "Discharge"], normal: "Normal" },
        { id: "eye_cornea", label: "Cornea", type: "select", lateral: true, options: ["Clear", "Opacity", "Ulcer", "Oedema", "Foreign body", "Keratic precipitates", "Abrasion"], normal: "Clear" },
        { id: "eye_ac", label: "AC", type: "select", lateral: true, options: ["Normal depth", "Shallow", "Cells / flare", "Hypopyon", "Hyphaema"], normal: "Normal depth" },
        { id: "eye_pupil", label: "Pupil", type: "select", lateral: true, options: ["Round, regular, reactive", "Sluggish", "Fixed dilated", "RAPD present", "Irregular"], normal: "Round, regular, reactive" },
        { id: "eye_lens", label: "Lens", type: "select", lateral: true, options: ["Clear", "Immature cataract", "Mature cataract", "Hypermature cataract", "PCIOL", "Aphakia"], normal: "Clear" },
      ],
    },
    {
      id: "iop",
      title: "IOP",
      fields: [
        { id: "eye_iop", label: "IOP", type: "number", lateral: true, unit: "mmHg" },
        { id: "eye_iop_method", label: "Method", type: "select", options: ["NCT", "Goldmann", "Schiøtz", "Digital"] },
      ],
    },
    {
      id: "fundus",
      title: "Fundus",
      fields: [
        // No `normal`: "Fundus : NAD" is a finding doctors print.
        { id: "eye_fundus", label: "Fundus", type: "select", lateral: true, options: ["NAD", "Glaucomatous cupping", "Diabetic retinopathy", "Hypertensive retinopathy", "Papilloedema", "Retinal detachment", "Not visible"] },
        { id: "eye_cdr", label: "CDR", type: "text", lateral: true },
        { id: "eye_macula", label: "Macula", type: "select", lateral: true, options: ["Normal", "Oedema", "Drusen", "Scar", "Haemorrhage"], normal: "Normal" },
      ],
    },
    {
      id: "rop",
      title: "ROP screening",
      fields: [
        { id: "rop_stage", label: "Stage", type: "select", lateral: true, options: ["Immature, no ROP", "Stage 1", "Stage 2", "Stage 3", "Stage 4A", "Stage 4B", "Stage 5"] },
        { id: "rop_zone", label: "Zone", type: "select", lateral: true, options: ["Zone I", "Zone II", "Zone III"] },
        { id: "rop_plus", label: "Plus disease", type: "select", lateral: true, options: ["No plus", "Pre-plus", "Plus"] },
        { id: "rop_result", label: "Result", type: "select", options: ["Normal study", "ROP — follow-up", "ROP — treatment needed"] },
      ],
    },
  ],
};

const PULSE = ["Present", "Diminished", "Absent"];

export const VASCULAR_TEMPLATE: SpecialtyTemplateSchema = {
  sections: [
    {
      id: "pulses",
      title: "Peripheral pulses",
      fields: [
        { id: "vas_femoral", label: "Femoral", type: "select", lateral: true, options: PULSE },
        { id: "vas_popliteal", label: "Popliteal", type: "select", lateral: true, options: PULSE },
        { id: "vas_dp", label: "Dorsalis pedis", type: "select", lateral: true, options: PULSE },
        { id: "vas_pt", label: "Posterior tibial", type: "select", lateral: true, options: PULSE },
        { id: "vas_abpi", label: "ABPI", type: "number", lateral: true },
      ],
    },
    {
      id: "limb",
      title: "Limb",
      fields: [
        { id: "vas_skin", label: "Skin condition", type: "multiselect", lateral: true, options: ["Normal", "Colour change", "Redness", "Hyperpigmentation", "Lipodermatosclerosis", "Eczema", "Blisters"], normal: "Normal" },
        { id: "vas_ulcer", label: "Ulcer", type: "select", lateral: true, options: ["None", "Venous", "Arterial", "Diabetic", "Gangrene"], normal: "None" },
        { id: "vas_oedema", label: "Oedema", type: "select", lateral: true, options: ["None", "Pitting", "Non-pitting"], normal: "None" },
        { id: "vas_varicose", label: "Varicose veins", type: "select", lateral: true, options: ["None", "GSV territory", "SSV territory", "GSV + SSV"], normal: "None" },
        { id: "vas_calf", label: "Calf tenderness", type: "select", lateral: true, options: ["Absent", "Present"], normal: "Absent" },
        { id: "vas_temp", label: "Limb temperature", type: "select", lateral: true, options: ["Normal", "Cold", "Warm"], normal: "Normal" },
        { id: "vas_ceap", label: "CEAP class", type: "select", lateral: true, options: ["C0", "C1", "C2", "C3", "C4a", "C4b", "C5", "C6"] },
      ],
    },
  ],
};
