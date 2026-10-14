# EJO 100 — AI Readiness Assessment

**Date:** 12 October 2026 · **Scope:** the data, controls and boundaries the AI
phase (AI support centre, Intelligence) will build on · **Status:** assessment
and plan; no AI feature is built.

This document records what the platform already provides for a safe AI layer,
what is missing, and the rules the AI phase must follow. Every statement points
to the file it comes from. Where the code does not yet do something, it says
**Gap** or **Planned**.

---

## 1. Summary

| Question | Answer today |
|---|---|
| Is every table classified for AI use? | Yes. All 95 tables in `packages/database/prisma/schema.prisma` have an `ai` value in `apps/portal/lib/governance/data-inventory.ts`; `apps/portal/tests/data-inventory.test.ts` fails CI if a table is missing. |
| Can AI reuse the existing permission checks? | Yes, if it runs as the asking person. `getPrincipal`, `decide`, `authorize` and `reachWhere` in `apps/portal/lib/authz/server.ts` already answer "may this person see this record / this list". |
| Can AI actions be told apart in the audit trail? | Partly. `setAuditActor(userId, source, organisationId)` in `packages/database/src/audit-journal.ts` records a `source` per request; an AI source label and "suggested by" metadata are **Planned** (section 5). |
| Is there a curated, read-only copy of the data for AI? | **Gap.** The AI service would have to read live tables. The Data warehouse & BI module (roadmap) provides the curated views. |
| Is there a column-level "redacted" access level? | **Gap.** The inventory has `NEVER`, `AGGREGATE_ONLY` and `AUTHORISED_USER` per table. Masking of personal columns is **Planned** (section 2.4). |

The baseline rule already binding on every change (`docs/ARCHITECTURE_BASELINE.md`
§16): **AI is never an authorization authority.** It may observe, analyse,
summarise, recommend and draft, always as the person using it; a human approves
every action; SECRET data is never available to AI.

---

## 2. Data classification for AI

The source of truth is `DATA_INVENTORY` in
`apps/portal/lib/governance/data-inventory.ts`. Its `AiAccess` type has three
values:

- `NEVER`: AI may not read the table at all, not even in aggregate.
- `AGGREGATE_ONLY`: AI may read counts, sums and trends, never individual rows.
- `AUTHORISED_USER`: AI may read individual rows, but only the rows the person
  it is acting for can already open in the portal.

### 2.1 Never (13 tables)

| Table | Why |
|---|---|
| `Session`, `Account`, `Verification` | Staff credentials and sessions (SECRET). |
| `CustomerSession`, `CustomerAccount`, `CustomerVerification` | Customer credentials, sessions and one-time link tokens (SECRET). |
| `EmployeeDocument` | Personal documents on the employee file. |
| `NotificationRead`, `NotificationPreference`, `CustomerNotificationRead` | Screen state; no business value, and reveals personal reading habits. |
| `SecurityEmailLog` | Who was emailed about a site-security event. |
| `AssistSession` (v29) | The record of staff-assisted sessions; part of the security trail. |
| `ErrorEvent` (v29) | Error references, messages and stacks; may contain fragments of input. |

These tables must not appear in any view, export or prompt built for AI. A test
that reads the curated views' source and fails on any of these names is
**Planned** with the data warehouse.

### 2.2 Aggregate only (2 tables)

| Table | Allowed use |
|---|---|
| `EmployeeProfile` | Headcount and tenure counts per branch or department. Never one person's profile. |
| `AuditLog` | Volumes and patterns (e.g. "refunds recorded per week", "refused access attempts per day") for anomaly detection. Never the content of one entry, which can hold before/after values of personal fields. |

### 2.3 Authorised user (80 tables)

Everything else: organisation structure, roles, users, customers and their
vehicles, Job Cards and Vehicle Services with their estimates, payments and
refunds, parts and stock, goods receipts, procurement, warranties and claims,
security records, scheduling and broadcasts. The full list is the inventory
file itself.

"Authorised user" means the AI sees what the person sees, through the same
fence. It does not mean every authorised user may send every row to a model; the
minimisation rules in 2.4 still apply.

### 2.4 Personal columns inside authorised tables

Several `AUTHORISED_USER` tables hold personal data (classification `PERSONAL`):
`User`, `Customer`, `CustomerCompany`, `CustomerAddress`, `CustomerContact`,
`CustomerNote`, `CustomerVehicle`, `Visit`, `ExitPassPerson`, `RoadTestPerson`,
`ContractorPass`, `Appointment`.

Rules for the AI phase:

1. **Minimise before sending.** A prompt carries only the fields the task needs.
   A question about a Job Card's status sends the job number, status, dates and
   line descriptions, not the customer's phone, email or address.
2. **Mask by default.** Phone numbers, email addresses and street addresses are
   replaced with placeholders (`[phone]`, `[email]`) before text leaves the
   portal, and restored in the answer only for a person who may see them.
3. **Free text is higher risk.** `CustomerNote.body`, complaint text and
   incident descriptions can contain anything staff typed. They go to the model
   only for the person who opened that record, never in bulk.

**Recommendation (Gap):** add a fourth `AiAccess` value, `REDACTED` (row-level
access with named personal columns masked), and move `CustomerNote`, `Visit`,
`ContractorPass`, `ExitPassPerson` and `RoadTestPerson` to it. That is a change
to `data-inventory.ts` and its test, reviewed like any baseline change.

### 2.5 Future tables

Each roadmap module must declare its tables with an AI value when it is built.
Already decided on the roadmap pages (`apps/portal/lib/roadmap.ts`): informal
chat messages are `NEVER`; customer feedback comments are `AGGREGATE_ONLY`;
official messages follow the record they are attached to.

---

## 3. Tenant isolation for AI retrieval

The AI layer must get exactly the isolation a person gets today, by reusing the
same code rather than re-implementing it.

| Fence | How it works today | What the AI layer must do |
|---|---|---|
| Organisation | `decide()` in `apps/portal/lib/authz/catalogue.ts` refuses any record whose branch is outside the person's organisation, before scope. `orgWhere` / `orgOwned` fence organisation-owned data. Audit rows carry `organisationId` (stamped in `audit-journal.ts`). | Every AI request carries one organisation id, taken from the server session, never from the request body. Retrieval runs through `reachWhere` / `orgWhere`. Any vector index or cache is partitioned per organisation (one index or one mandatory filter per organisation). |
| Branch | Scope `BRANCH` limits a person to their branch; `reachWhere(key)` returns the branch filter for a permission. | The retrieval query for each permission uses that permission's `reachWhere`, so a technician's assistant never sees another branch's jobs. |
| Department / assigned / own | Scopes `DEPARTMENT`, `ASSIGNED` (the job's supervisor, technician or opener) and `OWN` in the catalogue. | Same `decide()` call per record before it is put in a prompt. |
| Customer | The customer portal queries by the session's customer id (`apps/website/lib/auth-customer.ts`, contract 1 and 3 in the brief), never by an id from the URL. | The customer assistant receives only records fetched by the customer portal's own loaders for the signed-in customer. It has no staff permissions at all. |
| Permission-aware retrieval | `getPrincipal()` builds the person's roles, grants, branch and organisation once per request. | The AI service never holds a broader identity. The portal fetches context **as the user** and sends it; the service does not query the operational database. |

Two consequences:

- **No shared embeddings across organisations.** If retrieval over documents or
  notes is added, the index key includes the organisation, and results are
  re-checked with `decide()` before use (a stale index must not leak a record the
  person lost access to).
- **Results are re-fenced on the way out.** Anything the service returns that
  names a record (a forecast for a part, an anomaly on a refund) is checked with
  the same record check before it is shown.

---

## 4. The integration boundary

```
Portal (Next.js, Vercel)                          AI service (Python, separate host)
  server action / route handler                     FastAPI
   1. requireUser, authorize                         - verifies the service token
   2. fetch context AS THE USER                      - checks request size and rate
      (reachWhere / record checks, minimised)        - builds the prompt or runs the model
   3. POST /v1/<task>  ─────────────────────────►    - returns a suggestion + reasons
      Authorization: Bearer <service token>          - never writes to the database
      { organisationId, userId, task, context }
   4. re-fence the result, show it as a suggestion ◄─
   5. a person accepts → the normal server action
      runs (authorize, workflow, audit)
```

| Control | Rule |
|---|---|
| Separate service | Python (FastAPI; pandas, scikit-learn, statsmodels for Intelligence; an LLM client for the support assistant) on its own host. It has no `DATABASE_URL`. |
| Service token | A long random token per environment, sent as a header, compared in constant time (the pattern in `apps/portal/lib/cron-auth.ts`). Rotated by changing the environment variable on both sides. Never a `NEXT_PUBLIC_*` value. |
| Read path for Intelligence | Batch models read curated, tenant-stamped views produced by the data warehouse job (roadmap: Data warehouse & BI), or a read replica when one exists. Never the live primary, never tables marked `NEVER`. **Gap until the warehouse exists.** |
| Write path | None. The service returns suggestions; only the portal's server actions write, after a person accepts. |
| Prompt injection | Record text (notes, complaints, ticket messages, customer replies) is data, never instructions: it is passed in clearly delimited fields, the system prompt says so, and tools are not exposed to the model. The assistant has no tool that changes data, so an injected instruction cannot trigger an action. Output is rendered as text (React escaping), never as HTML. |
| Rate limits | Per person and per organisation on the portal side (same approach as `apps/portal/middleware.ts`), and per token on the service. |
| Cost limits | A monthly token / compute budget per organisation, checked before each call; when it is reached the feature says so and the rest of the portal is unaffected. |
| Failure | AI is never on the critical path (`docs/PRODUCTION_READINESS.md` §7, principle 1). A timeout or error hides the suggestion; the page and the workflow work as before. |
| Data residency | Today the database is in Supabase EU (Frankfurt) and the apps are hosted in the US (`docs/PRODUCTION_READINESS.md` §4). Any model provider adds another transfer. The provider, its region and its data-retention terms are recorded before go-live, and providers that train on submitted data are not used. |

---

## 5. Audit of AI involvement

The AI never acts. When a person accepts a suggestion, the normal server action
runs, so the existing audit applies: the data journal records the change under
the person (`setAuditActor` in `requireUser`), and `writeAuditLog` records the
business event.

**Planned additions:**

- The accepting action adds `metadata.suggestedBy = { service: 'ai', task, modelVersion, suggestionId }`
  to its audit entry, so the trail reads "suggested by AI, done by <person>".
  The `actor: 'staff' | 'customer'` convention used for customer records stays;
  AI is never an actor.
- The AI service keeps its own log per suggestion: organisation, user, task,
  input size, model and version, latency, cost, and whether the person accepted,
  edited or rejected it. It does not keep the prompt text beyond a short
  debugging window, because the prompt can contain personal data.
- A support reply drafted by the assistant records both the draft and the text
  actually sent (`TicketMessage.aiSuggested`, `approvedBy` on the roadmap page).

---

## 6. Privacy (Nigeria Data Protection Act 2023)

The inventory already classifies personal data and sets retention
(`PERSONAL_RETENTION` in `data-inventory.ts`: "while the relationship is
active; then as the retention policy allows (NDPA 2023, no longer than
necessary)").

For the AI phase:

| Topic | Rule |
|---|---|
| Lawful basis and purpose | Staff help and analytics run under the organisation's legitimate interest in running its business; the purpose is stated in the staff and customer privacy notices before launch. Using customer data for a new purpose (e.g. training a model) is a further purpose and needs consent. |
| Consent | No training or fine-tuning on customer or employee data without express consent. Forecasting models are fitted on aggregates (parts demand, workshop load) that contain no personal data. |
| Automated decisions | No decision with legal or similarly significant effect on a person is made by AI alone. Every suggestion is reviewed by a person, which is also the platform's rule. |
| Impact assessment | A data protection impact assessment is done before each AI feature goes live, recorded with the organisation's Data Protection Officer, covering the data used, the provider, cross-border transfer and risks to vulnerable people. The NDPC's General Application and Implementation Directive (GAID 2025) asks for this for emerging technologies. |
| Cross-border transfer | Sending personal data to a model hosted outside Nigeria is a cross-border transfer. Minimise and mask first (section 2.4); record the transfer basis for the provider. |
| Data subject rights | Access and erasure requests cover AI logs too; the AI service log is keyed by organisation and user so it can be searched and deleted. |
| Retention | Prompt text: short debugging window only. Suggestion metadata: with the audit trail. Model artefacts: no personal data in them. |

This section is an engineering position, not legal advice; the organisation's
DPO signs off each feature.

---

## 7. Evaluation and monitoring

| What | How |
|---|---|
| Forecast accuracy | Back-tests on history held out by time; error (MAPE / MAE) stored per model version and shown next to the forecast. A model replaces the current baseline only if it beats it. The baseline is the linear trend already in `lib/master-analytics.ts` (`linearFit`). |
| Reproducible inputs | Forecast inputs are computed by the same pure functions the analytics tests check (`apps/portal/tests/analytics.test.ts`), so a number the model sees agrees with the number on the page. |
| Assistant quality | A fixed question set per role, answered and graded before each release; a release that answers a question outside the asker's permission fails. Cross-organisation questions are part of the set, mirroring the existing Playwright cross-organisation tests. |
| Live monitoring | Acceptance and edit rates per task; cost and latency per organisation; refusals; alerts when a suggestion type is mostly rejected. |
| Red-team checks | Prompt-injection cases in notes and ticket text; requests for another organisation's or another branch's data; requests for credentials. Added to `security.yml` once the service exists. |

---

## 8. Phased plan

| Phase | Delivers | Needs first |
|---|---|---|
| 0. Groundwork | `REDACTED` inventory level; AI source label and `suggestedBy` metadata in the audit helpers; service token and the Python service skeleton (health check only); curated views for jobs, stock and money in the data warehouse. | Data warehouse job; owner approval of the inventory change. |
| 1. Support assistant (staff) | Ticketing without AI, then drafted answers to "how do I…" and "why can't I…" from guides and the permission catalogue (`lib/authz/catalogue.ts`, `lib/authz/describe-access.ts`). No customer data in prompts. | Phase 0. |
| 2. Support assistant (customers) | Drafted replies about the customer's own vehicles, jobs, payments and warranties, from the customer portal's loaders. A person sends every reply. | Phase 1 measured; DPIA signed off. |
| 3. Analytics insights | Plain-language summaries of Business, Inventory and Warranty Analytics, each linking to the records behind it; questions answered within the person's scope. | Curated views; evaluation set. |
| 4. Forecasting and anomalies | Parts demand (feeding reorder points), workshop load, revenue; unusual refunds, discounts and stock adjustments sent to managers. | 12+ months of history per branch; back-test results beating the baseline. |

Each phase ships as its own pull request with tests, the same CI gates as the
rest of the platform, and a Playwright spec that proves a person from another
organisation or branch cannot see the AI output.

---

## 9. Enyo 1.0 — staff tools (status: built)

The staff assistant (`POST /api/enyo/chat`, `apps/portal/lib/enyo/tools/`)
offers these tools to the model for every question. Each one calls the
module's own authorised readers as the signed-in person; the permission rule
is enforced inside the tool, which refuses (`refused: true`) when the person
lacks it. Figures are computed in code and quoted, never added up by the
model; tool results are clipped and redacted before they are stored.

| Tool | Kind | What it returns | Permission rule |
|---|---|---|---|
| `guide_search` | read | Numbered how-to steps and the page link, from the curated guide (`lib/enyo/guide.ts`, 60+ entries). | Only entries whose page the person can open (`decide()`, as the page guards); others named only. |
| `my_work` | read | Decisions and other steps waiting (oldest first, overdue ≥ 3 days), open jobs. | The person's own lists (`getDashboardNotifications`, `getMyJobs`); no decisions during an assisted session. |
| `daily_brief` | read | Counts waiting and overdue, open jobs, today's appointments, *My numbers this month*. | As above, plus `listCalendar` and `getMyNumbers`. |
| `search_records` | read | Grouped hits for any reference, plate, VIN, name, phone or part number. | `globalSearch` — each record type only for people who may open it, within their reach. |
| `job_card_details` | read | Status, approval, customer, vehicle, complaints, diagnosis, people, estimate, payments, balance, next step. | `workshop.job_card.view`; the record through `getJobCard` (branch fence); out of reach = not found. |
| `vehicle_service_details` | read | The same for a Vehicle Service, plus next service due. | `workshop.job_card.view`; `getVehicleService`, `getServiceEstimate`, `getVehicleServicePayments`, `listRefunds`. |
| `customer_profile` | read | Contact, vehicles, jobs, net spend, outstanding, last visit, open jobs. | `crm.view`; `searchCrmCustomers` + `getCustomer360` (organisation fence, money within reach). |
| `vehicle_history` | read | Past jobs and services with complaints, diagnosis, notes, work, findings, parts fitted. | `workshop.job_card.view`; vehicle in the organisation; visits within `reachWhere`. |
| `part_lookup` | read | Selling price, stock on hand / reserved / available, level. Cost and margin only for cost-seers. | `store.view` (`listParts` in the person's Store); costs only with a `STORE_COST_PERMISSIONS` key for that branch. |
| `stock_alerts` | read | Parts out of stock or at/below reorder point; pricing alerts for cost-seers. | `store.view`; pricing alerts via `getPricingAlertSummary` (cost permissions). |
| `business_summary` | read | Takings, revenue, gross profit, jobs, previous period and changes, money owed — today, this week, month, last month, 30 days, quarter, year or custom. | `analytics.business.view`; `getMasterAnalytics` (branch-aware). |
| `technician_leaderboard` | read | Ranking by jobs completed, average start-to-complete hours vs team average, labour billed (money viewers only), with the formula. | `analytics.business.view` or `workshop.close.approve`, within that reach. |
| `warranty_watch` | read | Warranties ending in N days, awaiting verification, open claims by deadline. | `warranty.view`; the organisation's customers (`orgWhere`). |
| `service_due` | read | Vehicles overdue or due soon, reminder state. | `workshop.job_card.view`; `listVehiclesDueForService` for the person's workshop branch. |
| `my_schedule` | read | The person's appointments today, tomorrow or this week. | `listCalendar` (own, delegated and participating calendars). |
| `my_security` | read | Own active exit passes, visitors expected today or on site. | `listExitPasses('mine')`, `listMyVisits()`. |
| `remember_fact` / `forget_fact` | read* | Adds or removes the person's own remembered facts (max 50 × 200 characters). | Own user id and organisation; refused during an assisted session; instructions, passwords and card details are never stored. |
| `draft_job_card` | draft | A draft whose link opens the Open Job Card form pre-filled (customer, vehicle, complaints, mileage). | `workshop.job_card.create`; customer and vehicle through the organisation-fenced pickers; the page re-checks every value and never submits. |

\* The memory tools change only the person's own Enyo memory, never a business
record; the engine's tool kinds are `read` and `draft` only.

Chat transcripts are kept 12 months after the last message (public website
chats 90 days) and removed by the daily clean-up (`enyo-cleanup` job run).

---

## 10. Training data

Enyo's first learning loop (`apps/portal/lib/enyo/predict`) predicts the
likely estimate lines of a new Job Card or Vehicle Service from the
organisation's own finished jobs, and measures itself. Its measured history is
the training set for the Python ML phase.

### 9.1 The current model: `knn-tfidf-1`

| Step | How |
|---|---|
| Text | Complaint text is lower-cased, punctuation stripped, common English and Nigerian-English workshop phrases mapped to one word each ("AC", "a/c", "aircon", "air condition" → `aircon`; "won't start", "refusing to start" → `nostart`; "shaking", "vibrating" → `vibration`; "pads" → `brakepad` …), filler words dropped and words lightly stemmed (`text.ts`). |
| Candidates | A bounded query, no database extensions: finished jobs (estimate Manager-approved, not cancelled) of the same organisation, last 3 years — same make and model family first, then same make, then any — at most 500 (`similar.ts`). |
| Similarity | TF-IDF cosine (smoothed idf, sublinear tf) × 0.8 plus a vehicle bonus of at most 0.2 (same make, same model family, year within 2, mileage within 25%) and 0.02 for the same kind of record; jobs below 0.15 text similarity are not "similar" (`similar-core.ts`). The top 9 are the neighbours. |
| Lines | A line is identified by its Part Type (Store parts), as one line (Sundry), or by type + the meaningful words of its description. A line is predicted when at least 2 neighbours and 40% of them had it; quantity is the median; labour/jobs/sundry carry the median and p25–p75 of what neighbours charged. Store parts are priced only from today's Store selling price and stock when shown. Fewer than 3 neighbours → no prediction, with the reason (`lines-core.ts`). |
| Measuring | When the Manager gives the estimate its final approval, the stored prediction is compared with the approved lines: precision (predicted lines that were approved), recall (approved lines that were predicted), labour error in naira. Exactly once (conditional update on `resolvedAt IS NULL`). |
| Modes | `OFF` → nothing. `SHADOW` → predicted and measured, never shown. `SUGGEST` → shown to the estimate's supervisor and technician as "Likely lines from similar jobs"; Add only fills in the normal form. Promotion rule shown on the Learning page: 200+ resolved predictions with average precision ≥ 70%; an administrator decides. |

### 9.2 The export

`GET /enyo/learning/export?format=csv|jsonl` (Manage Enyo only, never during an
assisted session, audited as `enyo.training_data_exported`) builds one row per
finished job of the last 3 years (at most 20,000), from `dataset.ts`:

| Column | Meaning |
|---|---|
| `row_id` | Opaque id, salted per export — cannot be traced to a record and differs between exports. |
| `kind` | `JOB_CARD` or `SERVICE`. |
| `opened_on` | Lagos day the job was opened (the time-ordered split uses it). |
| `branch_code` | The branch's short code. |
| `complaint_text` | The complaints, with emails, phone numbers, plates, VINs, links and the names of the customer, their contacts and the staff on the job replaced by `[email]`, `[phone]`, `[plate]`, `[vin]`, `[link]`, `[name]`. |
| `make`, `model`, `year`, `vehicle_type` | Vehicle features. |
| `mileage_band_km` | Odometer rounded down to 5,000 km. |
| `lines` | Final approved lines: `type`, `key` (the line identity above — the multi-label target), `label`, `quantity`, and `unit_price` / `amount` for priced-by-people lines (never for Store parts). |
| `labour_total` | Sum of approved labour, naira (the regression target). |
| `predicted_keys`, `precision`, `recall`, `model_version` | When Enyo predicted the job. |

Never exported: customer, contact or staff names; phone numbers and emails;
plates, VINs and engine numbers; customer, vehicle, user and record ids; job
numbers. The reader does not select those columns at all, and the unit tests
(`apps/portal/tests/enyo-predict.test.ts`) fail if a column or a value of that
kind appears.

### 9.3 Planned models

| Target | Model | Features |
|---|---|---|
| Which lines (multi-label over line keys seen ≥ 20 times) | One-vs-rest logistic regression on TF-IDF (word 1–2-grams over the same normalised text) + one-hot make/model family + year and mileage bands; then LightGBM multi-label (one binary model per key) on the same features plus the knn neighbours' line frequencies. | `complaint_text`, vehicle columns, `kind`, branch. |
| Quantity per predicted line | Median of neighbours (as now) unless a per-key Poisson GBM beats it. | As above. |
| Labour amount | Quantile GBM (LightGBM, quantiles 0.25 / 0.5 / 0.75) on the same features + predicted labour keys. | As above, target `labour_total`. |

### 9.4 Evaluation protocol

1. **Time-ordered split.** Train on jobs opened before a cut-off, validate on
   the next month, test on the month after; never a random split (complaint
   wording and prices drift).
2. **Metrics.** Micro and macro precision / recall / F1 over line keys at the
   decision threshold; precision@k for the top suggestions; labour MAE and
   pinball loss in naira; coverage (share of jobs with any suggestion).
3. **Champion / challenger.** The current model (`knn-tfidf-1`) is the
   champion. A challenger replaces it only if, on the same test months, it has
   higher precision at equal or better recall and lower labour MAE — and it
   then runs in SHADOW alongside the champion (its own `modelVersion`) for at
   least four weeks before it is shown to anyone.
4. **Per organisation and branch.** Results are reported per organisation
   (and per branch where there are 200+ jobs); a model that is worse for any
   organisation is not promoted for it.
5. **No leakage.** Features use only what is known when the job is opened
   (complaints, vehicle); nothing from the estimate or later.

