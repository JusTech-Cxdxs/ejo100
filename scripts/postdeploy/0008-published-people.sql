-- The people the group names in its own press releases (v42), so "who is our
-- head of automobiles?" is answered from Organisation → People we publish
-- from day one. Public titles from the public record only; no contact details.
-- Inserted once, only when the organisation has published nobody yet and the
-- platform serves exactly one active organisation. Additive; re-runnable;
-- the organisation edits or removes them on the People we publish page.
DO $$
DECLARE org text;
BEGIN
  IF (SELECT count(*) FROM "organisations" WHERE "isActive") <> 1 THEN RETURN; END IF;
  SELECT "id" INTO org FROM "organisations" WHERE "isActive" LIMIT 1;
  IF EXISTS (SELECT 1 FROM "public_profiles" WHERE "organisationId" = org) THEN RETURN; END IF;

  INSERT INTO "public_profiles" ("id", "organisationId", "name", "title", "area", "bio", "profileUrl", "isPublic", "sortOrder", "createdAt", "updatedAt") VALUES
    ('pp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'Anil Sahgal', 'Managing Director, Auto & Transport Vertical', 'Automobiles and transport (Africa)', 'Leads the group''s auto and transport businesses across Africa.', NULL, TRUE, 10, now(), now()),
    ('pp_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), org, 'Sudeep Mittal', 'Head of Automobiles, Nigeria', 'Automobiles', 'Leads the automobile business in Nigeria — vehicle sales, the assembly hub at Isolo, the workshops and parts — and speaks for the group at vehicle launches.', NULL, TRUE, 20, now(), now());
END $$;
