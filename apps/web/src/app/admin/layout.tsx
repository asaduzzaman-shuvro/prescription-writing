import { AdminNav } from "@/components/admin/nav";
import { requireAdmin } from "@/lib/session";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-3 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-3 px-3">
          <div className="font-semibold text-brand-700">RxPad Admin</div>
          <div className="text-xs text-slate-500">{session.name} · {session.platformRole?.replace("_", " ")}</div>
        </div>
        <AdminNav />
        <form action={logout} className="mt-4 px-3">
          <button className="text-xs text-slate-500 hover:text-slate-800">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
