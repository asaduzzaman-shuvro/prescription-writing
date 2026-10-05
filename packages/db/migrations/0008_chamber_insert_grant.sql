-- Doctors add their own chambers from the (offline) doctor app; the row arrives through /api/sync/upload.
-- RLS (tenant_isolation WITH CHECK) still pins every insert to the session's tenant.
GRANT INSERT ON chamber TO rx_app;
