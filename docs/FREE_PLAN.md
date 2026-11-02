# Running EJO on free plans

EJO runs on three free hosting plans, plus one free AI plan, while it is
demonstrated and piloted:

| Piece | Host and plan | Used for |
|---|---|---|
| Portal and website | **Vercel Hobby** (region `fra1`, Frankfurt) | every page, server action, export and scheduled job |
| Database | **Supabase Free** (EU Central 1, Frankfurt) | all data, the pooled connection, instant notifications (Realtime) |
| API | **Render Free** (Oregon) | pushes the schema on each deploy; nothing in the portal calls it while people work |
| Enyo's language model | **Groq free tier** | the assistants |

This page lists what each plan allows, what EJO does to stay inside those
limits, and when to move to a paid plan. The figures were checked on
1 November 2026. Plans change, so check the providers' pages before you
sign anything.

## What each plan allows, and how EJO fits

### Vercel Hobby

| Limit | Hobby | EJO |
|---|---|---|
| Function time | 300 s (fluid compute; 60 s on an older project without it) | No function asks for more than 60 s. Imports check and load in ~2.5 s steps. Each export part stops cleanly after about 40 s, and the next part carries on. A unit test fails if any route asks for more than 300 s. |
| Request body | 4.5 MB (and Next.js refuses a server action over 1 MB) | Uploads are read in the browser and sent in blocks of at most ~700 KB, **measured in bytes**. Chinese or Arabic part descriptions take 3 bytes a character, and the blocks are sized for that. |
| Response body | 4.5 MB, except for streamed responses | Exports and import reports are streamed, so they are not capped. |
| Scheduled jobs | 100, **at most once a day**, ±59 minutes | Two daily jobs (07:00 and 06:00 UTC, weekdays for the second). A test fails if a schedule runs more often than daily. |
| Function calls | 1,000,000 a month | An open, visible tab asks "anything new?" every 10 s while someone is working. It asks once a minute when it has been idle 5 minutes, or when instant notifications are connected, and never while hidden. **Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`**: with instant notifications connected, the regular check drops to once a minute, about 6 times fewer calls. |
| CPU | 4 hours of active CPU a month | Enough for a demo and a small pilot. Large imports and exports use the most. |
| Use | **Personal, non-commercial only** | See [When to move to paid plans](#when-to-move-to-paid-plans). |

### Supabase Free

| Limit | Free | EJO |
|---|---|---|
| Database size | **500 MB**. Past it the database turns read-only and nothing can be saved. | Shown under **Data Exchange → Database space**. An import that would take the database past 95% is refused before it is sent for approval, approved or started. A load that reaches 97% **pauses**; press **Resume** once there is room. An upload is refused while the database is nearly full. Administrators get a dashboard notice at 80%. |
| Inactivity | Paused after 1 week with no activity | The daily scheduled job reads and writes the database every day, which keeps it active. If Vercel's jobs are switched off, open the portal at least weekly. |
| Backups | **None included** | Take your own weekly copy: `pg_dump "$DIRECT_URL" -Fc -f ejo-YYYY-MM-DD.dump`, stored off the server. |
| Egress | 5 GB a month | Page loads read little. A full export of a large list is the biggest read: a 300,000-part export is about 60 MB. |
| Realtime | 200 connections, 2 million messages a month | One connection per open tab, plus one short message per change. |
| Connections | Pooler on port 6543 | `DATABASE_URL` uses the pooler (`pgbouncer=true`). Each server instance keeps up to 10 connections (`PRISMA_CONNECTION_LIMIT`). |

**What fills the database.** These are measured on Postgres 16:

| Loaded | Space |
|---|---|
| One part (SAP material) | about **1.7 KB**: 0.7 KB the part, 1.0 KB its audit-trail entry |
| 50,000 parts (the demo file) | about **85 MB**, plus about 20 MB of staged file until it is released |
| 800,000 parts (Kewalram's material master) | about **1.3 GB**, which does **not** fit in 500 MB |

The audit trail is append-only: it can never be deleted, by design. The
space taken by loading records never comes back, even after an undo. Staged
files do come back: they are released 30 days after an import finishes
(Data Exchange → *Space used by staged files*).

The Database space card shows roughly how many more parts, customers or
opening-stock lines fit. The figures per record are in
`apps/portal/lib/database-space-core.ts`.

**Another plan or another database:** set `DATABASE_SPACE_LIMIT_MB` to the
new plan's size. On Supabase Pro that is the disk size you choose, 8 GB
included. Set it to `0` where there is no practical limit; the checks then
switch off.

### Render Free

| Limit | Free | EJO |
|---|---|---|
| Sleep | After 15 minutes with no requests; about a minute to wake | Nobody waits on it: the portal and website talk to the database directly. |
| Build minutes | 500 a month (shared) | One build per merge to `main`, which pushes the schema. If the minutes run out, the schema waits. Run the SQL from `scripts/predeploy/` and `scripts/postdeploy/` in the Supabase SQL editor, the same files the build runs. |
| Hours | 750 a month | One service. |

### Groq free tier

The free tier allows a limited number of requests and tokens a minute and a
day. Enyo waits and retries when Groq asks it to. Past that, the person
sees *"Too many questions in a short time. Please wait a minute and ask
again."* Each person is also limited to 20 questions a minute
(`ENYO_REQUESTS_PER_MINUTE`). Without a key, everything except Enyo works.

## When to move to paid plans

| Trigger | Move |
|---|---|
| A client uses EJO for its business, or you are paid to build or host it | **Vercel Pro**. Hobby's terms forbid any commercial use, including "receiving payment to create, update, or host the site". Supabase, Render and Groq's free plans have no such rule. |
| The database passes about 400 MB, or a real material master is to be loaded | **Supabase Pro** (8 GB included, daily backups), then set `DATABASE_SPACE_LIMIT_MB=8192` |
| More than ~10 people use it all day | Vercel Pro, for function calls and CPU |
| Enyo is used by many people at once | A paid model plan, or the organisation's own model server (any OpenAI-compatible address) |

Nothing in the code changes when moving plans. Only the settings above
change.
