export type SakuraChamber = {
  id: number;
  name: string;
  isActive?: boolean;
  availableDays?: string[] | null;
  openingTime?: string | null;
  closingTime?: string | null;
  appointmentNumber?: string;
  feeFirstTime?: number;
  feeFollowup?: number;
  waitingTimeVisit?: number;
};

export type SakuraPatientRecord = {
  id?: number;
  fullName?: string;
  phone?: string;
  patientId?: string;
  gender?: string;
  age?: number;
  months?: number;
  district?: string;
  upazila?: string;
  unionName?: string;
  union?: string;
  isNewPatient?: boolean;
};

export type SakuraParentSlot = {
  id: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  bookedTimes?: string[];
  bookedPatients?: number;
  maxPatients?: number;
  offPeriods?: { offTimeStart: string; offTimeEnd: string }[] | null;
  offTimeStart?: string | null;
  offTimeEnd?: string | null;
};

export type SakuraPatient = {
  fullName: string;
  patientId: string;
  phone: string;
  isNewPatient?: boolean;
  gender?: string | null;
  age?: number | null;
  months?: number | null;
  district?: string | null;
  upazila?: string | null;
  unionName?: string | null;
  address?: string | null;
};

export type SakuraOtCaseForm = {
  procedure?: string;
  side?: string;
  plannedDate?: string;
  priority?: string;
  anesthesia?: string;
  diagnosis?: string;
  notes?: string;
};

export type SakuraResearchCaseForm = {
  studyTitle?: string;
  studyCode?: string;
  consentTaken?: string;
  visitType?: string;
  inclusionNotes?: string;
  notes?: string;
};

export type SakuraCaseDetails = {
  caseType: "OT Case" | "Research Case";
  ot?: SakuraOtCaseForm;
  research?: SakuraResearchCaseForm;
};

export type SakuraAppointment = {
  id: number;
  serialNumber: number;
  /** Letter suffix a–z for linked patients under the same parent (display as 2.a). */
  serialSuffix?: string | null;
  parentAppointmentId?: number | null;
  chamberId?: number;
  patient: SakuraPatient;
  appointmentTime?: string;
  appointmentSlot?: { startTime?: string; endTime?: string };
  status: string;
  isPresent: boolean;
  identifier?: string;
  caseDetails?: SakuraCaseDetails | null;
  notes?: string | null;
  isAutoBooked?: boolean;
  autoBookCategory?: "patient" | "doctor" | "clinic" | null;
  chamber?: { name: string; feeFirstTime?: number; feeFollowup?: number };
  appointmentDate?: string;
};

export type SakuraChamberStats = {
  total: number;
  waiting: number;
  running: number;
  seen: number;
  absent: number;
  report: number;
};

export type SakuraTodayResponse = {
  appointments?: SakuraAppointment[];
  totalAppointments?: number;
  waitingAppointments?: number;
  runningAppointments?: number;
  seenAppointments?: number;
  absentAppointments?: number;
  reportAppointments?: number;
};

export type SakuraBreakStatus = {
  isOnBreak?: boolean;
  notes?: string;
  duration?: number;
  id?: number;
};

export type SakuraUser = {
  id: number;
  phone: string;
  role: string;
  fullName?: string;
  name?: string;
};
