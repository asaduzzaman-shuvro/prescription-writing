import { requireClinic } from "@/lib/session";
import { tenantBrief } from "@/lib/tenant-access";
import { DoctorRoot } from "./root";
import { connection } from "next/server";

export const metadata = { title: "Chamber" };

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await requireClinic();
  const t = await tenantBrief(session.tenantId);
  if (t?.status === "suspended") {
    return <main className="p-8 text-center text-slate-600">This chamber is suspended. Please contact RxPad support.</main>;
  }
  return (
    <DoctorRoot
      session={{
        userId: session.userId,
        name: session.name,
        tenantId: session.tenantId,
        tenantName: t?.name ?? "Chamber",
        tenantRole: session.tenantRole!,
        publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
        planExpiresAt: t?.planExpiresAt ?? null,
      }}
    >
      {children}
    </DoctorRoot>
  );
}
