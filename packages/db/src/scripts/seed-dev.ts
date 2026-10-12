/**
 * DEV ONLY seed: Kaggle "Assorted Medicine Dataset of Bangladesh" (scraped from MedEx — must never
 * reach production), curated clinical libraries, and demo users/tenant.
 *
 *   pnpm db:seed:dev            (expects data/dev-seed/*.csv; run scripts/fetch-dev-seed.sh first)
 *   SEED_DIR=resources/archive pnpm db:seed:dev   (CSVs elsewhere; relative to the repo root. Keep it gitignored.)
 */
import { parseShortcut, type RxItem } from "@rx/core";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../client";
import { connectionHost, ownerConnection } from "../connection";
import { DEV_DATABASE_URL } from "../dev-urls";
import { applyPlan, buildPlan, guessMapping, loadSnapshot, parseCsv, parseMedexGenerics, rowsToProducts } from "../import";
import { hashPassword } from "../password";
import * as s from "../schema";
import { seedExamTemplates, seedLibraries } from "../seed/curated";
import { seedLabCatalogue } from "../seed/lab-catalogue";

const connection = ownerConnection(DEV_DATABASE_URL);
const host = connectionHost(connection);
// if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
//   console.error(`Refusing to load the MedEx-derived dev seed into non-local database host "${host}".`);
//   process.exit(1);
// }

const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(host);

if (process.env.NODE_ENV !== "production" && !isLocalHost) {
  console.error(
    `Refusing to load the MedEx-derived dev seed into non-local database host "${host}".`
  );
  process.exit(1);
}


const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(join(here, "../../../.."), process.env.SEED_DIR ?? "data/dev-seed");
const SOURCE = "medex-kaggle-2022";
const db = createDb(connection, { max: 4 });

const ANTIBIOTIC_CLASS =
  /antibiotic|cephalosporin|penicillin|macrolide|quinolone|tetracycline|carbapenem|aminoglycoside|sulfonamide|lincosamide|glycopeptide|nitroimidazole|monobactam|oxazolidinone/i;

async function seedMedicines() {
  const t0 = Date.now();
  const { headers, rows } = parseCsv(readFileSync(join(seedDir, "medicine.csv"), "utf8"));
  const mapping = guessMapping(headers);
  const { products, errors } = rowsToProducts(rows, mapping);
  const plan = buildPlan(products, errors, await loadSnapshot(db));
  console.log("medicines plan:", plan.summary, `new companies ${plan.newCompanies.length}, forms ${plan.newForms.length}, generics ${plan.newGenerics.length}`);
  if (plan.summary.new || plan.summary.changed) {
    const res = await applyPlan(db, plan, { source: SOURCE, filename: "medicine.csv", priceDate: "2022-07-24" });
    console.log("medicines applied:", res, `${Date.now() - t0} ms`);
  }

  // Generic metadata: drug class + monograph for single-ingredient generics.
  const metas = parseMedexGenerics(readFileSync(join(seedDir, "generic.csv"), "utf8"));
  const generics = new Map((await db.select({ id: s.generic.id, name: s.generic.name }).from(s.generic)).map((g) => [g.name.toLowerCase(), g.id]));
  const classIds = new Map<string, string>();
  const classNames = [...new Set(metas.map((m) => m.drugClass).filter((c): c is string => !!c))];
  if (classNames.length) await db.insert(s.drugClass).values(classNames.map((name) => ({ name, source: SOURCE }))).onConflictDoNothing();
  for (const c of await db.select({ id: s.drugClass.id, name: s.drugClass.name }).from(s.drugClass)) classIds.set(c.name, c.id);

  const links: { genericId: string; drugClassId: string }[] = [];
  const monographs: (typeof s.genericMonograph.$inferInsert)[] = [];
  const antibiotics: string[] = [];
  for (const m of metas) {
    const gid = generics.get(m.name.toLowerCase());
    if (!gid) continue; // combination entries ("A + B") are split into their ingredients
    if (m.drugClass && classIds.has(m.drugClass)) links.push({ genericId: gid, drugClassId: classIds.get(m.drugClass)! });
    if (m.drugClass && ANTIBIOTIC_CLASS.test(m.drugClass)) antibiotics.push(gid);
    if (Object.keys(m.monograph).length) monographs.push({ genericId: gid, ...m.monograph, format: "html", source: SOURCE });
  }
  for (let i = 0; i < links.length; i += 1000) await db.insert(s.genericDrugClass).values(links.slice(i, i + 1000)).onConflictDoNothing();
  for (let i = 0; i < monographs.length; i += 200) await db.insert(s.genericMonograph).values(monographs.slice(i, i + 200)).onConflictDoNothing();
  for (let i = 0; i < antibiotics.length; i += 1000)
    await db.update(s.generic).set({ isAntibiotic: true }).where(inArray(s.generic.id, antibiotics.slice(i, i + 1000)));
  console.log(`generic metadata: ${links.length} class links, ${monographs.length} monographs, ${antibiotics.length} antibiotics`);
}

async function upsertUser(email: string, name: string, password: string, platformRole: "super_admin" | "data_editor" | null) {
  const found = await db.select({ id: s.appUser.id }).from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, email));
  if (found[0]) return found[0].id;
  const [u] = await db
    .insert(s.appUser)
    .values({ email, name, passwordHash: await hashPassword(password), platformRole })
    .returning({ id: s.appUser.id });
  return u!.id;
}

async function seedDemoTenant() {
  await upsertUser("admin@rx.local", "Platform Admin", "admin123", "super_admin");
  await upsertUser("editor@rx.local", "Data Editor", "editor123", "data_editor");
  const doctorId = await upsertUser("doctor@rx.local", "Dr. Farhana Rahman", "doctor123", null);
  const assistantId = await upsertUser("assistant@rx.local", "Rahim (Assistant)", "assist123", null);

  const existing = await db.select({ tenantId: s.membership.tenantId }).from(s.membership).where(eq(s.membership.userId, doctorId));
  if (existing[0]) return console.log("demo tenant: already seeded");
  const [t] = await db.insert(s.tenant).values({ name: "Dr. Farhana's Chamber", kind: "solo", status: "active" }).returning({ id: s.tenant.id });
  const tenantId = t!.id;
  await db.insert(s.membership).values([
    { tenantId, userId: doctorId, role: "doctor" },
    { tenantId, userId: assistantId, role: "assistant" },
  ]);
  await db.insert(s.doctorProfile).values({
    userId: doctorId,
    tenantId,
    nameEn: "Dr. Farhana Rahman",
    nameBn: "ডাঃ ফারহানা রহমান",
    degreesEn: ["MBBS", "FCPS (ENT)"],
    degreesBn: ["এমবিবিএস", "এফসিপিএস (নাক, কান ও গলা)"],
    designation: "Consultant, ENT & Head-Neck Surgery",
    institution: "Dhaka Medical College Hospital",
    specialtyCode: "ent",
    specialtyLabel: "নাক, কান ও গলা রোগ বিশেষজ্ঞ",
    bmdcNumber: "A-12345",
    bmdcExpiry: "2028-12-31",
  });
  await db.insert(s.chamber).values({
    tenantId,
    doctorUserId: doctorId,
    name: "Popular Diagnostic Centre, Dhanmondi",
    address: "House 16, Road 2, Dhanmondi, Dhaka-1205",
    phone: "Serial: 01700-000000",
    hours: "Sat–Thu, 5pm–9pm",
    printSettings: {},
  });
  console.log("demo tenant: seeded (doctor@rx.local / doctor123, assistant@rx.local / assist123, admin@rx.local / admin123)");
}

async function seedEnt() {
  // Shared ENT Rx templates built from products in the (dev) catalogue.
  const shared = await db.select({ id: s.rxTemplate.id }).from(s.rxTemplate).where(isNull(s.rxTemplate.tenantId));
  if (shared.length) return;
  const pick = async (brand: string, form: string) => {
    const rows = (await db.execute(sql`
      select p.id, p.brand_name, p.strength_text, p.generic_text, f.name form_name, f.short_label, f.default_route, f.default_unit,
             exists (select 1 from product_ingredient pi join generic g on g.id = pi.generic_id where pi.product_id = p.id and g.is_antibiotic) abx
        from brand_product p join dosage_form f on f.id = p.form_id
       where lower(p.brand_name) = lower(${brand}) and f.name ilike ${form} and p.is_active
       order by p.strength_text limit 1`)) as unknown as Record<string, any>[];
    return rows[0];
  };
  const item = async (brand: string, form: string, shortcut: string, extra: Partial<RxItem> = {}): Promise<RxItem | null> => {
    const p = await pick(brand, form);
    if (!p) return null;
    const sc = parseShortcut(shortcut);
    return {
      id: randomUUID(), productId: p.id, form: p.short_label, brandName: p.brand_name, genericName: p.generic_text, strength: p.strength_text ?? undefined,
      route: p.default_route, doseUnit: p.default_unit, isAntibiotic: !!p.abx,
      frequency: sc.frequency ?? { kind: "pattern", slots: [1, 0, 1] }, timing: sc.timing ?? "none", duration: sc.duration ?? { kind: "none" },
      ...(sc.doseQty !== undefined && { doseQty: sc.doseQty }), ...(sc.doseUnit && { doseUnit: sc.doseUnit }), ...extra,
    };
  };
  const T = async (name: string, dx: string[], items: (RxItem | null)[], advice: string[], ix: string[] = []) =>
    db.insert(s.rxTemplate).values({ id: randomUUID(), tenantId: null, specialtyCode: "ent", name, payload: { diagnoses: dx, investigations: ix, advice, items: items.filter(Boolean) } });
  await T("Acute tonsillitis — adult", ["Acute tonsillitis"], [
    await item("Moxacil", "Capsule", "1+1+1 af 7d"), await item("Napa", "Tablet", "1+1+1 af 3d"), await item("Fexo", "Tablet", "0+0+1 hs 7d"),
  ], ["কুসুম গরম লবণ পানি দিয়ে দিনে ৩–৪ বার গড়গড়া করবেন", "ঠান্ডা পানি, আইসক্রিম ও ফ্রিজের খাবার পরিহার করুন"]);
  await T("Allergic rhinitis", ["Allergic rhinitis"], [
    await item("Fexo", "Tablet", "0+0+1 hs 1m"), await item("Monas", "Tablet", "0+0+1 hs 1m"), await item("Nasomet", "Nasal Spray", "2 spray od 1m", { side: "both" }),
  ], ["ধুলাবালি ও ঠান্ডা পরিহার করুন, প্রয়োজনে মাস্ক ব্যবহার করুন", "নাকের স্প্রে ব্যবহারের আগে বোতল ঝাঁকিয়ে নিবেন"], ["Absolute eosinophil count", "Serum IgE"]);
  await T("CSOM — tubotympanic (active)", ["CSOM — tubotympanic (mucosal)"], [
    await item("Candistin", "Ear Drop", "3 drop tds 7d", { side: "right", note: "ঔষধ দেওয়ার পর ৫ মিনিট কাত হয়ে থাকবেন" }), await item("Moxaclav", "Tablet", "1+0+1 af 7d"),
  ], ["কানে পানি ঢুকাবেন না, গোসলের সময় তুলা দিয়ে কান বন্ধ রাখবেন", "কটন বাড/কাঠি দিয়ে কান খোঁচাবেন না"], ["Pure tone audiometry (PTA)", "X-ray mastoid (Schüller view)"]);
  await T("Otomycosis", ["Otomycosis"], [await item("Fungin", "Ear Drop", "3 drop tds 14d", { side: "right" })], ["কানে পানি ঢুকাবেন না, গোসলের সময় তুলা দিয়ে কান বন্ধ রাখবেন"]);
  await T("BPPV", ["BPPV"], [await item("Betatin", "Tablet", "1+1+1 af 14d")], ["হঠাৎ মাথা ঘোরানো বা ঝুঁকে কাজ করা থেকে বিরত থাকুন"]);
  console.log("shared ENT Rx templates: seeded");
}

await seedLibraries(db);
console.log("lab catalogue:", await seedLabCatalogue(db));
await seedMedicines();
await seedDemoTenant();
await seedExamTemplates(db);
await seedEnt();
await db.$client.end();
