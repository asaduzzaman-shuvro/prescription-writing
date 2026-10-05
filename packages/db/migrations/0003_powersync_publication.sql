-- Tables replicated to clients by the PowerSync service (see infra/powersync/sync-config.yaml).
-- The publication must be named "powersync". Add new synced tables with ALTER PUBLICATION.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE
      brand_product, dosage_form, company, generic, product_ingredient, generic_interaction,
      specialty, complaint, investigation, diagnosis, advice_snippet, instruction_snippet, specialty_template,
      rx_template, patient, encounter, prescription, chamber, doctor_profile, doctor_favorite;
  END IF;
END $$;
