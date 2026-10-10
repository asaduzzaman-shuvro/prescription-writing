-- The history library is a platform pick-list like complaint: read-only for clinic users, replicated to devices.
GRANT SELECT ON history_item TO rx_app;
--> statement-breakpoint
GRANT SELECT ON history_item TO powersync_role;
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE history_item;
