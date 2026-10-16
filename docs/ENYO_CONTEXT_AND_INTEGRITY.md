# Enyo knows who is writing, checks itself, watches for risk, and learns how work is decided (v37)

This release does five things:

1. **Context-aware support.** Enyo recognises who wrote to the Support centre and answers from that person's own records, with a link to the exact page.
2. **Get help for colleagues.** Staff have their own help desk.
3. **Checking Enyo's replies.** People review what Enyo sent, and the review feeds back into learning.
4. **The integrity watch.** Checks for fraud and unusual activity, plus a Speak up channel.
5. **Learning how decisions are made.** Enyo learns from approvals and send-backs, including a trained decision model.

It also records staff sign-ins and failed sign-ins, fixes the customer email links, and lets Enyo draft emails in each person's own voice.

Database changes are additive only (schema v37). Deploys apply them with `prisma db push`. No new scheduler SQL is needed: the integrity checks run inside the existing Support centre run.

---

## 1. Who is writing — and answering from their own records

Code: `lib/support/context-core.ts` (pure, tested) and `lib/support/context.ts`.

### Recognising the sender

Every support request is matched to a person by the ticket's customer, or by the sender's address within the organisation:

| The sender is | What the colleague sees | What Enyo may use |
| --- | --- | --- |
| A **registered customer** | Portal access, and why it was switched off (the reason, when, and who switched it off). Password set or not, last sign-in, failed sign-ins this week. Open and recent Job Cards, services, warranties and claims, in the customer portal's own words. Recent website errors. | The records and their links, only when the sender is **proven** (see below). |
| A **colleague** | Roles, branch and department. Active or deactivated, and why. Last sign-in and failed sign-ins. Errors in the last 7 days, linked to the error log. Pages they were refused. What they do most. The how-to guides that fit their question **and their own permissions**. | All of the above when it is their own request, except the reasons. |
| **Both** (a colleague who is also a customer) | Both pictures, side by side. | Enyo answers as a customer about their own vehicle, and as a colleague about their work. Their own jobs are watched for conflicts of interest (see section 4). |
| **Unknown** | "Not registered with us". | General answers only. |

### Proven senders

A sender counts as proven only in these cases:

- they are signed in to the customer portal;
- it is a colleague's own Get help request;
- it is an email that the receiving server proved (DMARC, or SPF + DKIM aligned) **and** that comes from exactly the address on file.

For anyone else, Enyo is told not to confirm whether an account or record exists. It may point them to sign-in, "Forgot password" and the help page.

### Never shown to the model

Internal reasons never reach the model, for example why access was switched off or why a colleague was deactivated. Colleagues see them on the request.

### "I can't log in"

`customerLoginDiagnosis` and `staffLoginDiagnosis` work out which of these applies, and the answer follows from it:

| Diagnosis | Who handles it |
| --- | --- |
| No account | A person (Enyo hands over) |
| Access switched off | A person (Enyo hands over) |
| Deactivated (staff) | A person (Enyo hands over) |
| Never set a password | Enyo can answer, with the link |
| Several failed attempts (probably a forgotten password) | Enyo can answer, with the link |
| Never signed in | Enyo can answer, with the link |
| All fine | Enyo can answer, with the link |

Failed sign-ins are now recorded:

- `user.sign_in_failed` (staff) and `customer.sign_in_failed` (registered customers only), with the reason code, address and browser. The password is never recorded.
- Staff sign-ins write `user.signed_in` and stamp `lastLoginAt`, without touching the data journal.

### When Enyo may answer by itself from records

These are the rules in `recordsReadyFor` and `aiDecision`:

- **Topics:** Job status, signing in, warranty, how-to and booking.
- **The sender must be proven, and there must be something to answer from.** That means records, a sign-in diagnosis, or a guide.
- **Never by itself:** money, complaints, safety, legal matters, upset customers, "talk to a person", and anything only a person can decide (access off, deactivated, no account).
- **Confidence:** answers from records are capped at 0.9.

### Links

Every solution comes with the link to the exact page.

- **Customers.** Built by `lib/customer-links-core.ts`:
  - `/customer-portal/dashboard/services/jc/<id>` (Job Card)
  - `/customer-portal/dashboard/services/vs/<id>` (service)
  - `/customer-portal/dashboard/warranties/<id>` (warranty)
  - payments, profile (password), support, forgot password and help.

  Signed-out customers sign in first and land on the page.
- **Staff.** Portal pages, the guide pages, profile (password), Get help and forgot password.

Checks on the links and numbers in Enyo's reply:

- A link to our own sites must be **exactly** one Enyo was given (`unknownSpecifics`). A made-up path is caught, and the reply goes to a person.
- Every record number in the reply must appear in the facts. A wrong number sends the reply to a person.
- Customer emails used to point at dashboard anchors (`#jobcard-…`) that did not exist. Every one now uses the exact page.

### What the colleague sees and what is recorded

- **"Who is writing" card** on each request: whether the sender is proven, the sign-in story, records with their staff page, and a **Copy their portal link** button. For a colleague, it also shows errors, refused pages and guides.
- **Recorded on every Enyo reply:** confidence, model, the approved answers used, and the context snapshot (kind, proven, the record numbers and the reasons). The message text is never put there.

---

## 2. Get help (`/support/help`)

Every colleague has **Get help** in the menu.

**Raising a request**

- They say what is wrong and choose who should help: **our administrators** (access, how-to, a record), or **the EJO platform team** (a fault in the system).
- Error screens carry an **Ask for help with this error** link. The reference and the page are filled in.

**Where it goes**

- The request opens in the organisation's **Staff help** team (queue kind `internal`, created on first use).
- Enyo reads it with the colleague's role, recent errors and matching guides, then answers or drafts.
- Replies reach the colleague by email and in the bell, linked to their own help page. That page has **Yes, this solved it** and **I still need a person**.
- The email buttons only open the page. One press there confirms; a link alone never changes anything.

**Privacy (`staffHelpFence`)**

- Only the colleague, the members of the team the request is in, and support managers (`support.manage`) see a help request.
- Answers from help requests are learned for colleagues (channel `STAFF`), never for customers.
- Not available during an assisted session.

**The platform team** sees every organisation's requests. Typing `platform` in the Support centre search lists the ones meant for them.

---

## 3. Checking Enyo's replies (`/crm/support/enyo`)

This page is for everyone who answers support. It lists everything Enyo sent by itself and every draft it wrote. Each one shows:

- the sender's message;
- Enyo's reply;
- how sure it was;
- whether the sender was proven, and which records Enyo was given;
- why it handed over.

**Tabs:** To check (every answer Enyo sent by itself), Sent by Enyo, Drafts, Checked, Wrong or escalated.

**Checking a reply**

- Choose **Good**, **Needed a correction** (write the right answer) or **Wrong**, with a reason.
- Reasons: knowledge gap, wrong facts, missing records, wrong link, should have handed over, handed over needlessly, tone, language, policy.
- A correction to a general question becomes a **PENDING** answer on the Enyo learning page. Names and contacts are removed; record-specific answers are never learned. An administrator approves it before Enyo uses it.

**Drafts are checked by being used.** When a colleague replies, the latest draft is marked automatically:

- **Sent as written** (≥ 80% word overlap);
- **Edited**;
- **Not used**.

**Measures:** answered by Enyo, share checked, right when checked, drafts used, customer said it solved it, still needed a person.

**Why Enyo could not resolve them.** Hand-overs and corrections are grouped by topic and reason, biggest first. Each group says what to fix, with a link — usually an answer to approve. It might also be the organisation's contact details, Enyo's connection, or a reminder to customers to write from the address on file. Money, safety, complaints and "talk to a person" are counted separately as rightly handled by a person; they are not gaps.

---

## 4. The integrity watch (`/integrity`) and Speak up (`/support/speak-up`)

Code: `lib/integrity/core.ts` (pure, tested), `lib/integrity/scan.ts` and `lib/actions/integrity.ts`. The new permission `integrity.review` belongs to administrators by default.

**Checks** (each one records the amounts and record numbers, never message text):

| Area | Check |
| --- | --- |
| People | Same person asked and approved (parts slip at HOD or store, outside purchase at finance review, manager approval or payout, cancellation, warranty claim). Unusual activity spike. Colleague handling their own vehicle (payments, refunds or approvals on a job where they are the customer). |
| Money | Refunds above what was paid. A refund within 24 h of a cash payment. A refund paid to a different name. Money recorded out of hours. Branch bank details changed. Payment amounts against Benford's law (first digit, Nigrini's MAD bands, only with ≥ 1,000 payments in a year). |
| Parts & purchases | Purchases split into smaller ones: ≥ 3 by one person within 48 h, each below the usual largest (the 90th percentile) and together above it. Paid out more than approved. |
| Warranty | Repeat claims on one vehicle within 90 days. Failure in the last 14 days of cover. Claim approved by its own author. |
| Gate | Vehicle left with its Job Card or service not closed. Exit out of hours. |
| Access | ≥ 10 failed sign-ins on one account in a day. Administrator role given. |

**Statistics.** Spikes use the modified z-score, 0.6745 × (x − median) / MAD, against the person's own last 60 days, with |M| > 3.5 counting as unusual (Iglewicz & Hoaglin). This only runs when there are ≥ 5 actions in a day and ≥ 10 active days of history. Out of hours follows the organisation's opening hours and holidays (Settings → Support), with an hour's grace either side.

**Alerts**

- Each finding is one alert per check and record (a fingerprint). Later scans only update "last seen" and keep the review.
- Severity comes from the amount and the check.
- Reviewing:
  - **New** → **Being looked at** → **Confirmed — action taken** or **Dismissed — nothing wrong**.
  - Confirming or dismissing needs a written finding.
  - Reviews are compare-and-set, so two reviewers never overwrite each other.
  - Every step is in the alert's history.
- **Nobody sees or decides an alert about themselves.** It goes to the other reviewers.
- Alerts are hidden from the activity feed and never shown to the person they are about. Reviewers see **N new integrity alerts** among their dashboard steps.

**Speak up.** Any colleague can raise a concern and name a colleague (optional).

- They may stay **anonymous**. Then nothing records who raised it: no reporter on the alert, no person on the audit entry, and the data journal does not record alerts.
- The person named never sees it and cannot review it.
- If the only reviewer is the person named, ask the platform team to add another reviewer.

**When the checks run**

- Daily between 1 and 5 am Lagos time, with the Support centre run (job `integrity-scan` on the Settings page).
- On demand with **Run the checks now** (at most every 10 minutes).

**A flag is a reason to look, never proof.** Nothing is decided automatically about anyone (NDPA 2023 s.37). Enyo's `integrity_alerts` tool says the same. `audit_trail` lets people with `audit.view` ask "who approved EP-…?". Neither tool works during an assisted session.

---

## 5. How work flows and the decision model

### How work flows (`/analytics/workflows`, needs `analytics.business.view`)

The decision log is read from the records themselves (`lib/insights/decisions*.ts`). It covers every approval step:

- parts slip: HOD and store;
- outside purchase: finance and manager;
- Job Card and service approval;
- cancellation;
- estimate manager approval, including "returned for changes";
- warranty provider decision.

For each step it shows:

- the number of decisions and the share sent back;
- the usual and slowest-tenth waits;
- **why things are sent back** (grouped reasons);
- **who decides** and **who asks**, by role, with send-back rates;
- **what Enyo could do**:
  - *prepare these* (≥ 200 decisions, ≤ 5% sent back, waiting ≥ 4 h: a one-press approval, suggested first);
  - *check them first* (≥ 20% sent back: check requests for the top reason before they are sent);
  - *watching*, or *still learning*.

Nothing here approves anything. This is the groundwork for the automation ladder: each role's decisions, reasons and timing are recorded now, so that suggestions, then partial automation (e.g. covering for someone on leave), can later be measured against how that role actually decides. Each step needs a person's switch.

### The decision model (`DECISION_RISK`, `ml/ejo_ml/tasks/decisions.py`)

| | |
| --- | --- |
| Task | How likely a request is to be sent back at its step |
| Features (known when the request arrives) | Step, requester's role, log amount, lines, Lagos hour, weekday. Never the decider, the wait or the reason. |
| Algorithm | LightGBM binary: 7 leaves, learning rate 0.05, min 30 rows per leaf, row and column subsampling 0.8, L2 = 1, early stopping on the validation period. Then **isotonic calibration** on the validation period. |
| Split | Time-ordered: 65% train, 15% validation, 20% test (newest) |
| Baseline | Everyone gets the training period's send-back rate |
| Gate | ≥ 300 decisions, ≥ 30 send-backs, both outcomes in test, AUC ≥ 0.65, Brier ≥ 3% better than the baseline |

- **Dataset** (`/api/ml/datasets/decisions`): roles, amounts and times only. The row id is a one-way hash, so there are no names, ids, numbers or reasons.
- **Parity:** the portal's `decisionRisk` (trees + interpolation) matches the trainer to 1e-9 on the fixture `ml/fixtures/decision_risk.json`.
- **Where it shows:** the model's quality appears on "How work flows" and `/enyo/models`. It is not yet shown on requests; that is the next step, and it starts in Shadow.

---

## 6. Writing in your own voice

Mail is learned only with the person's mail consent and only for their own drafts.

- **What is kept:** emails a person sends from the portal, when they have allowed Enyo to read their mail. Only what they wrote is kept; quoted earlier messages are dropped. The limit is 90 days and 200 per person (`MailStyleSample`).
- **How Enyo uses it:** the `my_writing_examples` tool gives Enyo their most similar past emails before `draft_mail_reply`. Enyo copies their greeting, sign-off and layout, never the facts. The draft opens for them to check and send.
- **Removal and use:** samples are removed when consent is withdrawn or the mailbox is disconnected, and after 90 days. They are never shared and never used for training.

**Later (with the organisation's agreement):** importing years of customer-care and workflow email, cleaned and de-identified, for learning. This needs a data-processing agreement and a separate import pipeline. It is not part of this release.

---

## Checks

The behaviour above is covered by these tests (in addition to the coverage lists for guards, tenant fences, compare-and-set, the data inventory and the audit journal):

| Test file | What it covers |
| --- | --- |
| `apps/portal/tests/context-integrity.test.ts` | Links, sender recognition, the sign-in diagnosis, what the model gets, record answers, the link/number checks, the help fence, checking Enyo, integrity statistics and self-review, writing samples, the decision picture and features |
| `apps/portal/tests/enyo-ml.test.ts` | Decision model parity and validation |
| `ml/tests/test_pipeline.py` | The decision model learns, is calibrated and waits for enough data |
