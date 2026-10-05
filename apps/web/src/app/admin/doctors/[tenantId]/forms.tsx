"use client";

import { useActionState } from "react";
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

function F({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div><label className="label">{label}</label><input className="input" {...rest} /></div>;
}

export function ProfileForm({ p, specialties }: { p: ProfileValue; specialties: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveDoctorProfile, undefined);
  return (
    <form action={action} className="card grid gap-3 p-4 md:grid-cols-3">
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
        <select name="specialtyCode" defaultValue={p.specialtyCode} className="input">{specialties.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
      </div>
      <F label="Specialty line (printed, বাংলা)" name="specialtyLabel" defaultValue={p.specialtyLabel} />
      <div className="flex items-end gap-3 md:col-span-3">
        <button className="btn-primary" disabled={pending}>Save profile</button>
        {state && "ok" in state && <span className="text-sm text-green-700">Saved.{state.reverify && " BMDC/degrees changed — verification reset."}</span>}
        {state && "error" in state && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}

export function AddMemberForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(addMember, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <F label="Name" name="name" required />
      <F label="Email" name="email" type="email" required />
      <F label="Password (8+)" name="password" type="password" required />
      <div><label className="label">Role</label><select name="role" className="input"><option value="assistant">Assistant</option><option value="doctor">Doctor</option><option value="clinic_admin">Clinic admin</option></select></div>
      <button className="btn-secondary" disabled={pending}>Add member</button>
      {state && "error" in state && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input name="password" type="password" placeholder="New password" className="input w-36" />
      <button className="btn-ghost text-xs" disabled={pending}>Reset</button>
      {state && "ok" in state && <span className="text-xs text-green-700">Done</span>}
      {state && "error" in state && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
