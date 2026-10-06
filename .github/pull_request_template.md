## What and why

## Baseline check (docs/ARCHITECTURE_BASELINE.md)
- [ ] **Security** — who may do this? Enforced on the server (`authorize` / `authorizeOn…` / record check), not by hiding a button.
- [ ] **Tenancy** — which organisation owns the data? New tables declared in `lib/governance/data-inventory.ts`.
- [ ] **Scope** — which branch / department / assigned records? Lists use `reachWhere` / `orgWhere`.
- [ ] **Workflow** — which states are legal? Transitions use compare-and-set.
- [ ] **Integrity** — what stops two people / a double click conflicting? (idempotency, unique keys, transactions)
- [ ] **Audit** — what is recorded (`writeAuditLog`)?
- [ ] **Notifications / realtime** — who needs to know? Only people allowed to see it.
- [ ] **Analytics** — which figures change?
- [ ] **AI** — may AI ever read this data? (inventory `ai`)
- [ ] **Recovery** — what happens if it fails halfway? Database changes additive / reviewed SQL?

## Verification
- [ ] `npm run typecheck` · `npm run lint` · `npm run test --workspace=apps/portal` · `next build`
