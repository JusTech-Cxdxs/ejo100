-- A Manager runs a branch: the role "Workshop Manager" is shown as "Manager"
-- (a person becomes the workshop's manager by being a Manager placed in the
-- workshop branch). Only the display name changes; the slug, the people who
-- hold it and its permissions stay as they are. Renamed only where nobody
-- has renamed it already. Re-runnable.
UPDATE "roles" SET "name" = 'Manager' WHERE "slug" = 'workshop-manager' AND "name" = 'Workshop Manager';
