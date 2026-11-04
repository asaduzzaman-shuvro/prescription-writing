import type { SpecialtyTemplateSchema } from "./specialty";

/**
 * Starter ENT examination template (admin-editable after seeding). Option lists follow standard
 * ENT practice and must be reviewed by an ENT consultant before production use.
 */
export const ENT_TEMPLATE: SpecialtyTemplateSchema = {
  sections: [
    {
      id: "ear",
      title: "Ear",
      fields: [
        { id: "ear_pinna", label: "Pinna / mastoid", type: "multiselect", lateral: true, options: ["Normal", "Tender mastoid", "Pre-auricular sinus", "Post-aural scar", "Swelling"], normal: "Normal" },
        { id: "ear_eac", label: "EAC", type: "multiselect", lateral: true, options: ["Normal", "Wax", "Impacted wax", "Discharge", "Oedematous", "Fungal debris", "Furuncle", "Foreign body", "Narrow"], normal: "Normal" },
        { id: "ear_tm", label: "TM", type: "select", lateral: true, options: ["Intact (Normal)", "Perforated", "Retracted", "Bulging", "Congested", "Dull", "Not visible"] },
        { id: "ear_tm_map", label: "TM map", type: "eardrum" },
        { id: "ear_perf_type", label: "Perforation", type: "select", lateral: true, options: ["Central (small)", "Central (medium)", "Central (large)", "Central (subtotal)", "Total", "Attic", "Marginal"] },
        { id: "ear_discharge", label: "Discharge", type: "multiselect", lateral: true, options: ["None", "Mucoid", "Mucopurulent", "Purulent", "Foul smelling", "Blood stained"], normal: "None" },
        { id: "ear_middle", label: "Middle ear", type: "multiselect", lateral: true, options: ["Healthy mucosa", "Oedematous mucosa", "Granulation", "Polyp", "Cholesteatoma flakes"] },
        { id: "ear_rinne", label: "Rinne", type: "select", lateral: true, options: ["+ve", "−ve", "False −ve"], group: "Tuning Fork Test (TFT)" },
        { id: "ear_weber", label: "Weber", type: "select", options: ["Central", "Lateralised to right", "Lateralised to left"], group: "Tuning Fork Test (TFT)" },
        { id: "ear_abc", label: "ABC", type: "select", lateral: true, options: ["Same as examiner", "Reduced"], group: "Tuning Fork Test (TFT)" },
        { id: "ear_fistula", label: "Fistula test", type: "select", lateral: true, options: ["Negative", "Positive"], normal: "Negative" },
        { id: "ear_facial", label: "Facial nerve", type: "select", options: ["Intact", "Palsy (right)", "Palsy (left)"], normal: "Intact" },
      ],
    },
    {
      id: "nose",
      title: "Nose & PNS",
      fields: [
        { id: "nose_external", label: "External nose", type: "multiselect", options: ["Normal", "Deviated", "Saddle", "Swelling"], normal: "Normal" },
        { id: "nose_septum", label: "Septum", type: "multiselect", options: ["Central", "DNS to right", "DNS to left", "S-shaped DNS", "Spur right", "Spur left", "Perforation", "Haematoma"], normal: "Central" },
        { id: "nose_turbinate", label: "Inferior turbinate", type: "multiselect", lateral: true, options: ["Normal", "Hypertrophied", "Pale & boggy", "Congested"], normal: "Normal" },
        { id: "nose_mucosa", label: "Mucosa", type: "multiselect", options: ["Normal", "Pale", "Congested", "Crusting", "Atrophic"], normal: "Normal" },
        { id: "nose_discharge", label: "Nasal discharge", type: "multiselect", lateral: true, options: ["None", "Watery", "Mucoid", "Mucopurulent", "Blood stained"], normal: "None" },
        { id: "nose_cavity", label: "Nasal cavity", type: "multiselect", lateral: true, options: ["Polyp", "Nasal mass", "Foreign body"] },
        { id: "nose_polyp", label: "Polyp", type: "select", lateral: true, options: ["Present (grade 1)", "Present (grade 2)", "Present (grade 3)", "Antrochoanal"], parent: { field: "nose_cavity", option: "Polyp" } },
        { id: "nose_mass", label: "Nasal mass", type: "text", lateral: true, parent: { field: "nose_cavity", option: "Nasal mass" } },
        { id: "nose_fb", label: "Foreign body", type: "text", lateral: true, parent: { field: "nose_cavity", option: "Foreign body" } },
        { id: "nose_sinus_tender", label: "Sinus tenderness", type: "multiselect", options: ["None", "Maxillary", "Frontal", "Ethmoid"], normal: "None" },
        { id: "nose_cottle", label: "Cottle's test", type: "select", lateral: true, options: ["Negative", "Positive"], normal: "Negative" },
        { id: "nose_map", label: "Nose & sinus map", type: "sketch", sketch: "nose" },
        { id: "nose_dne", label: "DNE findings", type: "text" },
      ],
    },
    {
      id: "throat",
      title: "Throat",
      fields: [
        { id: "thr_oral", label: "Oral cavity", type: "multiselect", options: ["Normal", "Ulcer", "Coated tongue", "Dental caries", "Trismus", "Mass", "Growth", "Other"], normal: "Normal" },
        { id: "thr_oral_ulcer", label: "Ulcer details", type: "text", parent: { field: "thr_oral", option: "Ulcer" } },
        { id: "thr_oral_mass", label: "Mass details", type: "text", parent: { field: "thr_oral", option: "Mass" } },
        { id: "thr_oral_growth", label: "Growth details", type: "text", parent: { field: "thr_oral", option: "Growth" } },
        { id: "thr_oral_other", label: "Other findings", type: "text", parent: { field: "thr_oral", option: "Other" } },
        { id: "thr_tonsil_grade", label: "Tonsil (Brodsky)", type: "select", lateral: true, options: ["Grade 0", "Grade 1", "Grade 2", "Grade 3", "Grade 4"] },
        { id: "thr_tonsil", label: "Tonsil surface", type: "multiselect", options: ["Normal", "Congested", "Anterior tonsillar pillar congested", "Pus in crypts", "Membrane", "Irwin Moore sign +", "Jugulodigastric LN enlarged"], normal: "Normal" },
        { id: "thr_ppw", label: "Posterior pharyngeal wall", type: "multiselect", options: ["Normal", "Congested", "Granular", "Post-nasal drip", "Bulge", "Growth/Mass"], normal: "Normal" },
        { id: "thr_ppw_growth", label: "Growth/Mass details", type: "text", parent: { field: "thr_ppw", option: "Growth/Mass" } },
        { id: "thr_uvula", label: "Uvula / palate", type: "select", options: ["Normal", "Pushed (quinsy)", "Bifid", "Elongated", "Cleft palate", "Ulcer/Growth/Mass"], normal: "Normal" },
        { id: "thr_uvula_cleft", label: "Cleft palate details", type: "text", parent: { field: "thr_uvula", option: "Cleft palate" } },
        { id: "thr_uvula_lesion", label: "Ulcer/Growth/Mass details", type: "text", parent: { field: "thr_uvula", option: "Ulcer/Growth/Mass" } },
        { id: "thr_oro_map", label: "Oropharynx map", type: "sketch", sketch: "oropharynx" },
        { id: "thr_idl", label: "FOL or I/L findings", type: "text" },
        { id: "thr_cords", label: "Vocal cords", type: "select", options: ["Mobile, normal", "Nodule", "Polyp (right)", "Polyp (left)", "Congested", "Right cord palsy", "Left cord palsy", "Growth (right)", "Growth (left)", "Ulcer (right)", "Ulcer (left)"] },
        { id: "thr_larynx_map", label: "Larynx map", type: "sketch", sketch: "larynx" },
      ],
    },
    {
      // Field ids keep their "thr_" prefix: saved findings are keyed by them (the neck used to sit under Throat).
      id: "neck",
      title: "Neck",
      fields: [
        { id: "thr_neck", label: "Neck", type: "multiselect", options: ["Thyroid swelling", "Other swelling", "No lymphadenopathy", "LN enlarged right", "LN enlarged left", "Bilateral LN"], normal: "No lymphadenopathy" },
        { id: "thr_neck_thyroid", label: "Thyroid swelling details", type: "text", parent: { field: "thr_neck", option: "Thyroid swelling" } },
        { id: "thr_neck_other", label: "Other swelling details", type: "text", parent: { field: "thr_neck", option: "Other swelling" } },
        { id: "thr_neck_ln_r", label: "LN enlarged right details", type: "text", parent: { field: "thr_neck", option: "LN enlarged right" } },
        { id: "thr_neck_ln_l", label: "LN enlarged left details", type: "text", parent: { field: "thr_neck", option: "LN enlarged left" } },
        { id: "thr_neck_ln_bl", label: "Bilateral LN details", type: "text", parent: { field: "thr_neck", option: "Bilateral LN" } },
        { id: "thr_neck_map", label: "Neck map", type: "sketch", sketch: "neck" },
      ],
    },
    {
      id: "audiology",
      title: "Audiology",
      fields: [
        { id: "aud_pta", label: "PTA", type: "audiogram" },
        { id: "aud_tymp", label: "Tympanogram", type: "select", lateral: true, options: ["Type A", "Type As", "Type Ad", "Type B", "Type C"] },
        { id: "aud_reflex", label: "Acoustic reflex", type: "select", lateral: true, options: ["Present", "Absent"] },
      ],
    },
    {
      id: "procedure",
      title: "Procedure done",
      fields: [
        { id: "proc_done", label: "Procedure", type: "multiselect", options: ["Aural toilet / suction", "Wax removal (syringing)", "Wax removal (instrumental)", "Foreign body removal", "Ear wick insertion", "Epley manoeuvre", "Nasal packing", "Chemical cautery (Little's area)", "Incision & drainage (quinsy)", "FNAC", "Nasal endoscopy"] },
        { id: "proc_note", label: "Procedure note", type: "text" },
      ],
    },
  ],
};
