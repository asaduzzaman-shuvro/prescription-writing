-- Lab reports are tenant data: the app role reads and writes them under RLS (soft delete only),
-- PowerSync replicates them to the clinic's devices.
GRANT SELECT, INSERT, UPDATE ON lab_report TO rx_app;
--> statement-breakpoint
GRANT SELECT ON lab_report TO powersync_role;
--> statement-breakpoint
ALTER TABLE lab_report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON lab_report USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE lab_report;
