-- Medicines a doctor added (custom_medicine) are plain clinic data: a clinic reads and writes only its own rows.
-- Only the owner sees them on a device; that filter is in the sync pull, like doctor_favorite. No DELETE.
-- Approval happens in /admin through the owner role, so rx_app still cannot write the medicine catalogue.
GRANT SELECT, INSERT, UPDATE ON custom_medicine TO rx_app;
--> statement-breakpoint
GRANT SELECT ON custom_medicine TO powersync_role;
--> statement-breakpoint
ALTER TABLE custom_medicine ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON custom_medicine USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE custom_medicine;
