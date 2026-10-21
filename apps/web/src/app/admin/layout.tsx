import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/session";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100 md:flex-row">
      <aside className="flex max-h-52 shrink-0 flex-col bg-gradient-to-b from-[#0d4a44] via-[#0a3d39] to-[#062a27] text-white shadow-xl shadow-black/15 ring-1 ring-white/5 md:h-dvh md:max-h-none md:w-60">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-md shadow-black/25"
              aria-hidden
            >
              Rx
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold tracking-tight">RxPad</span>
                <span className="shrink-0 rounded-full bg-sakura-500/25 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sakura-100 uppercase ring-1 ring-sakura-400/30">
                  Admin
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-400">Platform console</p>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          <AdminNav />
        </div>
        <div className="border-t border-white/10 p-3">
          <div className="mb-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
            <p className="truncate text-sm font-medium text-white">{session.name}</p>
            <p className="truncate text-xs capitalize text-slate-400">{session.platformRole?.replaceAll("_", " ")}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 md:p-4">{children}</main>
    </div>
  );
}
