-- The lab catalogue mixes platform rows (tenant_id IS NULL) with each clinic's own, like rx_template: everyone
-- reads the platform's, a clinic reads and writes only its own (it can never write a platform row).
-- The lab profile is plain tenant data. All three replicate to devices. No DELETE: clinics hide rows instead.
GRANT SELECT, INSERT, UPDATE ON lab_test, lab_panel, lab_profile TO rx_app;
--> statement-breakpoint
-- Lab numbers come from a per-clinic counter, assigned when an in-house report is uploaded.
GRANT UPDATE (lab_seq) ON tenant TO rx_app;
--> statement-breakpoint
GRANT SELECT ON lab_test, lab_panel, lab_profile TO powersync_role;
--> statement-breakpoint
ALTER TABLE lab_test ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lab_test_read ON lab_test FOR SELECT USING (tenant_id IS NULL OR tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY lab_test_write ON lab_test FOR ALL USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE lab_panel ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lab_panel_read ON lab_panel FOR SELECT USING (tenant_id IS NULL OR tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY lab_panel_write ON lab_panel FOR ALL USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE lab_profile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lab_profile USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE lab_test, lab_panel, lab_profile;
