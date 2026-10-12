# Coding standards

- **TypeScript strict.** No `any` without a comment saying why.
- **Every server action authorises first.** `requireUser()` and then
  `authorize(...)` (or a guard listed in `tests/guard-coverage.test.ts`), and
  reads by id check the record (`tests/tenant-coverage.test.ts`). CI fails
  otherwise.
- **Fence every query.** Lists use `reachWhere` / `orgWhere`; creates stamp the
  organisation and branch from the server, never from the form.
- **Audit every change** with `writeAuditLog` (plain-language action, the record,
  `changes: { field: { from, to } }` for edits; never passwords or tokens).
- **Workflow changes are compare-and-set** (`lib/integrity.ts`); money and stock
  totals are checked under a row lock.
- **Declare every new table** in `lib/governance/data-inventory.ts` (tenancy,
  owner column, classification, lifecycle, retention, AI access).
- **Schema changes are additive.** Never `--accept-data-loss`. Anything that
  fills or reshapes data is a reviewed SQL script that is safe to run twice.
- **No hard-coded organisation data.** Names, addresses, phone numbers, bank
  details, URLs and email senders come from the database or environment
  variables, with neutral fallbacks.
- **Colours from tokens.** Use `var(--ejo-*)`; Tailwind needs literal class
  strings, so never build a class name from a variable.
- **Plain English for people.** Clear success and error messages; no stack
  traces or library messages on screen. Use `pluralize` and the Africa/Lagos
  date helpers in `lib/utils`. British / Nigerian spelling ("organisation").
- **Comments say why**, in a sentence or two. History belongs in git, not in
  comments.
- **Keep accessible names stable.** Playwright selects buttons, links and
  headings by role and name.
