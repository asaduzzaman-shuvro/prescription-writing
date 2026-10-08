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
        { id: "ear_pinna", label: "Pinna / mastoid", type: "select", lateral: true, options: ["Normal", "Tender mastoid", "Pre-auricular sinus", "Post-aural scar", "Swelling"], normal: "Normal" },
        { id: "ear_eac", label: "EAC", type: "multiselect", lateral: true, options: ["Normal", "Wax", "Impacted wax", "Discharge", "Oedematous", "Fungal debris", "Furuncle", "Foreign body", "Narrow"], normal: "Normal" },
        { id: "ear_tm", label: "TM", type: "select", lateral: true, options: ["Intact", "Perforated", "Retracted", "Bulging", "Congested", "Dull", "Not visible"] },
        { id: "ear_tm_map", label: "TM map", type: "eardrum" },
        { id: "ear_perf_type", label: "Perforation", type: "select", lateral: true, options: ["Central", "Subtotal", "Total", "Attic", "Marginal"] },
        { id: "ear_perf_size", label: "Perforation size", type: "select", lateral: true, options: ["Small", "Medium", "Large"] },
        { id: "ear_discharge", label: "Discharge", type: "select", lateral: true, options: ["None", "Mucoid", "Mucopurulent", "Purulent", "Foul smelling", "Blood stained"], normal: "None" },
        { id: "ear_middle", label: "Middle ear", type: "multiselect", lateral: true, options: ["Healthy mucosa", "Oedematous mucosa", "Granulation", "Polyp", "Cholesteatoma flakes"] },
        { id: "ear_rinne", label: "Rinne", type: "select", lateral: true, options: ["+ve", "−ve", "False −ve"] },
        { id: "ear_weber", label: "Weber", type: "select", options: ["Central", "Lateralised to right", "Lateralised to left"] },
        { id: "ear_abc", label: "ABC", type: "select", lateral: true, options: ["Same as examiner", "Reduced"] },
        { id: "ear_fistula", label: "Fistula test", type: "select", options: ["Negative", "Positive"], normal: "Negative" },
        { id: "ear_facial", label: "Facial nerve", type: "select", options: ["Intact", "Palsy (right)", "Palsy (left)"], normal: "Intact" },
      ],
    },
    {
      id: "nose",
      title: "Nose & PNS",
      fields: [
        { id: "nose_external", label: "External nose", type: "select", options: ["Normal", "Deviated", "Saddle", "Swelling"], normal: "Normal" },
        { id: "nose_septum", label: "Septum", type: "select", options: ["Central", "DNS to right", "DNS to left", "S-shaped DNS", "Spur right", "Spur left", "Perforation", "Haematoma"] },
        { id: "nose_turbinate", label: "Inferior turbinate", type: "select", lateral: true, options: ["Normal", "Hypertrophied", "Pale & boggy", "Congested"], normal: "Normal" },
        { id: "nose_mucosa", label: "Mucosa", type: "select", options: ["Normal", "Pale", "Congested", "Crusting", "Atrophic"], normal: "Normal" },
        { id: "nose_discharge", label: "Nasal discharge", type: "select", lateral: true, options: ["None", "Watery", "Mucoid", "Mucopurulent", "Blood stained"], normal: "None" },
        { id: "nose_polyp", label: "Polyp", type: "select", lateral: true, options: ["Absent", "Present (grade 1)", "Present (grade 2)", "Present (grade 3)", "Antrochoanal"], normal: "Absent" },
        { id: "nose_cottle", label: "Cottle's test", type: "select", lateral: true, options: ["Negative", "Positive"], normal: "Negative" },
        { id: "nose_sinus_tender", label: "Sinus tenderness", type: "multiselect", options: ["None", "Maxillary", "Frontal", "Ethmoid"], normal: "None" },
        { id: "nose_map", label: "Nose & sinus map", type: "sketch", sketch: "nose" },
        { id: "nose_dne", label: "DNE findings", type: "text" },
      ],
    },
    {
      id: "throat",
      title: "Throat & neck",
      fields: [
        { id: "thr_oral", label: "Oral cavity", type: "select", options: ["Normal", "Ulcer", "Coated tongue", "Dental caries", "Trismus"], normal: "Normal" },
        { id: "thr_tonsil_grade", label: "Tonsil (Brodsky)", type: "select", lateral: true, options: ["Grade 0", "Grade 1", "Grade 2", "Grade 3", "Grade 4"] },
        { id: "thr_tonsil", label: "Tonsil surface", type: "multiselect", options: ["Normal", "Congested", "Pus in crypts", "Membrane", "Irwin Moore sign +", "Jugulodigastric LN enlarged"], normal: "Normal" },
        { id: "thr_ppw", label: "Posterior pharyngeal wall", type: "select", options: ["Normal", "Congested", "Granular", "Post-nasal drip", "Bulge"], normal: "Normal" },
        { id: "thr_uvula", label: "Uvula / palate", type: "select", options: ["Normal", "Pushed (quinsy)", "Bifid", "Elongated"], normal: "Normal" },
        { id: "thr_oro_map", label: "Oropharynx map", type: "sketch", sketch: "oropharynx" },
        { id: "thr_idl", label: "IDL / laryngoscopy", type: "text" },
        { id: "thr_cords", label: "Vocal cords", type: "select", options: ["Mobile, normal", "Nodule", "Polyp", "Congested", "Right cord palsy", "Left cord palsy", "Growth"] },
        { id: "thr_larynx_map", label: "Larynx map", type: "sketch", sketch: "larynx" },
        { id: "thr_neck", label: "Neck", type: "select", options: ["No lymphadenopathy", "LN enlarged right", "LN enlarged left", "Bilateral LN", "Thyroid swelling", "Midline swelling"], normal: "No lymphadenopathy" },
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
