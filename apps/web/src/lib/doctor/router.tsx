"use client";

import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

/**
 * Minimal hash router for the doctor app. Everything lives on the single /doctor page so the
 * service worker can serve it offline; navigation never asks the server for anything.
 *   #/                 today
 *   #/patients         patient list
 *   #/patients/new
 *   #/patients/<id>
 *   #/visit/<encounterId>
 *   #/visit/<encounterId>/reports
 *   #/medicines
 *   #/rx/<id>/print
 *   #/templates  #/settings
 */
export function useHashRoute(): string[] {
  const read = () => (typeof window === "undefined" ? [] : window.location.hash.replace(/^#\/?/, "").split("?")[0]!.split("/").filter(Boolean));
  const [parts, setParts] = useState<string[]>([]);
  useEffect(() => {
    const on = () => setParts(read());
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function navigate(path: string) {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
}

export function useNavigate() {
  return useCallback((path: string) => navigate(path), []);
}

export function Link({
  to,
  className,
  children,
  ...rest
}: { to: string; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a href={`#${to.startsWith("/") ? to : `/${to}`}`} className={className} {...rest}>
      {children}
    </a>
  );
}
