import { prisma } from '@ejo/database';
import { currentAssist, getPrincipal } from '@/lib/authz/server';
import { listAssistSessionsForMe } from '@/lib/actions/assist';
import { AssistSessionList } from '@/components/AssistSessionList';
import { describeAccess, roleLabel } from '@/lib/authz/describe-access';
import { STAFF_RULES } from '@/lib/email-templates/staff-access';
import { Avatar } from '@/components/Avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import Link from 'next/link';
import { EmptyState, PageTitle } from '@/components/ui';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6';
const label = 'text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]';

/** My profile — who I am in the organisation, exactly what I can do, and my own settings. */
export default async function ProfilePage() {
  // A colleague's own account settings are theirs alone, even during an assisted session.
  const assist = await currentAssist();
  if (assist) {
    return (
      <div className="w-full max-w-3xl p-4 sm:p-8">
        <section className={card}>
          <EmptyState icon="lock" title="Not available during an assisted session">
            {assist.subject.name}&apos;s profile, password and settings are only for {assist.subject.name.split(/\s+/)[0]}. End the session to see your own profile.
          </EmptyState>
        </section>
      </div>
    );
  }
  const p = await getPrincipal();
  const heldForMe = await listAssistSessionsForMe().catch(() => []);
  const u = await prisma.user.findUnique({
    where: { id: p.userId },
    select: { fullName: true, email: true, phone: true, employeeId: true, isActive: true, createdAt: true, organisation: { select: { name: true } }, branch: { select: { name: true } }, department: { select: { name: true } }, roles: { select: { role: { select: { name: true, slug: true, isSuperAdmin: true } } } } },
  });
  if (!u) return null;
  const roles = u.roles.map((r: (typeof u.roles)[number]) => (r.role.isSuperAdmin ? 'Platform team (Master Administrator)' : roleLabel(r.role.slug, r.role.name)));
  const access = describeAccess(p).filter((g) => g.lines.length);
  const details: [string, string][] = [
    ['Employee ID', u.employeeId ?? 'Not yet issued — ask your administrator'],
    ['Organisation', u.organisation?.name ?? '—'],
    ['Branch', u.branch?.name ?? 'Organisation-wide'],
    ['Department', u.department?.name ?? '—'],
    ['Email', u.email],
    ['Phone', u.phone ?? '—'],
  ];
  return (
    <div className="w-full max-w-5xl p-4 sm:p-8">
      <section className={`${card} flex flex-wrap items-center gap-5`}>
        <Avatar name={u.fullName} size={72} active={u.isActive} />
        <div className="min-w-0">
          <PageTitle icon="user">{u.fullName}</PageTitle>
          <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{roles.length ? roles.join(' · ') : 'No role yet'}</p>
          <span className="mt-2 inline-flex rounded-full bg-[var(--ejo-success)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--ejo-success)]">Active</span>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">My details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className={label}>{k}</dt><dd className={`mt-0.5 truncate text-sm text-[var(--ejo-text)] ${k === 'Employee ID' && u.employeeId ? 'font-mono font-semibold' : ''}`} title={v}>{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">Something wrong? Your administrator updates these details.</p>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Appearance</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Light, dark, or follow this device. Remembered on this device.</p>
          <div className="mt-4"><ThemeToggle variant="segmented" /></div>
          <h2 className="mt-8 text-sm font-semibold text-[var(--ejo-text)]">Change my password</h2>
          <div className="mt-3"><ChangePasswordForm /></div>
          <h2 className="mt-8 text-sm font-semibold text-[var(--ejo-text)]">Enyo</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">The short facts the assistant keeps about you, which you can delete.</p>
          <Link href="/profile/enyo" className="mt-3 inline-flex min-h-11 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">What Enyo remembers</Link>
        </section>
      </div>

      <section className={`${card} mt-6`}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">What I can do</h2>
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Exactly what the system allows you today — the same rules every page enforces. You are emailed whenever this changes.</p>
        {p.isSuperAdmin ? <p className="mt-4 text-sm text-[var(--ejo-text)]">As a member of the platform team you can see and do everything.</p> : access.length === 0 ? <p className="mt-4 text-sm text-[var(--ejo-text)]">For now you can request your own exit passes. Your administrator will give you a role for your work.</p> : (
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {access.map((g) => (
              <div key={g.module}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-primary)]">{g.module}</p>
                <ul className="mt-2 space-y-1.5">
                  {g.lines.map((l) => (
                    <li key={l.key} className="text-sm text-[var(--ejo-text)]">{l.label}{l.where ? <span className="text-[var(--ejo-text-muted)]"> — {l.where}</span> : null}{l.added ? <span className="ml-1 rounded-full bg-[var(--ejo-warning)]/15 px-1.5 text-[10px] text-[var(--ejo-warning)]">added</span> : null}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {heldForMe.length ? (
        <section id="assisted" className={`${card} mt-6`}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Sessions held for me</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Times a Branch Assistant worked on your behalf, after you typed your password. Everything they did is in the records under your name, with theirs beside it.</p>
          <div className="mt-2"><AssistSessionList rows={heldForMe} show="colleague" /></div>
        </section>
      ) : null}

      <section className={`${card} mt-6`}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">The rules</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--ejo-text)]">
          {STAFF_RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>
    </div>
  );
}
