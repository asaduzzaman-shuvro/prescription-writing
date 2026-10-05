/** Phase 3: appointments/serial booking, SMS log, subscriptions and payments. */
import { date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, chamber, patient, prescription, tenant } from "./tenant";

export const appointmentStatus = pgEnum("appointment_status", ["booked", "checked_in", "cancelled", "no_show"]);

/** A booked serial for a future (or today's) date. Checking in creates the encounter. */
export const appointment = pgTable(
  "appointment",
  {
    id: uuid().primaryKey(),
    tenantId: uuid().notNull().references(() => tenant.id),
    chamberId: uuid().references(() => chamber.id),
    doctorUserId: uuid().notNull().references(() => appUser.id),
    patientId: uuid().references(() => patient.id),
    name: text().notNull(),
    mobile: text(),
    apptDate: date().notNull(),
    serialNo: integer().notNull(),
    status: appointmentStatus().notNull().default("booked"),
    encounterId: uuid(),
    note: text(),
    source: text().notNull().default("chamber"), // chamber | phone | online
    createdBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appointment_tenant_date_idx").on(t.tenantId, t.apptDate)],
);

export const smsLog = pgTable(
  "sms_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().notNull().references(() => tenant.id),
    prescriptionId: uuid().references(() => prescription.id),
    toNumber: text().notNull(),
    body: text().notNull(),
    provider: text().notNull(),
    status: text().notNull(), // sent | failed
    providerRef: text(),
    error: text(),
    segments: integer().notNull().default(1),
    sentBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sms_log_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const subscriptionPayment = pgTable(
  "subscription_payment",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().notNull().references(() => tenant.id),
    plan: text().notNull(),
    months: integer().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    method: text().notNull(), // bkash | nagad | sslcommerz | cash | bank
    status: text().notNull().default("pending"), // pending | paid | failed | cancelled
    tranId: text().notNull(),
    gatewayRef: text(),
    gatewayPayload: jsonb(),
    paidAt: timestamp({ withTimezone: true }),
    recordedBy: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscription_payment_tran_uq").on(t.tranId), index("subscription_payment_tenant_idx").on(t.tenantId)],
);
