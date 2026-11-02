-- Manual version for the Supabase SQL editor: scripts/predeploy/0017-demo-organisation.sql.
-- D1 Demo people with sign-ins: the column that marks the demo organisation.
-- Re-runnable. Nothing else is needed by hand: the demo people themselves are
-- made by the production build when DEMO_STAFF_PASSWORD is set (Vercel →
-- Settings → Environment Variables), or by `npm run demo:people`.
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- To see which organisation is the demo:
-- SELECT "slug", "name", "isDemo" FROM "organisations" ORDER BY "createdAt";
