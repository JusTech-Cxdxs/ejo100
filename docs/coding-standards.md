# Coding Standards

- **Strict TypeScript everywhere.** No `any` without a comment explaining why.
- **No hardcoded colours.** Reference `var(--ejo-*)` CSS variables, never a
  raw hex value, so the dynamic branding engine keeps working.
- **No hardcoded organizational names.** "Kewalram", "Workshop", "Isolo" are
  seed data, not identifiers baked into components or routes.
- **Reuse before you rebuild.** Check `packages/ui` and `packages/utils`
  before writing a new component or helper.
- **One module = one folder** in `apps/api/src/modules`, each with its own
  `.module.ts` / `.controller.ts` / `.service.ts` — never mix domains in a
  single file.
- **Every route renders something.** An unfinished page renders
  `<ComingSoon />`, never a blank page or an uncaught 404.
- **Incremental delivery.** Per the project's AI development rule, features
  are built phase by phase, not all at once, and reuse existing
  architecture rather than introducing parallel patterns.
