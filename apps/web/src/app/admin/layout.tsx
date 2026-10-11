import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/session";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 md:flex-row">
      <aside className="flex max-h-52 shrink-0 flex-col bg-[#0a3d39] text-white md:h-dvh md:max-h-none md:w-56">
        <div className="border-b border-white/10 px-3 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold tracking-tight">RxPad</span>
            <span className="rounded bg-sakura-500/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">Admin</span>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-white">{session.name}</p>
          <p className="truncate text-xs capitalize text-slate-300">{session.platformRole?.replaceAll("_", " ")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          <AdminNav />
        </div>
        <form action={logout} className="border-t border-white/10 p-2">
          <button className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10 hover:text-white">Sign out</button>
        </form>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 md:p-4">{children}</main>
    </div>
  );
}
