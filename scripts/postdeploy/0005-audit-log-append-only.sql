-- The audit trail is append-only: rows in audit_logs can be added, never
-- changed or removed by the application (or anyone using its connection by
-- mistake). A deliberate, recorded maintenance step can still switch it off
-- for one transaction: SET LOCAL ejo.audit_maintenance = 'on'.
-- Note: a database owner can disable triggers; for evidence that must
-- survive the database owner, ship the trail to an external log store too.
-- Re-runnable (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION ejo_audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('ejo.audit_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER audit_logs_append_only_rows
      BEFORE UPDATE OR DELETE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION ejo_audit_logs_append_only();
    CREATE OR REPLACE TRIGGER audit_logs_append_only_truncate
      BEFORE TRUNCATE ON "audit_logs"
      FOR EACH STATEMENT EXECUTE FUNCTION ejo_audit_logs_append_only();
  END IF;
END $$;
