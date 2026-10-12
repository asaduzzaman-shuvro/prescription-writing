"use client";

/** Previous / next for a client-side list. Hidden when everything fits on the first page. */
export function ListPager({
  page,
  total,
  size,
  onPage,
}: {
  page: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}) {
  if (total <= size && page === 0) return null;
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, page * size + size);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-2.5 py-1.5">
      <p className="mr-auto text-xs text-slate-500 tabular-nums">
        {from}–{to} of {total}
      </p>
      <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button type="button" className="btn-secondary h-7 px-2 text-xs" disabled={to >= total} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
