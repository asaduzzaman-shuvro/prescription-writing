-- Report files are tenant data written only through /api/lab-files on the RLS connection.
-- No DELETE: removing a file wipes its bytes and keeps the row. Not replicated to devices.
GRANT SELECT, INSERT, UPDATE ON lab_file TO rx_app;
--> statement-breakpoint
REVOKE ALL ON lab_file FROM powersync_role;
--> statement-breakpoint
ALTER TABLE lab_file ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lab_file USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
