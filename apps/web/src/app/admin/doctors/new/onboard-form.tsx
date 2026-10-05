"use client";

import { useActionState } from "react";
import { onboardDoctor } from "../actions";

function F({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} className="input" {...rest} /></div>
  );
}

export function OnboardForm({ specialties }: { specialties: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(onboardDoctor, undefined);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="card grid gap-3 p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Account</legend>
        <F name="tenantName" label="Chamber / practice name *" required />
        <div><label className="label">Type</label><select name="kind" className="input"><option value="solo">Solo doctor</option><option value="clinic">Clinic (several doctors)</option></select></div>
        <F name="name" label="Login display name *" required />
        <F name="email" label="Email *" type="email" required />
        <F name="phone" label="Mobile" />
        <F name="password" label="Initial password * (8+)" type="password" required minLength={8} />
      </fieldset>
      <fieldset className="card grid gap-3 p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Doctor profile (printed on header)</legend>
        <F name="nameEn" label="Name (English) *" required placeholder="Dr. ..." />
        <F name="nameBn" label="নাম (বাংলা)" placeholder="ডাঃ ..." />
        <F name="bmdcNumber" label="BMDC reg. no. *" required placeholder="A-12345" />
        <F name="degreesEn" label="Degrees (comma separated)" placeholder="MBBS, FCPS (Medicine)" />
        <F name="degreesBn" label="ডিগ্রি (কমা দিয়ে)" placeholder="এমবিবিএস, এফসিপিএস" />
        <F name="bmdcExpiry" label="BMDC valid until" type="date" />
        <F name="designation" label="Designation" />
        <F name="institution" label="Institution" />
        <div><label className="label">Specialty</label><select name="specialtyCode" className="input">{specialties.map((sp) => <option key={sp.code} value={sp.code}>{sp.name}</option>)}</select></div>
      </fieldset>
      <fieldset className="card grid gap-3 p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">First chamber</legend>
        <F name="chamberName" label="Chamber name *" required />
        <F name="chamberAddress" label="Address *" required />
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create chamber & doctor"}</button>
    </form>
  );
}
