/**
 * Integration test against the local dev database. Verifies that the rx_app role
 * can only see and write rows of the tenant set by withTenant().
 */
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, DEV_DATABASE_URL, DEV_DATABASE_URL_APP, s, withTenant } from "../src";

const owner = createDb(process.env.DATABASE_URL ?? DEV_DATABASE_URL, { max: 2 });
const app = createDb(process.env.DATABASE_URL_APP ?? DEV_DATABASE_URL_APP, { max: 2 });
const A = randomUUID();
const B = randomUUID();
const userA = randomUUID();
const patientB = randomUUID();

beforeAll(async () => {
  await owner.insert(s.tenant).values([{ id: A, name: "RLS test A" }, { id: B, name: "RLS test B" }]);
  await owner.insert(s.appUser).values({ id: userA, email: `rls-${userA}@test.local`, name: "RLS", passwordHash: "x" });
  await owner.insert(s.patient).values({ id: patientB, tenantId: B, name: "Tenant B patient" });
});

afterAll(async () => {
  await owner.execute(sql`delete from audit_log where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from lab_report where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from lab_test where tenant_id in (${A}::uuid, ${B}::uuid) or code like 'rls-%'`);
  await owner.execute(sql`delete from lab_profile where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from lab_file where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from patient where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from chamber where tenant_id in (${A}::uuid, ${B}::uuid)`);
  await owner.execute(sql`delete from app_user where id = ${userA}::uuid`);
  await owner.execute(sql`delete from tenant where id in (${A}::uuid, ${B}::uuid)`);
  await owner.$client.end();
  await app.$client.end();
});

describe("row-level security", () => {
  it("hides other tenants' patients", async () => {
    const rows = await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.select().from(s.patient));
    expect(rows.find((r) => r.id === patientB)).toBeUndefined();
    const own = await withTenant(app, { tenantId: B, userId: userA }, (tx) => tx.select().from(s.patient));
    expect(own.map((r) => r.id)).toContain(patientB);
  });

  it("sees nothing without a tenant context", async () => {
    const rows = await app.select().from(s.patient);
    expect(rows).toEqual([]);
  });

  it("rejects inserting a row for another tenant", async () => {
    await expect(
      withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.patient).values({ id: randomUUID(), tenantId: B, name: "sneaky" })),
    ).rejects.toThrow();
  });

  it("cannot update another tenant's row (silently 0 rows)", async () => {
    await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.execute(sql`update patient set name = 'hacked' where id = ${patientB}::uuid`));
    const [p] = await owner.select().from(s.patient).where(sql`id = ${patientB}::uuid`);
    expect(p?.name).toBe("Tenant B patient");
  });

  it("lets a clinic add its own chamber, with schedule and footer", async () => {
    const id = randomUUID();
    await withTenant(app, { tenantId: A, userId: userA }, (tx) =>
      tx.insert(s.chamber).values({
        id, tenantId: A, name: "Second chamber", address: "Faridpur",
        schedule: [{ days: ["sat", "sun"], from: "17:00", to: "21:00" }], serialPhone: "01700-000000", footerText: "Report showing within 5 working days is free",
      }),
    );
    const [c] = await owner.select().from(s.chamber).where(sql`id = ${id}::uuid`);
    expect(c?.serialPhone).toBe("01700-000000");
    expect(c?.schedule).toEqual([{ days: ["sat", "sun"], from: "17:00", to: "21:00" }]);
  });

  it("rejects adding a chamber to another tenant", async () => {
    await expect(
      withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.chamber).values({ id: randomUUID(), tenantId: B, name: "sneaky", address: "x" })),
    ).rejects.toThrow();
  });

  it("keeps lab reports inside their clinic, and can't hard-delete them", async () => {
    const id = randomUUID();
    await owner.insert(s.labReport).values({ id, tenantId: B, patientId: patientB, reportDate: "2026-10-01", panel: "cbc", title: "CBC", results: [] });
    const seenByA = await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.select().from(s.labReport));
    expect(seenByA.find((r) => r.id === id)).toBeUndefined();
    await expect(
      withTenant(app, { tenantId: A, userId: userA }, (tx) =>
        tx.insert(s.labReport).values({ id: randomUUID(), tenantId: B, patientId: patientB, reportDate: "2026-10-01", panel: "cbc", title: "sneaky" })),
    ).rejects.toThrow();
    await expect(withTenant(app, { tenantId: B, userId: userA }, (tx) => tx.execute(sql`delete from lab_report where id = ${id}::uuid`)))
      .rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });

  it("lab catalogue: every clinic reads the platform's rows, but writes and reads only its own", async () => {
    const platform = randomUUID(), ownB = randomUUID();
    const code = `rls-${randomUUID().slice(0, 8)}`;
    await owner.insert(s.labTest).values({ id: platform, code, name: "Platform test", short: "PT", kind: "numeric", source: "rx-curated" });
    await owner.insert(s.labTest).values({ id: ownB, tenantId: B, code, unit: "g/L" });
    const seenByA = await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.select().from(s.labTest).where(sql`code = ${code}`));
    expect(seenByA.map((r) => r.id)).toEqual([platform]);
    // A clinic can't change the platform's row, add one, or touch another clinic's.
    await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.execute(sql`update lab_test set name = 'hacked' where id in (${platform}::uuid, ${ownB}::uuid)`));
    const after = await owner.select().from(s.labTest).where(sql`code = ${code}`);
    expect(after.map((r) => r.name).sort()).toEqual(["Platform test", null]);
    await expect(withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.labTest).values({ id: randomUUID(), tenantId: null, code: `${code}x`, name: "x", short: "x", kind: "numeric" })))
      .rejects.toThrow();
    // Its own override is fine, once per code.
    await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.labTest).values({ id: randomUUID(), tenantId: A, code, isActive: false }));
    await expect(withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.labTest).values({ id: randomUUID(), tenantId: A, code })))
      .rejects.toThrow();
    await expect(withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.execute(sql`delete from lab_test where tenant_id = ${A}::uuid`)))
      .rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });

  it("keeps the lab profile inside its clinic", async () => {
    await owner.insert(s.labProfile).values({ id: B, tenantId: B, labName: "B's lab" });
    expect(await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.select().from(s.labProfile))).toEqual([]);
    await expect(withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.insert(s.labProfile).values({ id: randomUUID(), tenantId: B, labName: "sneaky" })))
      .rejects.toThrow();
  });

  it("keeps report photos inside their clinic", async () => {
    const id = randomUUID();
    await owner.insert(s.labFile).values({
      id, tenantId: B, patientId: patientB, labReportId: randomUUID(), contentType: "image/jpeg", sizeBytes: 3, sha256: "x", data: Buffer.from([0xff, 0xd8, 0xff]),
    });
    const seenByA = await withTenant(app, { tenantId: A, userId: userA }, (tx) => tx.select({ id: s.labFile.id }).from(s.labFile));
    expect(seenByA.find((r) => r.id === id)).toBeUndefined();
    const seenByB = await withTenant(app, { tenantId: B, userId: userA }, (tx) => tx.select().from(s.labFile).where(sql`id = ${id}::uuid`));
    expect(seenByB[0]?.data).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("cannot read password hashes", async () => {
    await expect(app.execute(sql`select password_hash from app_user limit 1`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });

  it("cannot write the catalogue", async () => {
    await expect(app.execute(sql`update brand_product set brand_name = brand_name where false`)).rejects.toMatchObject({ cause: { message: expect.stringMatching(/permission denied/) } });
  });
});
