"use client";

import { useActionState } from "react";
import { SaveButton } from "@/components/save-button";
import { addMember, resetPassword, saveDoctorProfile } from "../actions";

export interface ProfileValue {
  userId: string;
  nameEn: string;
  nameBn: string;
  degreesEn: string;
  degreesBn: string;
  designation: string;
  institution: string;
  specialtyCode: string;
  specialtyLabel: string;
  bmdcNumber: string;
  bmdcExpiry: string;
}

function F({ label, className, ...rest }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input className="input" {...rest} />
    </div>
  );
}

export function ProfileForm({ p, specialties }: { p: ProfileValue; specialties: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveDoctorProfile, undefined);
  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <input type="hidden" name="userId" value={p.userId} />
      <F label="Name (English)" name="nameEn" defaultValue={p.nameEn} />
      <F label="নাম (বাংলা)" name="nameBn" defaultValue={p.nameBn} />
      <F label="BMDC reg. no." name="bmdcNumber" defaultValue={p.bmdcNumber} />
      <F label="Degrees (comma)" name="degreesEn" defaultValue={p.degreesEn} />
      <F label="ডিগ্রি (কমা)" name="degreesBn" defaultValue={p.degreesBn} />
      <F label="BMDC valid until" name="bmdcExpiry" type="date" defaultValue={p.bmdcExpiry} />
      <F label="Designation" name="designation" defaultValue={p.designation} />
      <F label="Institution" name="institution" defaultValue={p.institution} />
      <div>
        <label className="label">Specialty</label>
        <select name="specialtyCode" defaultValue={p.specialtyCode} className="input">
          {specialties.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </div>
      <F label="Specialty line (printed, বাংলা)" name="specialtyLabel" defaultValue={p.specialtyLabel} className="sm:col-span-2 lg:col-span-2 xl:col-span-2" />
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 sm:col-span-2 lg:col-span-3 xl:col-span-4">
        <SaveButton className="btn-primary" saving={pending}>Save profile</SaveButton>
        {state && "ok" in state && (
          <span className="text-sm text-emerald-700">
            Saved.{state.reverify && " BMDC/degrees changed — verification reset."}
          </span>
        )}
        {state && "error" in state && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

export function AddMemberForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(addMember, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <input type="hidden" name="tenantId" value={tenantId} />
      <F label="Name" name="name" required />
      <F label="Email" name="email" type="email" required />
      <F label="Password (8+)" name="password" type="password" required />
      <div>
        <label className="label">Role</label>
        <select name="role" className="input">
          <option value="assistant">Assistant</option>
          <option value="doctor">Doctor</option>
          <option value="clinic_admin">Clinic admin</option>
        </select>
      </div>
      <button className="btn-secondary sm:col-span-2 lg:col-span-1" disabled={pending}>Add member</button>
      {state && "error" in state && <span className="text-sm text-red-600 sm:col-span-2 lg:col-span-5">{state.error}</span>}
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="flex min-w-[12rem] max-w-md items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input name="password" type="password" placeholder="New password" className="input min-w-0 flex-1 py-1 text-xs" />
      <button className="btn-ghost shrink-0 text-xs" disabled={pending}>Reset</button>
      {state && "ok" in state && <span className="text-xs text-emerald-700">OK</span>}
      {state && "error" in state && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
