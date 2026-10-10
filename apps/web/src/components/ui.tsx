import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-1.5">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="card px-2.5 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card px-3 py-5 text-center text-sm text-slate-500">{children}</div>;
}

export function Pager({ page, hasNext, base }: { page: number; hasNext: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-2 flex justify-end gap-1.5">
      {page > 1 && <Link className="btn-secondary" href={`${base}${sep}page=${page - 1}`}>← Prev</Link>}
      {hasNext && <Link className="btn-secondary" href={`${base}${sep}page=${page + 1}`}>Next →</Link>}
    </div>
  );
}
