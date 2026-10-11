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
          <p className="px-2 pb-0.5 text-[10px] font-semibold tracking-wider text-white/55 uppercase">{group.title}</p>
          <div className="flex flex-col">
            {group.items.map((item) => {
              const on = active(path, item.href, "exact" in item && item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`truncate rounded-md px-2.5 py-1 text-sm leading-5 whitespace-nowrap ${on ? "bg-white font-medium text-[#0a3d39]" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
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
