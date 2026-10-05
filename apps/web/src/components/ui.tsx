import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Pager({ page, hasNext, base }: { page: number; hasNext: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-3 flex justify-end gap-2">
      {page > 1 && <Link className="btn-secondary" href={`${base}${sep}page=${page - 1}`}>← Prev</Link>}
      {hasNext && <Link className="btn-secondary" href={`${base}${sep}page=${page + 1}`}>Next →</Link>}
    </div>
  );
}
