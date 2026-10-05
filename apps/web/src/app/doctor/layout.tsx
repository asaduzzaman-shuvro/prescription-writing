import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { ownerDb } from "@/lib/db";
import { requireClinic } from "@/lib/session";
import { DoctorRoot } from "./root";

export const metadata = { title: "Chamber" };

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClinic();
  const [t] = await ownerDb.select({ status: s.tenant.status, plan: s.tenant.plan, planExpiresAt: s.tenant.planExpiresAt }).from(s.tenant).where(eq(s.tenant.id, session.tenantId));
  if (t?.status === "suspended") {
    return <main className="p-8 text-center text-slate-600">This chamber is suspended. Please contact RxPad support.</main>;
  }
  return (
    <DoctorRoot
      session={{
        userId: session.userId,
        name: session.name,
        tenantId: session.tenantId,
        tenantRole: session.tenantRole!,
        publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
        planExpiresAt: t?.planExpiresAt ?? null,
      }}
    >
      {children}
    </DoctorRoot>
  );
}
