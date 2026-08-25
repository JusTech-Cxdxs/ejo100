-- Enables Row-Level Security on every table in the public schema, with
-- zero permissive policies attached — a deliberate default-deny.
--
-- WHY THIS IS SAFE FOR THIS APP SPECIFICALLY: this project's apps
-- (portal, website, api) never use Supabase's own client library or
-- its auto-generated PostgREST API — every database access goes
-- through Prisma, connecting directly to Postgres with the database
-- owner/service-role connection string, which bypasses RLS by design
-- (RLS only restricts roles it's explicitly applied to; the owner
-- role is exempt). Enabling RLS here does NOT touch or break the
-- application's own access at all.
--
-- WHAT THIS ACTUALLY FIXES: Supabase exposes every public-schema
-- table through its REST API by default, regardless of whether an
-- app uses that API — this is what the "Table publicly accessible"
-- and "Sensitive data publicly accessible" advisories are about.
-- With RLS enabled and no policies, that API path is fully blocked
-- for every anonymous or authenticated Supabase client — exactly the
-- intended state, since nothing in this project is meant to use that
-- API path at all.
--
-- Run this once in the Supabase SQL Editor (Project → SQL Editor →
-- New query → paste → Run). Safe to re-run — ENABLE ROW LEVEL
-- SECURITY is idempotent, and running it again on an
-- already-protected table is a no-op, not an error.
--
-- IMPORTANT: any NEW table added to schema.prisma in the future needs
-- its own line added here too — Prisma's schema has no concept of
-- RLS, so this can never be automated from the schema itself. Treat
-- this file as the living checklist; keep it in sync with
-- schema.prisma's own @@map() table names.

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_unit_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_card_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
