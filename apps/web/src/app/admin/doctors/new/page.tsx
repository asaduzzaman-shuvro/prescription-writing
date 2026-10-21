import { s } from "@rx/db";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { OnboardForm } from "./onboard-form";

export const metadata = { title: "Onboard doctor" };

export default async function NewDoctorPage() {
  await connection();
  await requireAdmin({ superOnly: true });
  const specialties = await ownerDb.select().from(s.specialty);
  return (
    <>
      <Link href="/admin/doctors" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Doctors & chambers
      </Link>
      <PageHeader title="Onboard doctor" subtitle="Creates the chamber (tenant), the doctor's login, profile and first chamber" />
      <OnboardForm specialties={specialties.map((x) => ({ code: x.code, name: x.name }))} />
    </>
  );
}
