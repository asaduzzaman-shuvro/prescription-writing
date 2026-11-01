"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { sakuraApi, SakuraApiError } from "@/lib/sakura/client";
import type { SakuraAppointment, SakuraChamber } from "@/lib/sakura/types";
import { formatAppointmentTime, getDisplaySerial, sortQueue } from "@/lib/sakura/utils";

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

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  );
}

function phoneOk(phone: string) {
  return /^01[3-9]\d{8}$/.test(phone);
}

type Props = {
  parent: SakuraAppointment;
  allAppointments: SakuraAppointment[];
  chambers: SakuraChamber[];
  onClose: () => void;
  onSaved: () => void;
};

export function SakuraSubPatientModal({
  parent,
  allAppointments,
  chambers,
  onClose,
  onSaved,
}: Props) {
  const sorted = useMemo(() => sortQueue(allAppointments), [allAppointments]);
  const displaySerial = getDisplaySerial(parent, sorted);
  const rootLabel = displaySerial.split(".")[0] || String(parent.serialNumber);

  const chamber =
    chambers.find((c) => c.id === parent.chamberId) ||
    chambers.find((c) => c.name === parent.chamber?.name);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState<string>("New");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState<string>("");
  const [months, setMonths] = useState<string>("");
  const [fee, setFee] = useState<string>("");
  const [refererDoctor, setRefererDoctor] = useState("");
  const [refererPC, setRefererPC] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const isCustomize = identifier === "Customize";

  useEffect(() => {
    if (isCustomize) {
      setFee((prev) => (prev === "" ? "0" : prev));
      return;
    }
    const next =
      identifier === "New"
        ? chamber?.feeFirstTime ?? parent.chamber?.feeFirstTime
        : chamber?.feeFollowup ?? parent.chamber?.feeFollowup;
    setFee(next != null ? String(next) : "");
  }, [identifier, isCustomize, chamber, parent.chamber]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const name = fullName.trim();
    const ph = phone.trim();
    const ageNum = Number(age);
    if (!name || !phoneOk(ph) || !gender || !Number.isFinite(ageNum) || ageNum < 0) {
      setError("Please fill all required fields marked with *.");
      return;
    }
    if (isCustomize) {
      const feeNum = Number(fee);
      if (!Number.isFinite(feeNum) || feeNum < 0) {
        setError("Please enter a valid fee for Customize type.");
        return;
      }
    }

    const body: Record<string, unknown> = {
      fullName: name,
      phone: ph,
      identifier,
      gender,
      age: ageNum,
    };
    if (months !== "") body.months = Number(months);
    if (fee !== "") body.fee = Number(fee);
    if (refererDoctor.trim()) body.refererDoctor = refererDoctor.trim();
    if (refererPC.trim()) body.refererPC = refererPC.trim();
    if (notes.trim()) body.notes = notes.trim();

    setSubmitting(true);
    setError(null);
    try {
      await sakuraApi.post(`/appointments/${parent.id}/sub`, body);
      onSaved();
    } catch (err) {
      setError(
        err instanceof SakuraApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to add patient",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const fieldErr = ( Cond: boolean) => touched && Cond;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sakura-sub-patient-title"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e8e0d5] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-[#325A46] px-5 py-4 text-white">
          <div className="min-w-0">
            <h2
              id="sakura-sub-patient-title"
              className="flex items-center gap-2 text-lg font-bold leading-tight"
            >
              <Ms name="person_add" className="text-2xl" />
              Add patient under #{displaySerial}
            </h2>
            <p className="mt-1 text-sm opacity-90">
              New serial will be <strong>#{rootLabel}.a / .b / …</strong>
              {" · "}
              same time as parent
              {formatAppointmentTime(parent) ? ` (${formatAppointmentTime(parent)})` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10"
            aria-label="Close"
          >
            <Ms name="close" className="text-2xl" />
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[#6b6560]">
              Patient Name <span className="text-red-500">*</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  fieldErr(!fullName.trim()) ? "border-red-300" : "border-[#e8e0d5]"
                }`}
                placeholder="Enter full name"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Phone number <span className="text-red-500">*</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  fieldErr(!phoneOk(phone.trim())) ? "border-red-300" : "border-[#e8e0d5]"
                }`}
                placeholder="01XXXXXXXXX"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Type <span className="text-red-500">*</span>
              <select
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm"
              >
                {IDENTIFIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Gender <span className="text-red-500">*</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  fieldErr(!gender) ? "border-red-300" : "border-[#e8e0d5]"
                }`}
              >
                <option value="">Select Gender</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Age (Years) <span className="text-red-500">*</span>
              <input
                type="number"
                min={0}
                max={150}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                  fieldErr(age === "" || Number(age) < 0) ? "border-red-300" : "border-[#e8e0d5]"
                }`}
                placeholder="Years"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Months
              <input
                type="number"
                min={0}
                max={11}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm"
                placeholder="0–11"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Fee (৳) {isCustomize && <span className="text-red-500">*</span>}
              <input
                type="number"
                min={0}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                readOnly={!isCustomize}
                className={`mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm ${
                  !isCustomize ? "bg-[#faf7f2]" : ""
                }`}
                placeholder="0"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Referer by (Name)
              <input
                value={refererDoctor}
                onChange={(e) => setRefererDoctor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm"
                placeholder="Referer name"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560]">
              Referer by (Contact number)
              <input
                value={refererPC}
                onChange={(e) => setRefererPC(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm"
                placeholder="Contact number"
              />
            </label>

            <label className="block text-xs font-semibold text-[#6b6560] sm:col-span-2">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-[#e8e0d5] px-3 py-2 text-sm"
                placeholder="Optional notes"
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8e0d5] pt-3">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-[#e8e0d5] px-4 py-2 text-sm font-semibold text-[#2c2825] hover:bg-[#faf7f2] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#325A46] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {submitting ? "Saving…" : "Add patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
