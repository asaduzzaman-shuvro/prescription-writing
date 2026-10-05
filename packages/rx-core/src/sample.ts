import type { ChamberHeader, DoctorHeader, PatientInfo, PrescriptionDoc } from "./types";

/** Fixture used by the print spike, tests and the admin print-preview. */
export const SAMPLE_DOCTOR: DoctorHeader = {
  nameEn: "Dr. Farhana Rahman",
  nameBn: "ডাঃ ফারহানা রহমান",
  degreesEn: ["MBBS", "FCPS (ENT)"],
  degreesBn: ["এমবিবিএস", "এফসিপিএস (নাক, কান ও গলা)"],
  designation: "Consultant, ENT & Head-Neck Surgery",
  institution: "Dhaka Medical College Hospital",
  specialty: "নাক, কান ও গলা রোগ বিশেষজ্ঞ",
  bmdcNumber: "A-12345",
};

export const SAMPLE_CHAMBER: ChamberHeader = {
  name: "Popular Diagnostic Centre, Dhanmondi",
  address: "House 16, Road 2, Dhanmondi, Dhaka-1205",
  phone: "Serial: 01700-000000",
  hours: "Sat–Thu, 5pm–9pm",
};

export const SAMPLE_PATIENT: PatientInfo = {
  name: "Md. Abdul Karim",
  ageYears: 34,
  sex: "male",
  mobile: "01711000000",
  patientCode: "P-000123",
};

export const SAMPLE_DOC: PrescriptionDoc = {
  chiefComplaints: ["Ear discharge (R) × 2 months", "Hearing loss (R)", "জ্বর ও গলা ব্যথা ৩ দিন"],
  vitals: { bpSystolic: 120, bpDiastolic: 80, pulse: 78, tempF: 99.2, weightKg: 68, heightCm: 170 },
  examination: "Throat congested",
  specialtyFindings: [
    {
      title: "Ear",
      lines: [
        { label: "R TM", value: "Central perforation, medium, mucopurulent discharge" },
        { label: "L TM", value: "Intact" },
        { label: "Rinne", value: "R −ve, L +ve" },
      ],
    },
  ],
  investigations: ["PTA", "X-ray mastoid (Schüller view)", "CBC"],
  diagnoses: ["CSOM (R) — tubotympanic", "Acute pharyngitis"],
  items: [
    {
      id: "1",
      form: "Tab.",
      brandName: "Napa Extend",
      genericName: "Paracetamol",
      strength: "665 mg",
      frequency: { kind: "pattern", slots: [1, 0, 1] },
      timing: "after_food",
      duration: { kind: "fixed", value: 5, unit: "day" },
    },
    {
      id: "2",
      form: "Cap.",
      brandName: "Moxacil",
      genericName: "Amoxicillin",
      strength: "500 mg",
      frequency: { kind: "pattern", slots: [1, 1, 1] },
      timing: "after_food",
      duration: { kind: "fixed", value: 7, unit: "day" },
      isAntibiotic: true,
    },
    {
      id: "3",
      form: "Ear Drop",
      brandName: "Ciprocin",
      genericName: "Ciprofloxacin",
      strength: "0.3%",
      frequency: { kind: "times_per_day", times: 3 },
      doseQty: 2,
      doseUnit: "drop",
      route: "ear",
      side: "right",
      duration: { kind: "fixed", value: 7, unit: "day" },
      note: "ঔষধ দেওয়ার পর ৫ মিনিট কাত হয়ে থাকবেন",
    },
    {
      id: "4",
      form: "Syp.",
      brandName: "Fexo",
      genericName: "Fexofenadine",
      strength: "30 mg/5 ml",
      frequency: { kind: "pattern", slots: [0, 0, 1] },
      doseQty: 2,
      doseUnit: "tsf",
      timing: "bedtime",
      duration: { kind: "continue" },
    },
  ],
  advice: ["কানে পানি ঢুকাবেন না", "ঠান্ডা খাবার পরিহার করুন", "কুসুম গরম লবণ পানি দিয়ে গড়গড়া করবেন — দিনে ৩ বার"],
  followUp: { kind: "after", value: 7, unit: "day" },
};

/** Test strings covering stacked Bangla conjuncts. */
export const BANGLA_CONJUNCT_SAMPLE = "ক্ষ ন্ত্র জ্ঞ ষ্ট্র ক্স ঙ্ক্ষ স্ত্র — ১+০+১ খাবারের পরে NAPA EXTEND";
