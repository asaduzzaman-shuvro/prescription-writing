GRANT SELECT, INSERT, UPDATE ON appointment TO rx_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON sms_log TO rx_app;
--> statement-breakpoint
GRANT SELECT ON subscription_payment TO rx_app;
--> statement-breakpoint
GRANT SELECT ON appointment, sms_log, subscription_payment TO powersync_role;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointment','sms_log','subscription_payment']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE appointment;
