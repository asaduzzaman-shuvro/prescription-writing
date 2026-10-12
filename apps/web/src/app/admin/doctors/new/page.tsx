import { s } from "@rx/db";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { OnboardForm } from "./onboard-form";
import { connection } from "next/server";

export const metadata = { title: "Onboard doctor" };

export default async function NewDoctorPage() {
  await connection();
  await requireAdmin({ superOnly: true });
  const specialties = await ownerDb.select().from(s.specialty);
  return (
    <>
      <PageHeader title="Onboard doctor" subtitle="Creates the chamber (tenant), the doctor's login, profile and first chamber" />
      <OnboardForm specialties={specialties.map((x) => ({ code: x.code, name: x.name }))} />
    </>
  );
}
