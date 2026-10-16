# Support centre (v36, extended in v37 and v38)

> v38 adds: set-up split into pages (Overview · Teams & addresses · one page per team · Hours & holidays · Enyo’s part · Follow-ups), Nigerian public holidays worked out automatically every year (fixed dates, Easter, the Islamic holidays estimated from the Hijri calendar beyond the published table, and the usual next weekday off when a fixed holiday falls on a weekend — all overridable), the **Customer care** and **Customer care lead** roles (work requests, never the set-up), complaints and HR questions routed to the matching team (kinds `customer_care` and `hr`), customers opening requests and complaints themselves in the customer portal, and hand-overs that are never lost (an older database is written the older way; if the save fails the team is emailed the details).

> v37 adds: who is writing (customer, colleague or both) and answers from proven senders' own records with exact links, the colleagues' Get help desk, and checking Enyo's replies with the gap report — see [ENYO_CONTEXT_AND_INTEGRITY.md](ENYO_CONTEXT_AND_INTEGRITY.md).

One place for every customer support request: emails to the support
addresses (support@, warranty@, technical@, customercare@ …), hand-overs from
Enyo in the website and customer-portal chat, and calls or walk-ins a
colleague logs. Staff work it at **Customers → Support centre**
(`/crm/support`); administrators set it up at **Settings → Support centre
set-up** (`/settings/support`).

## How a request flows

```
email to warranty@ ─┐                       ┌─ acknowledgement (reference, team, promised time)
chat hand-over ─────┼─► ticket SUP-2026-…  ─┤
logged call ────────┘   team · priority ·   ├─ Enyo reads it (topic, urgency, mood, summary)
                        targets · owner     │    ├─ AUTO team + general + sure → answers (labelled AI,
                                            │    │    “Yes, solved” / “I still need a person”)
                                            │    └─ otherwise → draft for a colleague + “why a person”
                                            ├─ colleague replies (same email thread, team's address),
                                            │    notes, priority, team, on hold, resolved
                                            ├─ waiting on customer → reminders (48 h, 96 h) → resolved (7 d)
                                            └─ resolved → “How did we do?” (4 h) → closed (4 d)
```

## Teams (queues) and addresses

* Each team has a kind (general, warranty, technical, customer care, parts,
  sales, staff help, HR & people), optional branch, targets per priority, a signature, whether to send
  an acknowledgement, and Enyo's part:
  * **People only** — Enyo stays out.
  * **Enyo drafts, people send** — default.
  * **Enyo answers general questions** — Enyo sends a reply by itself only when
    every rule allows it (below).
* Each address is a shared mailbox connected with an app password, encrypted
  with `MAILBOX_ENCRYPTION_KEY` (AES-256-GCM, bound to the organisation and the
  address). It is read **read-only** every 3 minutes; replies are sent from it
  so customers' answers come back to it.
* Colleagues on a team share new requests: the least busy person who is not
  away and under their capacity gets the next one.

## Who picks requests up

* **Customer care** (role `customer-care`, branch) and **Customer care lead**
  (`customer-care-lead`, whole organisation) work the Support centre; they do
  not see the set-up. Receptionists, workshop managers and branch
  administrators can also work it.
* An administrator ticks who works each team (Settings → Support centre →
  Teams → the team → Who works it). New requests go to the least busy person
  there who is not away.
* **Customers**: email, the website chat (Enyo hands over with their consent),
  the customer-portal chat, or *Help & support → Ask a question or make a
  complaint* in the portal. A complaint goes to the Customer care team.
* **Colleagues**: *Help centre → Ask a person* in the portal. "What is it
  about?" decides the team: using the portal → Staff help (administrators);
  an error → the EJO platform team; a complaint → Customer care; HR & people →
  the HR team (a team of kind *HR & people*, worked by HR staff given the
  Customer care role), or Staff help when there is none. Requests stay
  private to the person, that team and support managers. Wrongdoing goes to
  *Speak up* (Integrity watch) instead.

## Rules that keep it safe

* **Mail loops (RFC 3834):** bounces and our own addresses are dropped;
  auto-replies, mailing lists, bulk mail and robot senders are kept but never
  answered automatically; a sender writing more than 20 times an hour gets no
  automatic replies; at most 3 acknowledgements per sender per day. Every
  automatic email carries `Auto-Submitted: auto-replied`.
* **Threading:** `[#SUP-…]` in the subject, or the Message-IDs it answers —
  and only when the sender is that ticket's customer, so a copied reference
  can never put one customer's mail on another's ticket. A reply to a closed
  ticket opens a follow-up.
* **Exactly once:** each email has an intake key (mailbox + Message-ID); a
  mailbox is read by one run at a time.
* **Enyo answers by itself only when:** the team allows it, the sender's
  address is proven (DMARC, or SPF and DKIM — a forged sender never gets an AI
  reply), the question is general (needs nobody's records), nothing sensitive is said (law, money
  disputes, safety, complaints, “a person please”), the mood is not negative,
  an approved source was found, it is at least as sure as the organisation
  set (default 75%), and the customer has not already come back. Anything
  else becomes a draft and the reasons are shown on the ticket. A reply that
  names a link, phone number or email that is not in the organisation's own
  details is never sent by itself. The answer is claimed before it is sent, so
  a colleague who replied a moment earlier is never contradicted.
* **Identity:** “verified” only when the customer is signed in, a colleague
  picked their file, or their email passed DMARC and matches their file.
  Colleagues are told to check before discussing records or money.
* **The customer never sees** internal notes, Enyo's drafts or staff names
  (only the signature a team chooses).
* **The customer's page** (`/support/request/<token>` on the website) shows
  only the reference, subject and status; nothing changes until a button is
  pressed (email scanners that open links change nothing).
* **Prompt injection:** every email is wrapped as untrusted data; Enyo never
  decides what is sent — code does, from the rules above.

## Numbers (`/crm/support/analytics`)

First answer (median and 90th percentile), resolution time, first-answer
target met, share resolved by Enyo (confirmed by the customer, or no further
question within 3 days), why people were needed, reopen rate, satisfaction
(4–5 out of 5), backlog by age, channels, topics, teams and — for
administrators — each colleague.

## Learning

When a colleague resolves a general question, the question and their answer
(names, phones, emails, plates and links removed) become a candidate for
Enyo; an administrator approves it on the Enyo learning page before Enyo
uses it. Answers about one customer's records are never learned.

## Running it

* Apply `scripts/v36-support-scheduler.sql` in Supabase (after the v25
  scheduler): `/api/cron/support` every 3 minutes (mail in, targets,
  reminders, closing, surveys) and `/api/cron/support?step=enyo` every 2
  minutes (Enyo reads new requests; each is held by one run, and released
  after 10 minutes if a run is stopped).
* `MAILBOX_ENCRYPTION_KEY` must be set to connect addresses (chat hand-overs
  and logged calls work without it).
* Enyo's parts need `ENYO_LLM_*` and “Customer assistant” switched on in
  Settings → Enyo.
* Microsoft 365 / Outlook mailboxes: OAuth sign-in comes next; until then use
  an app password where the tenant allows IMAP/SMTP.
