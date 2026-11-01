# Demo files

Invented data only (no real customer), the same on every run of
`npx tsx apps/portal/scripts/demo-files.ts`.

| Folder | Use it to |
| --- | --- |
| [`correct/`](correct/) | load the demo data cleanly — every row is accepted |
| [`with-mistakes/`](with-mistakes/) | test the import's check — the same data plus 25 planted mistakes, each listed with its row and what EJO says |

The walkthrough ([`docs/DEMO_WALKTHROUGH.md`](../DEMO_WALKTHROUGH.md)) uses
`with-mistakes/` where it shows the check catching problems.
