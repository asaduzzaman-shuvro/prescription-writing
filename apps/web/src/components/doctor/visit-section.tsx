"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type VisitPaneId = "vitals" | "clinical" | "medicines";

const STORAGE_PREFIX = "rx.visitSection.";
/** Tailwind `xl` — laptop/desktop: panes fill the screen and scroll inside. Below that (phone and tablet, including landscape) the page scrolls. */
const DESKTOP_MQ = "(min-width: 1280px)";

type OpenMap = Record<VisitPaneId, boolean>;

type PaneCtx = {
  open: OpenMap;
  toggle: (id: VisitPaneId) => void;
  isDesktop: boolean;
};

const VisitPaneContext = createContext<PaneCtx | null>(null);

const DEFAULT_OPEN: OpenMap = {
  vitals: true,
  clinical: true,
  medicines: true,
};

function readOpen(id: VisitPaneId, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readAllOpen(): OpenMap {
  return {
    vitals: readOpen("vitals", DEFAULT_OPEN.vitals),
    clinical: readOpen("clinical", DEFAULT_OPEN.clinical),
    medicines: readOpen("medicines", DEFAULT_OPEN.medicines),
  };
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_MQ).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}

/** Mobile/tablet toggle state for panes. Laptop/desktop always expanded. */
export function VisitPaneProvider({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState<OpenMap>(readAllOpen);

  const toggle = useCallback((id: VisitPaneId) => {
    setOpen((prev) => {
      const next = !prev[id];
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${id}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return { ...prev, [id]: next };
    });
  }, []);

  return (
    <VisitPaneContext.Provider value={{ open, toggle, isDesktop }}>
      {children}
    </VisitPaneContext.Provider>
  );
}

/** Parent block — right-side icon toggles minimise/show on phone/tablet; always open on desktop. */
export function VisitSection({
  id,
  title,
  badge,
  actions,
  children,
  className = "",
  inline = false,
}: {
  id: VisitPaneId;
  title: string;
  badge?: string | number | null;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Desktop: title and fields share one short row. */
  inline?: boolean;
}) {
  const ctx = useContext(VisitPaneContext);
  const isDesktop = ctx?.isDesktop ?? true;
  const isOpen = !ctx || isDesktop || ctx.open[id];
  const toggle = ctx?.toggle;

  if (isDesktop && inline) {
    return (
      <div
        className={`flex shrink-0 flex-wrap items-end gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-white px-2 py-1 ${className}`}
        data-testid={`visit-section-${id}`}
        data-open="1"
      >
        <span className="mb-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        {children}
        {badge != null && badge !== "" && badge !== 0 && (
          <span className="mb-1 ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
            {badge}
          </span>
        )}
        {actions}
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white ${className}`}
        data-testid={`visit-section-${id}`}
        data-open="1"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
            {title}
          </span>
          {badge != null && badge !== "" && badge !== 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
              {badge}
            </span>
          )}
          {actions}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2.5 py-2">
          <div className="space-y-2.5">{children}</div>
        </div>
      </div>
    );
  }

  /* Collapsed: title + toggle icon */
  if (!isOpen) {
    return (
      <button
        type="button"
        className={`flex h-11 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-left text-sm font-semibold text-slate-700 ${className}`}
        data-testid={`visit-section-${id}`}
        data-open="0"
        aria-expanded={false}
        aria-label={`Show ${title}`}
        onClick={() => toggle?.(id)}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500"
          aria-hidden
        >
          ▸
        </span>
      </button>
    );
  }

  /* Phone/tablet: natural height — main page scrolls. */
  return (
    <div
      className={`flex shrink-0 flex-col rounded-md border border-slate-200 bg-white shadow-sm ${className}`}
      data-testid={`visit-section-${id}`}
      data-open="1"
    >
      <div className="flex w-full shrink-0 items-center gap-2 bg-slate-50/80 px-2.5 py-2 text-sm font-semibold text-slate-700">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {badge != null && badge !== "" && badge !== 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
            {badge}
          </span>
        )}
        {actions && <span className="font-normal">{actions}</span>}
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-base text-slate-500 hover:bg-slate-200/80"
          aria-expanded
          aria-label={`Hide ${title}`}
          onClick={() => toggle?.(id)}
        >
          ▾
        </button>
      </div>
      <div className="border-t border-slate-100 px-2.5 py-2">
        <div className="space-y-2.5">{children}</div>
      </div>
    </div>
  );
}
