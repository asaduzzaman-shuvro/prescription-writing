"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined as LoginState | undefined);

  if (state && "step" in state && state.step === "mfa") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-brand-700">Authenticator code</h1>
            <p className="text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
          </div>
          <input type="hidden" name="step" value="mfa" />
          <input type="hidden" name="ticket" value={state.ticket} />
          <div>
            <label className="label" htmlFor="code">Code</label>
            <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" maxLength={6} />
          </div>
          {"error" in state && state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
        </form>
      </main>
    );
  }

  if (state && "step" in state && state.step === "chamber") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-brand-700">Choose chamber</h1>
            <p className="text-sm text-slate-500">You belong to more than one clinic.</p>
          </div>
          <input type="hidden" name="step" value="chamber" />
          <input type="hidden" name="ticket" value={state.ticket} />
          <div className="space-y-2">
            {state.chambers.map((c) => (
              <label key={c.tenantId} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50">
                <input type="radio" name="tenantId" value={c.tenantId} required className="mt-1" />
                <span>
                  <b>{c.name}</b>
                  <span className="block text-xs text-slate-500">{c.role}</span>
                </span>
              </label>
            ))}
          </div>
          {"error" in state && state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Opening…" : "Continue"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-brand-700">RxPad BD</h1>
          <p className="text-sm text-slate-500">প্রেসক্রিপশন সফটওয়্যার — Sign in</p>
        </div>
        <input type="hidden" name="step" value="password" />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="username" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        {state && "error" in state && state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm">
          <Link href="/login/forgot" className="text-slate-500 hover:text-brand-700 hover:underline">Forgot password?</Link>
        </p>
      </form>
    </main>
  );
}
