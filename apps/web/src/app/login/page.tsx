"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { login, type LoginState } from "./actions";

function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#0a3d39] lg:block">
        <img
          src="/login-prescription.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#062825]/90 via-[#0a3d39]/25 to-[#0a3d39]/10" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">RxPad</span>
            <span className="rounded bg-sakura-500/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">Clinic</span>
          </div>
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight">Prescriptions for the chamber, ready at the desk.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              Visits, medicines, and print stay on this device. Sign in to open your chamber.
            </p>
          </div>
        </div>
      </aside>
      <section className="flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined as LoginState | undefined);

  if (state && "step" in state && state.step === "mfa") {
    return (
      <LoginFrame>
        <form action={action} className="card space-y-4 p-6 shadow-sm">
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
      </LoginFrame>
    );
  }

  if (state && "step" in state && state.step === "chamber") {
    return (
      <LoginFrame>
        <form action={action} className="card space-y-4 p-6 shadow-sm">
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
      </LoginFrame>
    );
  }

  return (
    <LoginFrame>
      <form action={action} className="card space-y-4 p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase lg:hidden">RxPad BD</p>
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">প্রেসক্রিপশন সফটওয়্যার — open your chamber</p>
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
        <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm">
          <Link href="/login/forgot" className="text-slate-500 hover:text-brand-700 hover:underline">Forgot password?</Link>
        </p>
      </form>
    </LoginFrame>
  );
}
