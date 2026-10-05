-- Application role used by request handlers acting for a clinic user. Subject to RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rx_app') THEN
    CREATE ROLE rx_app LOGIN PASSWORD 'rx_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO rx_app;
--> statement-breakpoint
-- Catalogue and libraries: read-only for clinic users.
GRANT SELECT ON company, dosage_form, drug_class, generic, generic_drug_class, generic_monograph,
  brand_product, product_ingredient, product_pack, generic_interaction, specialty, investigation,
  diagnosis, complaint, advice_snippet, instruction_snippet, specialty_template TO rx_app;
--> statement-breakpoint
-- Users: never expose password hashes to the app role.
GRANT SELECT (id, email, phone, name, platform_role, disabled) ON app_user TO rx_app;
--> statement-breakpoint
GRANT SELECT ON tenant, membership TO rx_app;
--> statement-breakpoint
GRANT UPDATE (patient_seq, updated_at) ON tenant TO rx_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON doctor_profile, chamber TO rx_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON patient, encounter, prescription, prescription_item, rx_template, doctor_favorite TO rx_app;
--> statement-breakpoint
GRANT DELETE ON prescription_item, doctor_favorite, rx_template TO rx_app;
--> statement-breakpoint
GRANT INSERT, SELECT ON audit_log TO rx_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_log_id_seq TO rx_app;
--> statement-breakpoint
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant USING (id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE rx_template ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Platform-shared templates (tenant_id IS NULL) are readable by everyone but writable by no clinic.
CREATE POLICY rx_template_read ON rx_template FOR SELECT USING (tenant_id IS NULL OR tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY rx_template_write ON rx_template FOR ALL USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['membership','doctor_profile','chamber','patient','encounter','prescription',
                           'prescription_item','doctor_favorite','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
  END LOOP;
END $$;
