"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BookingRealtimeClient } from "@/lib/sakura/booking-realtime";
import { sakuraApi, SakuraApiError } from "@/lib/sakura/client";
import {
  formatTime12h,
  minuteInDoctorBreak,
  normalizeTimeStr,
  parseTimeToMinutes,
} from "@/lib/sakura/slot-utils";
import type {
  SakuraChamber,
  SakuraParentSlot,
  SakuraPatientRecord,
} from "@/lib/sakura/types";
import { resolveDefaultChamberId } from "@/lib/sakura/utils";
import styles from "./sakura-dashboard.module.css";

const IDENTIFIER_TYPES = [
  "New",
  "Old",
  "Lab Report",
  "Emergency",
  "OT Case",
  "Research Case",
  "Customize",
] as const;

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const DISTRICTS = [
  "Dhaka",
  "Chittagong",
  "Rajshahi",
  "Khulna",
  "Barisal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
  "Comilla",
  "Gazipur",
  "Narayanganj",
];

type FormState = {
  chamberId: string;
  appointmentSlotId: string;
  appointmentTime: string;
  phone: string;
  fullName: string;
  identifier: string;
  gender: string;
  age: number;
  months: number;
  appointmentDate: string;
  district: string;
  upazila: string;
  union: string;
  fee: number;
  refererDoctor: string;
  refererPC: string;
  notes: string;
};

type TimeCell = {
  time: string;
  parentSlotId: number;
  isBooked: boolean;
  isActive: boolean;
  isPeerHeld?: boolean;
};

type FlatSlot = { sequence: number; timeSlot: TimeCell; parentSlot: SakuraParentSlot };

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(date = todayIso()): FormState {
  return {
    chamberId: "",
    appointmentSlotId: "",
    appointmentTime: "",
    phone: "",
    fullName: "",
    identifier: "New",
    gender: "",
    age: 0,
    months: 0,
    appointmentDate: date,
    district: "",
    upazila: "",
    union: "",
    fee: 0,
    refererDoctor: "",
    refererPC: "",
    notes: "",
  };
}

function normalizeIdentifier(raw: string | undefined | null): string {
  if (!raw) return "New";
  if (raw === "Lab" || raw === "Report") return "Lab Report";
  if ((IDENTIFIER_TYPES as readonly string[]).includes(raw)) return raw;
  return "New";
}

function phoneOk(phone: string) {
  return /^01[3-9]\d{8}$/.test(phone);
}

type Props = {
  mode: "create" | "edit";
  appointmentId?: number | null;
  defaultDate?: string;
  defaultChamberId?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SakuraAppointmentModal({
  mode,
  appointmentId = null,
  defaultDate,
  defaultChamberId,
  onClose,
  onSaved,
}: Props) {
  const isEdit = mode === "edit" && appointmentId != null;
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultDate || todayIso()));
  const [chambers, setChambers] = useState<SakuraChamber[]>([]);
  const [availableSlots, setAvailableSlots] = useState<SakuraParentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeCell | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [foundPatients, setFoundPatients] = useState<SakuraPatientRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<SakuraPatientRecord | null>(null);
  const [patientListOpen, setPatientListOpen] = useState(false);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [resultModal, setResultModal] = useState<"success" | "error" | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [resultSerial, setResultSerial] = useState<number | null>(null);
  const [holdsTick, setHoldsTick] = useState(0);
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSlotReload = useRef(false);
  const realtimeRef = useRef<BookingRealtimeClient | null>(null);
  const selectedSlotRef = useRef<TimeCell | null>(null);
  const isEditRef = useRef(isEdit);

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    isEditRef.current = isEdit;
  }, [isEdit]);

  useEffect(() => {
    const client = new BookingRealtimeClient(
      () => setHoldsTick((t) => t + 1),
      (data) => {
        if (isEditRef.current) return;
        const sel = selectedSlotRef.current;
        if (!sel || sel.parentSlotId !== data.appointmentSlotId) return;
        const k1 = BookingRealtimeClient.slotHoldKey(sel.parentSlotId, sel.time);
        const k2 = BookingRealtimeClient.slotHoldKey(
          data.appointmentSlotId,
          data.appointmentTime,
        );
        if (k1 !== k2) return;
        if (data.reason !== "expired" && data.reason !== "disconnect") return;
        client.clearAfterServerRelease();
        setSelectedSlot(null);
        setSelectedSequence(null);
        setForm((prev) => ({ ...prev, appointmentSlotId: "", appointmentTime: "" }));
        if (data.reason === "expired") {
          setError("Your slot reservation expired. Please choose a time again.");
        }
      },
    );
    realtimeRef.current = client;
    return () => {
      client.destroy();
      realtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    realtimeRef.current?.syncRoom(form.chamberId, form.appointmentDate);
  }, [form.chamberId, form.appointmentDate]);

  const patch = useCallback((partial: Partial<FormState>, mark?: string[]) => {
    setForm((prev) => ({ ...prev, ...partial }));
    if (mark?.length) {
      setTouched((t) => {
        const next = { ...t };
        for (const k of mark) next[k] = true;
        return next;
      });
    }
  }, []);

  const updateFee = useCallback(
    (identifier: string, chamberId: string, list: SakuraChamber[]) => {
      if (identifier === "Customize" || !chamberId) return;
      const chamber = list.find((c) => c.id === +chamberId);
      if (!chamber) return;
      const fee = identifier === "New" ? chamber.feeFirstTime ?? 0 : chamber.feeFollowup ?? 0;
      setForm((prev) => ({ ...prev, fee: Number(fee) || 0 }));
    },
    [],
  );

  const loadSlots = useCallback(async (chamberId: string, date: string, excludeId?: number | null) => {
    if (!chamberId || !date) {
      setAvailableSlots([]);
      return;
    }
    setLoadingSlots(true);
    try {
      const params = new URLSearchParams({ chamberId, date });
      if (excludeId) params.set("excludeAppointmentId", String(excludeId));
      const response = await sakuraApi.get<SakuraParentSlot[]>(
        `/appointment-slots/available?${params}`,
      );
      const list = (Array.isArray(response) ? response : [])
        .filter((s) => s.isActive !== false)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      setAvailableSlots(list);
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const generateTimeSlots = useCallback(
    (slot: SakuraParentSlot, chamberId: string, reserved?: { slotId: number; time: string }) => {
      const start = parseTimeToMinutes(slot.startTime);
      const end = parseTimeToMinutes(slot.endTime);
      const chamber = chambers.find((c) => c.id === +chamberId);
      const interval = chamber?.waitingTimeVisit || 15;
      const totalSlots = Math.floor((end - start) / interval);
      const bookedTimes = slot.bookedTimes || [];
      const cells: TimeCell[] = [];

      for (let i = 0; i < totalSlots; i++) {
        const timeInMinutes = start + i * interval;
        if (minuteInDoctorBreak(timeInMinutes, slot, interval)) continue;
        const hours = Math.floor(timeInMinutes / 60);
        const minutes = timeInMinutes % 60;
        const timeString = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
        const baseBooked = bookedTimes.some((bookedTime) => {
          let n = bookedTime ? bookedTime.trim() : "";
          if (n.length === 5) n = `${n}:00`;
          return n === timeString;
        });
        const reservedHere =
          reserved &&
          reserved.slotId === slot.id &&
          normalizeTimeStr(reserved.time) === timeString;
        const rt = realtimeRef.current;
        const socketBooked = !!rt?.isPeerBooked(slot.id, timeString);
        const isBooked = !reservedHere && (baseBooked || socketBooked);
        const isPeerHeld = !isBooked && !!rt?.isPeerHeld(slot.id, timeString);
        cells.push({
          time: timeString,
          parentSlotId: slot.id,
          isBooked,
          isActive: slot.isActive !== false,
          isPeerHeld,
        });
      }
      return cells;
    },
    [chambers],
  );

  const flattened = useMemo(() => {
    const reserved =
      isEdit && form.appointmentSlotId && form.appointmentTime
        ? { slotId: Number(form.appointmentSlotId), time: form.appointmentTime }
        : undefined;
    const items: FlatSlot[] = [];
    let n = 1;
    for (const slot of availableSlots) {
      for (const timeSlot of generateTimeSlots(slot, form.chamberId, reserved)) {
        items.push({ sequence: n++, timeSlot, parentSlot: slot });
      }
    }
    return items;
    // holdsTick forces recompute when socket peer holds/booked change
  }, [
    availableSlots,
    form.appointmentSlotId,
    form.appointmentTime,
    form.chamberId,
    generateTimeSlots,
    holdsTick,
    isEdit,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await sakuraApi.get<SakuraChamber[]>("/chambers");
        const active = (Array.isArray(list) ? list : []).filter((c) => c.isActive !== false);
        if (cancelled) return;
        setChambers(active);

        if (isEdit && appointmentId) {
          const apt = await sakuraApi.get<any>(`/appointments/${appointmentId}`);
          if (cancelled) return;
          const p = apt.patient as SakuraPatientRecord | undefined;
          const dateStr = apt.appointmentDate
            ? new Date(apt.appointmentDate).toISOString().split("T")[0]!
            : todayIso();
          const identifier = normalizeIdentifier(apt.identifier);
          const chamberId = String(apt.chamberId ?? "");
          const next: FormState = {
            chamberId,
            appointmentSlotId: apt.appointmentSlotId != null ? String(apt.appointmentSlotId) : "",
            appointmentTime: normalizeTimeStr(apt.appointmentTime),
            phone: p?.phone || "",
            fullName: p?.fullName || "",
            identifier,
            gender: p?.gender || "",
            age: p?.age ?? 0,
            months: p?.months ?? 0,
            appointmentDate: dateStr,
            district: p?.district || "",
            upazila: p?.upazila || "",
            union: p?.unionName || p?.union || "",
            fee: apt.fee != null ? Number(apt.fee) : 0,
            refererDoctor: apt.refererDoctor || "",
            refererPC: apt.refererPC || "",
            notes: apt.notes || "",
          };
          setForm(next);
          setSelectedPatient(p || null);
          setFoundPatients(p ? [p] : []);
          skipNextSlotReload.current = true;
          await loadSlots(chamberId, dateStr, appointmentId);
          if (apt.appointmentSlotId && apt.appointmentTime) {
            const norm = normalizeTimeStr(apt.appointmentTime);
            setSelectedSlot({
              time: norm,
              parentSlotId: Number(apt.appointmentSlotId),
              isBooked: false,
              isActive: true,
            });
          }
        } else {
          const date = defaultDate || todayIso();
          const chamberId =
            defaultChamberId != null
              ? defaultChamberId
              : resolveDefaultChamberId(active, date);
          const chamberStr = chamberId != null ? String(chamberId) : "";
          const base = emptyForm(date);
          base.chamberId = chamberStr;
          setForm(base);
          updateFee("New", chamberStr, active);
          if (chamberStr) await loadSlots(chamberStr, date);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load form");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, isEdit]);

  useEffect(() => {
    if (loading || skipNextSlotReload.current) {
      skipNextSlotReload.current = false;
      return;
    }
    setSelectedSlot(null);
    setSelectedSequence(null);
    setForm((prev) => ({ ...prev, appointmentSlotId: "", appointmentTime: "" }));
    void loadSlots(form.chamberId, form.appointmentDate, isEdit ? appointmentId : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.chamberId, form.appointmentDate]);

  useEffect(() => {
    updateFee(form.identifier, form.chamberId, chambers);
  }, [form.identifier, form.chamberId, chambers, updateFee]);

  function clearPatientInfo(keepPhone = true) {
    setForm((prev) => ({
      ...prev,
      fullName: "",
      gender: "",
      age: 0,
      months: 0,
      district: "",
      upazila: "",
      union: "",
      phone: keepPhone ? prev.phone : "",
    }));
  }

  function selectPatient(patient: SakuraPatientRecord) {
    setSelectedPatient(patient);
    setPatientListOpen(false);
    setForm((prev) => ({
      ...prev,
      fullName: patient.fullName || "",
      gender: patient.gender || "",
      age: patient.age || 0,
      months: patient.months || 0,
      district: patient.district || "",
      upazila: patient.upazila || "",
      union: patient.unionName || patient.union || "",
    }));
  }

  function onPhoneChange(phone: string) {
    patch({ phone });
    setSelectedPatient(null);
    setFoundPatients([]);
    setPatientListOpen(false);
    if (phoneTimer.current) clearTimeout(phoneTimer.current);
    phoneTimer.current = setTimeout(() => {
      if (phone.length === 11 && phoneOk(phone)) {
        void searchPatient(phone);
      } else if (phone.length === 11 || phone.length === 0) {
        clearPatientInfo(true);
      }
    }, 300);
  }

  async function searchPatient(phone: string) {
    setSearchingPatient(true);
    try {
      const patients = await sakuraApi.get<SakuraPatientRecord[]>(`/patients/by-phone/${phone}`);
      if (!Array.isArray(patients) || patients.length === 0) {
        setFoundPatients([]);
        setSelectedPatient(null);
        setPatientListOpen(false);
        clearPatientInfo(true);
        return;
      }
      setFoundPatients(patients);
      if (patients.length === 1) {
        selectPatient(patients[0]!);
        setPatientListOpen(false);
      } else {
        setSelectedPatient(null);
        setPatientListOpen(true);
      }
    } catch {
      setFoundPatients([]);
      setSelectedPatient(null);
      setPatientListOpen(false);
      clearPatientInfo(true);
    } finally {
      setSearchingPatient(false);
    }
  }

  async function selectTimeSlot(
    timeSlot: TimeCell,
    parentSlot: SakuraParentSlot,
    sequence: number,
  ) {
    if (timeSlot.isBooked || !timeSlot.isActive) return;
    const rt = realtimeRef.current;
    if (
      rt?.isPeerBooked(timeSlot.parentSlotId, timeSlot.time) ||
      rt?.isPeerHeld(timeSlot.parentSlotId, timeSlot.time)
    ) {
      return;
    }

    if (isEdit) {
      const same =
        selectedSlot?.time === timeSlot.time &&
        selectedSlot?.parentSlotId === timeSlot.parentSlotId;
      if (same) {
        setSelectedSlot(null);
        setSelectedSequence(null);
        patch({ appointmentSlotId: "", appointmentTime: "" });
      } else {
        setSelectedSlot(timeSlot);
        setSelectedSequence(sequence);
        patch({
          appointmentSlotId: String(parentSlot.id),
          appointmentTime: timeSlot.time,
        });
      }
      return;
    }

    const cid = Number(form.chamberId);
    const dateStr = form.appointmentDate.split("T")[0] || form.appointmentDate;
    if (!form.chamberId || !dateStr || Number.isNaN(cid)) return;

    const same =
      selectedSlot?.time === timeSlot.time && selectedSlot?.parentSlotId === timeSlot.parentSlotId;
    if (same) {
      rt?.releaseCurrentHoldQuiet();
      setSelectedSlot(null);
      setSelectedSequence(null);
      patch({ appointmentSlotId: "", appointmentTime: "" });
      return;
    }

    if (selectedSlot) rt?.releaseCurrentHoldQuiet();

    const ok = rt?.isSocketConnected()
      ? await rt.requestSlotHold(cid, dateStr, parentSlot, timeSlot)
      : true;
    if (ok) {
      setSelectedSlot(timeSlot);
      setSelectedSequence(sequence);
      patch({
        appointmentSlotId: String(parentSlot.id),
        appointmentTime: timeSlot.time,
      });
      setError("");
    } else {
      setError("Could not reserve this time. It may be held or taken by someone else.");
      setHoldsTick((t) => t + 1);
    }
  }

  function slotBtnClass(timeSlot: TimeCell): string {
    const isSelected =
      selectedSlot?.time === timeSlot.time && selectedSlot?.parentSlotId === timeSlot.parentSlotId;
    const isOurEdit =
      isEdit &&
      Number(form.appointmentSlotId) === timeSlot.parentSlotId &&
      normalizeTimeStr(form.appointmentTime) === timeSlot.time;
    const peerHeld =
      !!timeSlot.isPeerHeld ||
      !!realtimeRef.current?.isPeerHeld(timeSlot.parentSlotId, timeSlot.time);

    if (!timeSlot.isActive) return "bg-slate-300 text-slate-500 cursor-not-allowed opacity-60";
    if (timeSlot.isBooked) return "bg-red-500 text-white cursor-not-allowed opacity-80 border-2 border-red-600";
    if (peerHeld) return "bg-orange-500 text-white cursor-not-allowed opacity-95 border-2 border-orange-600";
    if (isSelected) return "bg-green-700 text-white border-2 border-green-800 ring-2 ring-green-400";
    if (isOurEdit)
      return "bg-green-500 text-white border-2 border-green-700 ring-2 ring-green-300 hover:bg-green-600 cursor-pointer shadow-sm";
    return "bg-green-500 text-white hover:bg-green-600 cursor-pointer border border-green-600";
  }

  function validate(): boolean {
    const marks: Record<string, boolean> = {
      chamberId: true,
      appointmentDate: true,
      phone: true,
      fullName: true,
      identifier: true,
      gender: true,
      age: true,
    };
    if (form.identifier === "Customize") marks.fee = true;
    setTouched(marks);
    if (!form.chamberId) return false;
    if (!form.appointmentDate) return false;
    if (!phoneOk(form.phone)) return false;
    if (!form.fullName.trim() || form.fullName.trim().length < 2) return false;
    if (!form.identifier) return false;
    if (!form.gender) return false;
    if (form.age < 0 || form.age > 150) return false;
    if (form.identifier === "Customize" && (form.fee < 0 || Number.isNaN(form.fee))) return false;
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError("");
    const body: Record<string, unknown> = {
      chamberId: Number(form.chamberId),
      phone: form.phone.trim(),
      fullName: form.fullName.trim(),
      identifier: form.identifier || "New",
      gender: form.gender,
      age: Number(form.age) || 0,
      months: Number(form.months) || 0,
      appointmentDate: form.appointmentDate,
      district: form.district || undefined,
      upazila: form.upazila || undefined,
      union: form.union || undefined,
      fee: Number(form.fee) || 0,
      refererDoctor: form.refererDoctor || undefined,
      refererPC: form.refererPC || undefined,
      notes: form.notes || undefined,
    };
    if (selectedSlot?.time && form.appointmentSlotId) {
      body.appointmentSlotId = Number(form.appointmentSlotId);
      body.appointmentTime = normalizeTimeStr(selectedSlot.time);
    }
    const holdToken = realtimeRef.current?.holdToken;
    if (holdToken) body.holdToken = holdToken;

    try {
      if (isEdit && appointmentId) {
        await sakuraApi.put(`/appointments/${appointmentId}`, body);
        setResultSerial(null);
        setResultMessage("Appointment updated successfully.");
        setResultModal("success");
      } else {
        const response = await sakuraApi.post<any>("/appointments", body);
        realtimeRef.current?.clearAfterServerRelease();
        const raw = response?.serialNumber ?? selectedSequence ?? null;
        const n = raw != null && raw !== "" ? Number(raw) : NaN;
        setResultSerial(Number.isFinite(n) ? n : null);
        setResultMessage("Your appointment is confirmed.");
        setResultModal("success");
      }
    } catch (err) {
      const msg =
        err instanceof SakuraApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : isEdit
              ? "Failed to update appointment."
              : "Failed to book appointment.";
      setResultMessage(msg);
      setResultModal("error");
    } finally {
      setSubmitting(false);
    }
  }

  function closeResult() {
    const wasSuccess = resultModal === "success";
    setResultModal(null);
    setResultMessage("");
    setResultSerial(null);
    if (!wasSuccess) return;
    onSaved();
    onClose();
  }

  const invalid = (key: keyof FormState) => {
    if (!touched[key]) return false;
    if (key === "phone") return !phoneOk(form.phone);
    if (key === "fullName") return form.fullName.trim().length < 2;
    if (key === "chamberId" || key === "appointmentDate" || key === "identifier" || key === "gender") {
      return !form[key];
    }
    if (key === "age") return form.age < 0 || form.age > 150;
    if (key === "fee") return form.identifier === "Customize" && (form.fee < 0 || Number.isNaN(form.fee));
    return false;
  };

  const inputClass = (key: keyof FormState) =>
    `${styles.aptInput} ${invalid(key) ? styles.aptInputError : ""}`;

  return (
    <div className={styles.modalBackdrop} style={{ zIndex: 110 }} onClick={onClose} role="dialog">
      <div className={styles.aptModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.aptModalHead}>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <Ms name={isEdit ? "edit_calendar" : "event_available"} className="text-xl" />
            </span>
            <div>
              <h2 className={styles.aptModalHeadTitle}>
                {isEdit ? "Change this visit" : "Book New Appointment"}
              </h2>
              <p className={styles.aptModalHeadSub}>
                {isEdit
                  ? "Change name, time, or chamber, then Save."
                  : "Patient name, chamber, date, and serial."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-white/90 hover:bg-white/10"
            onClick={onClose}
            aria-label="Close"
          >
            <Ms name="close" className="text-xl" />
          </button>
        </div>

        <div className={styles.aptModalBody}>
          {loading ? (
            <div className="flex items-center justify-center py-14 text-sm text-[var(--sg-muted)]">
              <span className="mr-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--sg-green)] border-t-transparent" />
              Loading…
            </div>
          ) : (
            <form id="sakura-apt-form" onSubmit={(e) => void onSubmit(e)} className="space-y-1">
              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <Ms name="error" className="text-red-600" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-x-2 gap-y-px sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Chamber" icon="apartment" required error={invalid("chamberId") ? "Please select a chamber" : ""}>
                  <select
                    className={inputClass("chamberId")}
                    value={form.chamberId}
                    onChange={(e) => patch({ chamberId: e.target.value }, ["chamberId"])}
                  >
                    <option value="">Select Chamber</option>
                    {chambers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.appointmentNumber ? ` - ${c.appointmentNumber}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Appointment Date"
                  icon="calendar_today"
                  required
                  error={invalid("appointmentDate") ? "Please select appointment date" : ""}
                >
                  <input
                    type="date"
                    className={inputClass("appointmentDate")}
                    value={form.appointmentDate}
                    onChange={(e) => patch({ appointmentDate: e.target.value }, ["appointmentDate"])}
                  />
                </Field>

                <Field
                  label="Phone Number"
                  icon="phone"
                  required
                  spinning={searchingPatient}
                  error={invalid("phone") ? "Please enter a valid phone number (01XXXXXXXXX)" : ""}
                >
                  <div className={styles.aptPhoneWrap}>
                    <div className={styles.aptPhoneInputRow}>
                      <input
                        type="tel"
                        className={`${inputClass("phone")} ${foundPatients.length > 1 && !selectedPatient ? styles.aptPhoneInputWithToggle : ""}`}
                        placeholder="01710000000"
                        value={form.phone}
                        onChange={(e) => onPhoneChange(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                      />
                      {foundPatients.length > 1 && !selectedPatient && (
                        <button
                          type="button"
                          className={styles.aptPhoneToggle}
                          aria-expanded={patientListOpen}
                          aria-label={patientListOpen ? "Hide patient list" : "Show patient list"}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setPatientListOpen((open) => !open)}
                        >
                          <Ms name={patientListOpen ? "expand_less" : "expand_more"} className="text-xl" />
                        </button>
                      )}
                    </div>
                    {foundPatients.length > 1 && !selectedPatient && patientListOpen && (
                      <div className={styles.aptPatientDropdown} role="listbox">
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-[var(--sg-ink)]">
                          <Ms name="info" className="text-base text-[var(--sg-green)]" />
                          Multiple patients found with this phone number:
                        </p>
                        <div className={`${styles.aptPatientDropdownList} space-y-1.5`}>
                          {foundPatients.map((p, i) => (
                            <button
                              key={p.id ?? i}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectPatient(p)}
                              className="w-full rounded-lg border border-[var(--sg-line)] bg-white px-3 py-2 text-left text-sm transition-colors hover:border-[var(--sg-green)] hover:bg-[var(--sg-mint)]"
                            >
                              <div className="font-semibold text-[var(--sg-ink)]">{p.fullName}</div>
                              <div className="text-xs text-[var(--sg-muted)]">
                                Age: {p.age}
                                {p.months ? `.${p.months}` : ""} | Gender: {p.gender || "N/A"} | ID:{" "}
                                {p.patientId}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Field>

                <Field
                  label="Patient Name"
                  icon="person"
                  required
                  error={invalid("fullName") ? "Please enter patient name" : ""}
                >
                  <input
                    type="text"
                    className={inputClass("fullName")}
                    placeholder="Enter full name"
                    value={form.fullName}
                    onChange={(e) => patch({ fullName: e.target.value }, ["fullName"])}
                  />
                </Field>

                <Field label="Type" icon="label" required error={invalid("identifier") ? "Please select a type" : ""}>
                  <select
                    className={inputClass("identifier")}
                    value={form.identifier}
                    onChange={(e) => patch({ identifier: e.target.value }, ["identifier"])}
                  >
                    <option value="">Select Type</option>
                    {IDENTIFIER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Gender" icon="female" required error={invalid("gender") ? "Please select gender" : ""}>
                  <select
                    className={inputClass("gender")}
                    value={form.gender}
                    onChange={(e) => patch({ gender: e.target.value }, ["gender"])}
                  >
                    <option value="">Select Gender</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Age (Years)" icon="cake" required error={invalid("age") ? "Please enter a valid age" : ""}>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    className={inputClass("age")}
                    value={form.age}
                    onChange={(e) => patch({ age: Number(e.target.value) || 0 }, ["age"])}
                  />
                </Field>

                <Field label="Months" icon="">
                  <input
                    type="number"
                    min={0}
                    max={11}
                    className={inputClass("months")}
                    value={form.months}
                    onChange={(e) => patch({ months: Number(e.target.value) || 0 })}
                  />
                  <p className="text-xs leading-tight text-[var(--sg-muted)]">Additional months (0-11)</p>
                </Field>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={styles.aptFieldLabel}>
                    <Ms name="schedule" className="text-base text-[var(--sg-green-deep)]" />
                    Appointment Slot (Optional)
                    {loadingSlots && <span className="ml-2 text-xs font-medium text-[var(--sg-muted)]">Loading...</span>}
                  </label>
                  {availableSlots.length > 0 && (
                    <>
                      <p className="mb-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        <span>
                          <span className="mr-1 inline-block h-3 w-3 rounded bg-green-500 align-middle" /> Available
                        </span>
                        <span>
                          <span className="mr-1 inline-block h-3 w-3 rounded bg-orange-500 align-middle" /> Being booked
                        </span>
                        <span>
                          <span className="mr-1 inline-block h-3 w-3 rounded bg-red-500 align-middle" /> Booked
                        </span>
                      </p>
                      <div className={styles.aptSlotPanel}>
                        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
                          {flattened.map((item) => (
                            <button
                              key={`${item.timeSlot.parentSlotId}-${item.timeSlot.time}`}
                              type="button"
                              disabled={
                                item.timeSlot.isBooked ||
                                !item.timeSlot.isActive ||
                                !!item.timeSlot.isPeerHeld
                              }
                              onClick={() =>
                                void selectTimeSlot(item.timeSlot, item.parentSlot, item.sequence)
                              }
                              className={`flex w-full flex-col items-center justify-center gap-px rounded-md px-1 py-1 text-xs font-semibold transition-all ${slotBtnClass(item.timeSlot)}`}
                            >
                              <span className="text-sm leading-none font-bold tabular-nums">{item.sequence}</span>
                              <span className="text-xs leading-tight font-medium opacity-95">
                                {formatTime12h(item.timeSlot.time)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {selectedSlot && (
                    <div className={styles.aptSelectedSlot}>
                      <p className="flex flex-wrap items-center gap-2">
                        <Ms name="check_circle" className="text-[var(--sg-green)]" />
                        <span>Selected Time:</span>
                        <span className="font-bold text-[var(--sg-green-deep)]">{formatTime12h(selectedSlot.time)}</span>
                        {selectedSequence != null && (
                          <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-[var(--sg-green-deep)] ring-1 ring-[var(--sg-line)]">
                            Slot #{selectedSequence}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                  {!loadingSlots &&
                    availableSlots.length === 0 &&
                    form.chamberId &&
                    form.appointmentDate && (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <Ms name="warning" className="text-amber-600" />
                        No time slots available for this date. You can still book without selecting a slot.
                      </div>
                    )}
                  {!loadingSlots &&
                    availableSlots.length === 0 &&
                    (!form.chamberId || !form.appointmentDate) && (
                      <p className="text-sm italic text-[var(--sg-muted)]">
                        Select chamber and date to see available time slots
                      </p>
                    )}
                </div>

                <Field label="District" icon="">
                  <select
                    className={inputClass("district")}
                    value={form.district}
                    onChange={(e) => patch({ district: e.target.value })}
                  >
                    <option value="">Select District</option>
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Upazila" icon="">
                  <input
                    type="text"
                    className={inputClass("upazila")}
                    placeholder="Enter upazila"
                    value={form.upazila}
                    onChange={(e) => patch({ upazila: e.target.value })}
                  />
                </Field>
                <Field label="Union" icon="">
                  <input
                    type="text"
                    className={inputClass("union")}
                    placeholder="Enter union"
                    value={form.union}
                    onChange={(e) => patch({ union: e.target.value })}
                  />
                </Field>
                <Field
                  label="Fee (৳)"
                  icon=""
                  error={invalid("fee") ? "Please enter a valid fee" : ""}
                >
                  <input
                    type="number"
                    min={0}
                    className={inputClass("fee")}
                    value={form.fee}
                    onChange={(e) => patch({ fee: Number(e.target.value) || 0 }, ["fee"])}
                  />
                  <p className="text-xs leading-tight text-[var(--sg-muted)]">
                    Prefills from chamber by type — you can edit anytime.
                  </p>
                </Field>
                <Field label="Referer by (Name)" icon="">
                  <input
                    type="text"
                    className={inputClass("refererDoctor")}
                    placeholder="Enter referer name"
                    value={form.refererDoctor}
                    onChange={(e) => patch({ refererDoctor: e.target.value })}
                  />
                </Field>
                <Field label="Referer by (Contact number)" icon="">
                  <input
                    type="tel"
                    className={inputClass("refererPC")}
                    placeholder="Enter contact number"
                    value={form.refererPC}
                    onChange={(e) => patch({ refererPC: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={styles.aptFieldLabel}>Notes</label>
                  <textarea
                    rows={3}
                    className={`${inputClass("notes")} resize-none`}
                    placeholder="Enter any additional notes..."
                    value={form.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        <div className={styles.aptModalFooter}>
          <button type="button" onClick={onClose} className={styles.aptBtnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            form="sakura-apt-form"
            disabled={submitting || loading}
            className={styles.aptBtnPrimary}
          >
            {submitting ? (
              <>
                <Ms name="progress_activity" className="animate-spin text-lg" />
                {isEdit ? "Saving..." : "Booking..."}
              </>
            ) : (
              <>
                <Ms name={isEdit ? "save" : "event_available"} className="text-lg" />
                {isEdit ? "Save changes" : "Book Appointment"}
              </>
            )}
          </button>
        </div>
      </div>

      {resultModal && (
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="alertdialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`relative w-full max-w-md overflow-hidden rounded-2xl border bg-[var(--sg-paper)] shadow-xl ${
              resultModal === "success" ? "border-[var(--sg-line)]" : "border-red-200"
            }`}
          >
            <div
              className={`flex items-start gap-3 px-5 py-4 text-white ${
                resultModal === "success" ? "bg-[var(--sg-green-deep)]" : "bg-red-600"
              }`}
            >
              <Ms
                name={resultModal === "success" ? "check_circle" : "error"}
                className="shrink-0 text-3xl"
              />
              <div className="min-w-0 pt-0.5">
                <h2 className="text-lg leading-tight font-bold">
                  {resultModal === "success"
                    ? isEdit
                      ? "Saved"
                      : "Booking confirmed"
                    : isEdit
                      ? "Could not save"
                      : "Booking failed"}
                </h2>
                <p className="mt-1 text-sm leading-snug opacity-95">{resultMessage}</p>
              </div>
            </div>
            {resultModal === "success" && !isEdit && resultSerial != null && (
              <div className="border-t border-[var(--sg-line)] px-5 py-4 text-center">
                <p className="rounded-xl bg-[var(--sg-mint)] px-4 py-3 font-mono text-lg font-bold text-[var(--sg-green-deep)] ring-1 ring-[var(--sg-line)]">
                  Serial #{resultSerial}
                </p>
                <p className="mt-2 text-xs text-[var(--sg-muted)]">Keep this serial for the waiting room.</p>
              </div>
            )}
            <div className="flex justify-end border-t border-[var(--sg-line)] bg-[var(--sg-mint)] px-5 py-3">
              <button
                type="button"
                onClick={closeResult}
                className={resultModal === "success" ? styles.aptBtnPrimary : styles.aptBtnGhost}
              >
                {resultModal === "success" ? (isEdit ? "Done" : "Close") : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  error,
  spinning,
  children,
}: {
  label: string;
  icon: string;
  required?: boolean;
  error?: string;
  spinning?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <label className={styles.aptFieldLabel}>
        {icon ? <Ms name={icon} className="text-base text-[var(--sg-green-deep)]" /> : null}
        {label}
        {required && <span className="text-red-500">*</span>}
        {spinning && (
          <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--sg-green)] border-t-transparent" />
        )}
      </label>
      {children}
      {error ? <p className="mt-0.5 text-xs leading-tight text-red-600">{error}</p> : null}
    </div>
  );
}
