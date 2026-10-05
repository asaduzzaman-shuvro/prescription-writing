import { MEDICINE_FIELDS } from "@rx/db/import";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s?.platformRole) return new Response("Forbidden", { status: 403 });
  const header = MEDICINE_FIELDS.map((f) => f.key).join(",");
  const example = `Napa,Paracetamol,Tablet,Beximco Pharmaceuticals Ltd.,500 mg,,allopathic,"10's pack: 12.00",yes,`;
  return new Response(`${header}\n${example}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="medicine-import-template.csv"' },
  });
}
