/**
 * Writes docs/KEWALRAM_DEMO.md from the demo people (./people.ts) and the
 * role tour (./tour.ts), so the document can never drift from the accounts
 * or from what the catalogue allows: `npm run demo:tour-doc` writes it and
 * tests/demo-tour.test.ts fails when it is out of date. Pure.
 */
import { DEMO_CUSTOMERS, DEMO_STAFF, DEMO_DOMAIN, type DemoBranch } from './people';
import { DIRECTOR_TOUR, tourFor, type TourLink } from './tour';

const PLACE: Record<DemoBranch, string> = { HQ: 'Headquarters (organisation-wide, no branch)', ISOLO: 'Isolo Branch — the workshop and its store', AFPRINT: 'Afprint Assembly Plant' };
const cell = (s: string) => s.replace(/\|/g, '\\|');
const links = (xs: TourLink[]) => xs.map((x) => `${cell(x.label)} (\`${x.href}\`)`).join('<br>');
const numbered = (xs: TourLink[]) => xs.map((x, i) => `${i + 1}. ${cell(x.label)} (\`${x.href}\`)`).join('<br>');

export function renderTourDoc(): string {
  const out: string[] = [];
  out.push(`# The Kewalram demo — sign in as anyone

The demo organisation (**Kewalram Nigeria**, the one the base seed creates)
has a person for every role on its three places — **Headquarters**
(organisation-wide, no branch), **Isolo Branch** (the after-sales workshop
and its store) and **Afprint Assembly Plant** (kits, the line, quality,
PDI) — plus four customer-portal sign-ins. Pick a row, sign in, and the
portal shows that person's own view: their menu, their dashboard, their
branch and nothing else.

Each row says what that person sees first, **three clicks** that show
their job, and what they **must not** be able to do — try it: the portal
answers *Access denied*.

*Generated from \`apps/portal/lib/demo/people.ts\` and \`lib/demo/tour.ts\`
by \`npm run demo:tour-doc\`. A test fails if this file and those two ever
differ, and checks every "must not" and every click against the
authorization catalogue; \`e2e/demo-tour.spec.ts\` signs in as every person
and proves each one in the browser.*

## The 15-minute tour for the directors

Sign in as each person in turn (every address ends with
\`@${DEMO_DOMAIN}\`; the customer at the portal's *Customer portal* page).

| Minutes | Sign in as | Open | Show |
|---|---|---|---|`);
  for (const s of DIRECTOR_TOUR) out.push(`| ${s.minute} | \`${s.as}\` | \`${s.href}\` | ${cell(s.show)} |`);
  out.push(`
## The password

There is **one password for every demo sign-in**, and it is never written
down anywhere in the code or the documentation. It is whatever
\`DEMO_STAFF_PASSWORD\` is set to in the hosting environment (Vercel →
Settings → Environment Variables → Production), 8 characters or more; the
customer-portal sign-ins use \`DEMO_CUSTOMER_PASSWORD\` when that is set and
the staff password otherwise.

- **Not set:** no demo sign-ins exist at all. Set it and redeploy: the
  production build makes them (\`scripts/db-push-if-vercel.js\`, right after
  the schema). From a terminal: \`npm run demo:people\`.
- **Already made:** a later build changes nothing — not a password, not an
  account an administrator switched off. To set every demo password again
  (for example after the demo), set \`RESET_DEMO_PASSWORDS=yes\` for one
  deploy and remove it; everyone signed in as a demo person is signed out.
- **Only the demo organisation** gets demo people: the one marked
  \`isDemo\` in \`organisations\` (the first run marks the seed's own,
  \`kewalram-nigeria\`, or \`DEMO_ORG_SLUG\`). A demo person found in any
  other organisation is switched off on the next run — never deleted.
- Every address ends with \`@${DEMO_DOMAIN}\`, a name that is never
  routed: nothing is ever emailed to a demo person, and no real colleague
  can collide with one. Employee numbers start with \`DEMO-\`.
- Every run is audited (\`demo.people_loaded\`, with counts).

## The people`);
  for (const b of ['HQ', 'ISOLO', 'AFPRINT'] as const) {
    out.push(`\n### ${PLACE[b]}\n\n| Sign in as | Role · employee no. | First view | Three clicks | Must not |\n|---|---|---|---|---|`);
    for (const s of DEMO_STAFF.filter((x) => x.branch === b)) {
      const t = tourFor(s.email)!;
      const role = `${cell(s.jobTitle)}${s.alsoRoles?.length ? ` (also ${s.alsoRoles.join(', ')})` : ''}${s.dept ? ` · ${s.dept}` : ''} · ${s.employeeId}`;
      const mustNot = t.mustNot.length ? links(t.mustNot) : 'Sees everything read-only; opens no job and approves no money (no page to refuse).';
      out.push(`| \`${s.email}\` — ${cell(s.name)} | ${role} | ${cell(t.firstView)} | ${numbered(t.clicks)} | ${mustNot} |`);
    }
  }
  out.push(`\n### Customer portal\n\n| Sign in as | Who | What to show |\n|---|---|---|`);
  for (const c of DEMO_CUSTOMERS) out.push(`| \`${c.email}\` | ${cell(c.name)}${c.company ? ' (fleet)' : ''} | ${cell(c.show)} |`);
  out.push(`
## What each place proves

- **Headquarters** people have no branch, so the authorization catalogue
  treats them as organisation-wide: they see both branches, read-only
  where their role says so (the Executive, the Administrator), and the
  Finance Officer at Headquarters can look at every branch's money but
  confirm none of it — money stays with the branch that earned it.
- **Isolo** people are fenced to Isolo: a technician sees only the jobs
  assigned to them; the Branch Administrator manages Isolo's people and
  cannot see the plant.
- **Afprint** people are fenced to the plant: a line operator records
  their station's checks and cannot open a job card; the gate is passed by
  quality, never by the person who recorded the check.

The plant demo (DEMO_WALKTHROUGH §13) puts the Afprint people on the line,
in kit receiving, quality and PDI: they are these same accounts.

## Where the records come from

The plant's six weeks (DEMO_WALKTHROUGH §13) and the workshop's six months
(§15) are loaded once by the first production build after
\`DEMO_STAFF_PASSWORD\` is set (\`npm run demo:ensure\`), as of that minute:
customers, vehicles, job cards in every status, services, the store,
warranty and claims, security, scheduling, support, imports and exports,
and the six Afprint-built vehicles sold through Isolo. A later deploy
leaves what people did in the demo alone; \`npm run demo:reset\` starts the
story again from now, removing exactly the demo's own records. The four
customers above each have their story: Adaora's S07 in service today, the
fleet's trucks (one open job card, one ready for collection), the warranty
customer's submitted claim, the Afprint-built NQR with its passport.

## Every day after

The demo does not go stale: each Lagos day adds its own working day —
check-ins this morning, yesterday's estimates written and approved and
waiting for the Manager, visitors, the morning meeting, new support
requests (DEMO_WALKTHROUGH §16). \`DEMO_DAILY_ACTIVITY=off\` stops it. The
platform team reloads the whole story from **IT control room → Demo
organisation**, or from a terminal with \`npm run demo:reset\`.
`);
  return out.join('\n');
}
