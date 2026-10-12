/** Shared loading placeholders. Prescription waits use a pad so the screen reads as an Rx. */

function Bone({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function ListPageLoading({ rows = 8, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <Bone className="h-6 w-48" />
        <Bone className="h-3 w-72 max-w-full" />
      </div>
      <Bone className="h-8 w-full max-w-sm" />
      <div className="card overflow-hidden">
        <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <Bone className="h-3 w-24" />
          <Bone className="h-3 w-32" />
          <Bone className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-3 py-2.5 last:border-b-0">
            <Bone className="h-3 w-36" />
            <Bone className="hidden h-3 w-28 sm:block" />
            <Bone className="ml-auto h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormPageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto max-w-xl space-y-3">
      <span className="sr-only">{label}</span>
      <Bone className="h-6 w-40" />
      <div className="card space-y-3 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Bone className="h-3 w-20" />
            <Bone className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="card space-y-2 p-4">
        <Bone className="h-5 w-52" />
        <Bone className="h-3 w-64 max-w-full" />
        <div className="flex gap-2 pt-1">
          <Bone className="h-8 w-28" />
          <Bone className="h-8 w-28" />
        </div>
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-3 py-3 last:border-b-0">
            <Bone className="h-3 w-24" />
            <Bone className="h-3 w-40" />
            <Bone className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoginLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <div role="status" aria-busy="true" aria-live="polite" className="card w-full max-w-sm space-y-4 p-6">
        <span className="sr-only">Loading sign in</span>
        <Bone className="h-6 w-28" />
        <Bone className="h-3 w-44" />
        <div className="space-y-1.5">
          <Bone className="h-3 w-14" />
          <Bone className="h-9 w-full" />
        </div>
        <div className="space-y-1.5">
          <Bone className="h-3 w-16" />
          <Bone className="h-9 w-full" />
        </div>
        <Bone className="h-9 w-full" />
      </div>
    </main>
  );
}

export function AppBootLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50">
      <div role="status" aria-busy="true" aria-live="polite" className="text-center">
        <p className="text-lg font-semibold tracking-tight text-brand-700">RxPad</p>
        <div className="mx-auto mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-brand-600" />
        </div>
        <p className="sr-only">Loading</p>
      </div>
    </main>
  );
}

function PadSection({ title }: { title: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-slate-800 underline">{title}</p>
      <Bone className="mt-1.5 h-2.5 w-full" />
      <Bone className="mt-1.5 h-2.5 w-4/5" />
    </div>
  );
}

/** A blank prescription pad: letterhead, patient line, ℞, medicine rows, signature. */
export function PrescriptionLoading({
  label = "Loading prescription",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const meds = compact ? 3 : 4;
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-3xl">
      <span className="sr-only">{label}</span>
      <div className="rounded-md bg-slate-200 p-2 sm:p-3">
        <article className="bg-white text-slate-900 shadow-sm">
          <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 px-4 py-3 sm:px-5">
            <div className="min-w-0 space-y-1.5">
              <Bone className="h-5 w-40" />
              <Bone className="h-2.5 w-28" />
              <Bone className="h-2.5 w-24" />
            </div>
            <div className="space-y-1.5">
              <Bone className="ml-auto h-2.5 w-28" />
              <Bone className="ml-auto h-2.5 w-20" />
            </div>
          </header>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-slate-900 px-4 py-2 text-[11px] text-slate-600 sm:px-5">
            <span className="inline-flex items-center gap-1.5">Name <Bone className="h-2.5 w-24" /></span>
            <span className="inline-flex items-center gap-1.5">Age <Bone className="h-2.5 w-10" /></span>
            <span className="inline-flex items-center gap-1.5">Sex <Bone className="h-2.5 w-8" /></span>
            <span className="inline-flex items-center gap-1.5">Date <Bone className="h-2.5 w-16" /></span>
          </div>
          <div className={`grid ${compact ? "" : "sm:grid-cols-[38%_1fr]"} min-h-56`}>
            {!compact && (
              <div className="space-y-4 border-b border-slate-900 px-4 py-3 sm:border-r sm:border-b-0 sm:px-5">
                <PadSection title="C/C" />
                <PadSection title="O/E" />
                <PadSection title="Dx" />
              </div>
            )}
            <div className="px-4 py-3 sm:px-5">
              <p className="font-serif text-3xl leading-none font-bold" aria-hidden="true">℞</p>
              <ol className="mt-3 space-y-3">
                {Array.from({ length: meds }, (_, i) => (
                  <li key={i} className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-x-2">
                    <span className="text-xs font-medium text-slate-700">{i + 1}.</span>
                    <span className="space-y-1.5">
                      <Bone className="h-3 w-36" />
                      <Bone className="h-2.5 w-48 max-w-full" />
                    </span>
                    <Bone className="mt-0.5 h-2.5 w-12" />
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <footer className="flex items-end justify-between border-t border-slate-900 px-4 py-3 sm:px-5">
            <Bone className="h-10 w-10" />
            <div className="w-32">
              <Bone className="mb-2 h-7 w-full" />
              <p className="border-t border-slate-900 pt-1 text-center text-[10px] tracking-wide text-slate-500 uppercase">Signature</p>
            </div>
          </footer>
        </article>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">{label}…</p>
    </div>
  );
}

/** Lab report sheet. No ℞, so it is not read as a prescription. */
export function ReportLoading({ label = "Preparing report" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-3xl">
      <span className="sr-only">{label}</span>
      <div className="rounded-md bg-slate-200 p-2 sm:p-3">
        <article className="bg-white shadow-sm">
          <header className="space-y-2 border-b-2 border-slate-900 px-5 py-4 text-center">
            <Bone className="mx-auto h-5 w-48" />
            <Bone className="mx-auto h-3 w-32" />
            <p className="text-xs font-semibold tracking-wide text-slate-700 uppercase">Laboratory report</p>
          </header>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-slate-300 px-5 py-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">Patient <Bone className="h-2.5 w-28" /></span>
            <span className="inline-flex items-center gap-1.5">Lab No <Bone className="h-2.5 w-16" /></span>
            <span className="inline-flex items-center gap-1.5">Date <Bone className="h-2.5 w-16" /></span>
          </div>
          <div className="px-5 py-3">
            <div className="mb-2 grid grid-cols-[1fr_5rem_6rem] gap-3 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
              <span>Test</span>
              <span>Result</span>
              <span>Range</span>
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_6rem] items-center gap-3 border-t border-slate-100 py-2">
                <Bone className="h-3 w-32" />
                <Bone className="h-3 w-10" />
                <Bone className="h-3 w-16" />
              </div>
            ))}
          </div>
        </article>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">{label}…</p>
    </div>
  );
}
