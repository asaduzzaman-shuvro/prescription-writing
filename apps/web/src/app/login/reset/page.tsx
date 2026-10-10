"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { completePasswordReset } from "../reset-actions";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, action, pending] = useActionState(completePasswordReset, undefined);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-3 p-6 text-sm shadow-sm">
          <p className="text-red-600">Missing reset token. Request a new link.</p>
          <Link href="/login/forgot" className="text-brand-700 hover:underline">Forgot password</Link>
        </div>
      </main>
    );
  }

  if (state?.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-3 p-6 shadow-sm">
          <p className="text-sm text-green-700">{state.ok}</p>
          <Link href="/login" className="btn-primary inline-flex justify-center">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-brand-700">Set new password</h1>
          <p className="text-sm text-slate-500">Choose a password with at least 8 characters.</p>
        </div>
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input className="input" id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="p-8 text-center text-sm text-slate-500">Loading…</main>}>
      <ResetForm />
    </Suspense>
  );
}
