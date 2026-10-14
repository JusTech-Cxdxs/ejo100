# Enyo 1.0 — Release Notes

**Date:** 14 October 2026 · **Branch:** `platform/enyo-1` · **PR:** #20 → `main`
**Product:** Enyo 1.0, the AI layer of EJO100 by Just Technologies (JusTech)

## What Enyo is

Enyo is the assistant built into EJO100. It answers questions, prepares work for people to confirm, learns the workshop's patterns in shadow mode, and hands customers over to people when it should.

It runs as the person using it. Every lookup goes through the same permission checks as the portal pages, so Enyo can never show anyone more than their role already allows. It never saves, sends, approves or pays anything itself.

## Where it appears

| Place | Who | What Enyo can do |
|---|---|---|
| Staff portal | Every member of staff | Answer "how do I…?" with steps and links (68 guide entries). Show what is waiting for the person, record details, customer profiles and vehicle histories. Look up part prices and stock, takings and revenue, and technician rankings (managers). Watch warranties and services due. Prepare Job Cards, reminders and email replies as drafts. Remember and forget facts the person asks it to |
| Customer portal | Signed-in customers | Their own vehicles, jobs and status, estimates, payments and balance, warranties, how to pay. Hand over to a person (support ticket) |
| Public website | Visitors | Company information (branches, contacts, services, how to book). Hand over for a call-back |
| Mail | Each person, for their own mailbox | Read and send work email inside the portal. With consent, Enyo summarises and sorts each email, links it to ERP records and suggests the next step |
| Reminders | Everyone | Reminders for yourself, or for a colleague who has allowed it. Delivered in the bell and by email |
| Workshop predictions | Supervisors, technicians, managers | Likely estimate lines from similar finished jobs, priced from today's store. Starts in shadow mode (measured, not shown), with a learning page and a training-data export |
| Support inbox | Front desk, managers, administrators | Customer conversations handed over by Enyo, with Enyo's summary, replies by email and in the customer portal |

## Safety, in short

- **Permissions:** 26 tools, each running the module's own authorised code as the signed-in person. A technician asking for takings gets a polite refusal; finance gets the figures.
- **No made-up figures:** money figures come only from tool results. A check flags any amount in an answer that no record contains.
- **Untrusted text:** email, web and customer text is treated as data, never instructions. Enyo's memory changes only when the person's own message asks for it.
- **Drafts never write:** a draft opens the normal page already filled in. The person checks it and presses the normal button.
- **Customer isolation:** customers see only their own records. Another customer's reference looks exactly like one that does not exist.
- **Limits:**
  - Rate limits are counted in the database, so they hold across servers.
  - Message size is capped.
  - One answer may take at most 55 seconds.
  - Every request checks it came from the site itself (cross-site request protection).
- **Mailboxes:**
  - Passwords are encrypted with AES-256-GCM.
  - Connections to private network addresses are refused, and TLS 1.2 or higher is required.
  - Strictly the person's own mailbox: no administrator access, and nothing during assisted sessions.
- **Retention:**
  - Chats are kept 12 months; website chats 90 days; deleted chats 30 days.
  - Stored mail is kept 90 days.
  - Done or cancelled reminders are kept 12 months.
  - Chat history keeps tool outcomes, never their results.
- **Switches:** Settings → Enyo has a master switch and one per feature. With Enyo off, or no model configured, the ERP works exactly as before.

## Owner actions to switch it on

1. **Choose a model.** Any OpenAI-compatible endpoint whose model supports tool calling works:
   - a free hosted tier, for demo data only (check the provider's data terms);
   - the company's own server (Ollama or vLLM);
   - a paid API.
2. **Portal and website, on Vercel:** set `ENYO_LLM_BASE_URL`, `ENYO_LLM_API_KEY` and `ENYO_LLM_MODEL`. Optionally also set `ENYO_LLM_FAST_MODEL` and `ENYO_LLM_PROVIDER_LABEL`.
3. **Portal:** set `MAILBOX_ENCRYPTION_KEY` (`openssl rand -base64 32`).
4. **Website:** set `WEBSITE_ORGANISATION_SLUG` (the organisation's slug) and `ENYO_IP_HASH_KEY` (a long random secret).
5. **Check it works:** in the portal, open Settings → Enyo and press **Test connection**. Leave predictions in **Shadow** until the learning page shows enough checked predictions.

The full list of settings is in `docs/OPERATIONS_CHECKLIST.md` §1 and `.env.example`.

## Verification

- **Unit tests:**
  - Engine: 13 (model client, agent loop, strict tool arguments, money check, streaming protocol, time limit).
  - Portal: 258.
  - Website: 11.
- **Browser tests (CI):** new specs for the staff assistant, panel, customer and public assistants and support inbox, reminders, mailbox, and predictions. They run against a stand-in model server and a real IMAP/SMTP test server.
- **Security checks (CI):**
  - Secret scanning (gitleaks), static analysis (SAST) and a dependency audit.
  - A live scan: every server action tried with a forged session, other organisations' record ids tried against every action, row-level security checked on all tables.
  - Load tests.
- **Independent review:** no P0 or P1 findings. Its 3 P2 and 10 P3 findings were fixed, or are listed below.

## Known limits and next steps

- **Microsoft 365 mailboxes** need "Sign in with Microsoft" (OAuth), planned next. Gmail works with an app password. Zoho and company mail work as they are.
- **Chat rate limits** count before the message is stored, so a burst of parallel requests can slightly exceed them. The 4,000-character cap and the time limit bound the cost.
- **Intermittent "Notification summary failed" log line (E2E-08):** its cause is now visible. A cached sign-in lookup can be reached inside Next.js `after()` work. The bell recovers on its next refresh. The fix is planned with the Next.js 16 upgrade.
- **Voice** uses the browser's own speech services. Open-source speech on the company's server (Whisper, Piper) comes later.
- **The Python training service** for the workshop models comes in the next phase; `docs/AI_READINESS.md` §10 sets it out. Today's prediction model (`knn-tfidf-1`) needs no training and is measured on real outcomes.
