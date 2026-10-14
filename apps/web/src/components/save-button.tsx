"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

function SavingLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden />
      {label}
    </span>
  );
}

/** A save button that shows a spinner and ignores another click while `saving` is true. */
export function SaveButton({
  saving = false,
  children,
  pendingLabel = "Saving…",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { saving?: boolean; pendingLabel?: string }) {
  return (
    <button {...props} disabled={saving || props.disabled} aria-busy={saving}>
      {saving ? <SavingLabel label={pendingLabel} /> : children}
    </button>
  );
}

/** Same spinner, driven by the surrounding form action (`useFormStatus`). Must be rendered inside a `<form>`. */
export function FormSaveButton({
  children,
  pendingLabel = "Saving…",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <SaveButton saving={pending} pendingLabel={pendingLabel} {...props}>
      {children}
    </SaveButton>
  );
}

/** A form that empties its fields after the action finishes. Use for new entries that stay on the page. */
export function ClearingForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className={className}
      action={async (formData) => {
        await action(formData);
        ref.current?.reset();
      }}
    >
      {children}
    </form>
  );
}
