-- A doctor's own C/C lines (doctor_complaint) are plain clinic data: a clinic reads and writes only its own rows.
-- Only the owner sees them on a device; that filter is in the sync pull, like custom_medicine. No DELETE (is_active).
-- Sharing with all doctors happens in /admin through the owner role, so rx_app still cannot write `complaint`.
GRANT SELECT, INSERT, UPDATE ON doctor_complaint TO rx_app;
--> statement-breakpoint
GRANT SELECT ON doctor_complaint TO powersync_role;
--> statement-breakpoint
ALTER TABLE doctor_complaint ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON doctor_complaint USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE doctor_complaint;
