import { createDb } from "../client";
import { searchProducts } from "../catalogue-search";

const db = createDb(process.env.DATABASE_URL ?? "postgres://rx:rx@localhost:5433/rx", { max: 1 });
const queries = ["napa", "paracet", "amox", "seclo", "omepra", "fexo", "cipro", "montel", "azith", "xyz"];
await searchProducts(db, "warm"); // warm-up
for (const q of queries) {
  const times: number[] = [];
  let hits: Awaited<ReturnType<typeof searchProducts>> = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    hits = await searchProducts(db, q);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${q.padEnd(8)} median ${times[2]!.toFixed(1)}ms  hits ${hits.length}  top: ${hits
      .slice(0, 3)
      .map((h) => `${h.brandName} ${h.strengthText ?? ""} (${h.genericText})${h.isAntibiotic ? " [abx]" : ""}`)
      .join(" | ")}`,
  );
}
await db.$client.end();
