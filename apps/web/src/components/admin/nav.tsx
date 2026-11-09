"use client";

import {
  AlertTriangle,
  BookOpen,
  Building2,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Pill,
  PillBottle,
  ScrollText,
  Stethoscope,
  Tags,
  Upload,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; exact?: boolean; /** Highlight for whole section (e.g. all library kinds). */ activePrefix?: string; icon: ReactNode };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", exact: true, icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/medicines", label: "Medicines", icon: <Pill className="h-4 w-4" /> },
      { href: "/admin/medicine-requests", label: "Doctor-added", icon: <PillBottle className="h-4 w-4" /> },
      { href: "/admin/complaint-requests", label: "Doctor C/C", icon: <ListChecks className="h-4 w-4" /> },
      { href: "/admin/generics", label: "Generics", icon: <Tags className="h-4 w-4" /> },
      { href: "/admin/companies", label: "Companies", icon: <Building2 className="h-4 w-4" /> },
      { href: "/admin/import", label: "Import CSV", icon: <Upload className="h-4 w-4" /> },
      { href: "/admin/interactions", label: "Interactions", icon: <AlertTriangle className="h-4 w-4" /> },
    ],
  },
  {
    title: "Clinical",
    items: [
      { href: "/admin/libraries/complaints", label: "Libraries", activePrefix: "/admin/libraries", icon: <BookOpen className="h-4 w-4" /> },
      { href: "/admin/templates", label: "Rx templates", icon: <FileText className="h-4 w-4" /> },
      { href: "/admin/specialty-templates", label: "Exam templates", icon: <Stethoscope className="h-4 w-4" /> },
      { href: "/admin/lab-catalogue", label: "Lab catalogue", icon: <FlaskConical className="h-4 w-4" /> },
    ],
  },
  {
    title: "Chambers",
    items: [
      { href: "/admin/doctors", label: "Doctors", icon: <UserCog className="h-4 w-4" /> },
      { href: "/admin/audit", label: "Audit log", icon: <ScrollText className="h-4 w-4" /> },
    ],
  },
];

function norm(path: string) {
  const p = path.split("?")[0]!.replace(/\/$/, "");
  return p || "/";
}

/** Dashboard uses exact match only; other items match their href or `activePrefix` subtree. */
function isActive(path: string, item: NavItem) {
  const p = norm(path);
  if (item.exact) return p === norm(item.href);
  const base = norm(item.activePrefix ?? item.href);
  return p === base || p.startsWith(`${base}/`);
}

function navLinkClass(on: boolean) {
  return `group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
    on ? "bg-white/12 text-white shadow-sm ring-1 ring-white/10" : "text-slate-300/90 hover:bg-white/8 hover:text-white"
  }`;
}

function navIconClass(on: boolean) {
  return `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
    on ? "bg-brand-500/35 text-white" : "bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white"
  }`;
}

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-0.5">
          <p className="px-2 pt-2 pb-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase first:pt-1">{group.title}</p>
          {group.items.map((item) => {
            const on = isActive(path, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={navLinkClass(on)}
              >
                <span className={navIconClass(on)} aria-hidden>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
