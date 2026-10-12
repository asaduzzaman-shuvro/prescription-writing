import { PrescriptionLoading } from "@/components/loading-states";

export default function Loading() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <PrescriptionLoading compact label="Loading prescription" />
    </main>
  );
}
