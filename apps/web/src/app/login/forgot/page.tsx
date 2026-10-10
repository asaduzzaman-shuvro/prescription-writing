"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../reset-actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-brand-700">Forgot password</h1>
          <p className="text-sm text-slate-500">We will send a reset link by SMS if a mobile is on file, otherwise to your email (logged in console in local dev).</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="username" />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand-700 hover:underline">Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}
