"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/medicines", label: "Medicines" },
  { href: "/admin/generics", label: "Generics" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/import", label: "Import CSV" },
  { href: "/admin/libraries/complaints", label: "Libraries" },
  { href: "/admin/templates", label: "Shared Rx templates" },
  { href: "/admin/specialty-templates", label: "Exam templates" },
  { href: "/admin/interactions", label: "Interactions" },
  { href: "/admin/doctors", label: "Doctors & chambers" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.exact ? path === n.href : path.startsWith(n.href.split("/").slice(0, 3).join("/"));
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
