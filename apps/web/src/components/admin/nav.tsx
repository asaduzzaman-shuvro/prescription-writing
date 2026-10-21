"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", exact: true }],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/medicines", label: "Medicines" },
      { href: "/admin/generics", label: "Generics" },
      { href: "/admin/companies", label: "Companies" },
      { href: "/admin/import", label: "Import CSV" },
      { href: "/admin/interactions", label: "Interactions" },
    ],
  },
  {
    title: "Clinical",
    items: [
      { href: "/admin/libraries/complaints", label: "Libraries" },
      { href: "/admin/templates", label: "Rx templates" },
      { href: "/admin/specialty-templates", label: "Exam templates" },
      { href: "/admin/lab-catalogue", label: "Lab catalogue" },
    ],
  },
  {
    title: "Chambers",
    items: [
      { href: "/admin/doctors", label: "Doctors" },
      { href: "/admin/audit", label: "Audit log" },
    ],
  },
];

function active(path: string, href: string, exact?: boolean) {
  if (exact) return path === href;
  const root = href.split("/").slice(0, 3).join("/");
  return path === href || path.startsWith(`${root}/`) || path === root;
}

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-2" aria-label="Admin">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pt-3 pb-1.5 text-[11px] font-medium tracking-wide text-slate-500 uppercase first:pt-1">{group.title}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const on = active(path, item.href, "exact" in item && item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`truncate rounded-xl px-3 py-2 text-[13px] font-medium leading-5 whitespace-nowrap transition-all duration-200 ${
                    on
                      ? "bg-white/12 text-white shadow-sm ring-1 ring-white/10"
                      : "text-slate-300/90 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
