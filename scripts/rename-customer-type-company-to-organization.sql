-- Renames CustomerType's "COMPANY" value to "ORGANIZATION". Run once in the
-- Supabase SQL Editor, at or before the deploy with this schema change.
--
-- ALTER TYPE ... RENAME VALUE relabels the value in place: existing rows
-- become ORGANIZATION without an UPDATE, and there is no moment when old and
-- new values disagree (unlike add / update rows / drop).
--
-- Not re-runnable: a second run fails with "value already exists", which
-- means the rename has already happened.

ALTER TYPE "CustomerType" RENAME VALUE 'COMPANY' TO 'ORGANIZATION';
