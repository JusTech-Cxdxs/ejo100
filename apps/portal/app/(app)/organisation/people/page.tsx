import { listPublicProfiles, type PublicProfileRow } from '@/lib/actions/public-profiles';
import { movePublicProfileFormAction, removePublicProfileFormAction, savePublicProfileFormAction } from '@/lib/actions/public-profiles-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { FilterSelect } from '@/components/FilterSelect';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, PageHeader, SectionCard, StatusChip, SubNav } from '@/components/ui';
import { ORGANISATION_TABS } from '../tabs';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

export const metadata = { title: 'People we publish' };

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

function ProfileForm({ row, areas }: { row?: PublicProfileRow; areas: string[] }) {
  return (
    <form action={savePublicProfileFormAction} className="relative space-y-4">
      <FormPendingOverlay />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${row?.id ?? 'new'}`} className={label}>Full name</label>
          <input id={`name-${row?.id ?? 'new'}`} name="name" required minLength={2} maxLength={100} defaultValue={row?.name ?? ''} className={input} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`title-${row?.id ?? 'new'}`} className={label}>Title</label>
          <input id={`title-${row?.id ?? 'new'}`} name="title" required minLength={2} maxLength={120} defaultValue={row?.title ?? ''} className={input} autoComplete="off" />
        </div>
      </div>
      <div>
        <span className={label}>Part of the business they lead</span>
        <FilterSelect name="area" options={areas.map((a) => ({ value: a, label: a }))} placeholder="Search the businesses and departments…" ariaLabel="Part of the business they lead" defaultValue={row?.area ?? undefined} large />
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">From the organisation&apos;s businesses and departments (Organisation structure). Leave empty for the whole group.</p>
      </div>
      <div>
        <label htmlFor={`bio-${row?.id ?? 'new'}`} className={label}>Short public biography</label>
        <textarea id={`bio-${row?.id ?? 'new'}`} name="bio" rows={3} maxLength={1200} defaultValue={row?.bio ?? ''} className={input} />
        <RefineTextButton targetId={`bio-${row?.id ?? 'new'}`} label="biography" />
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Two or three sentences about their role and background. No phone numbers or email addresses.</p>
      </div>
      <div>
        <label htmlFor={`url-${row?.id ?? 'new'}`} className={label}>Public profile link (optional)</label>
        <input id={`url-${row?.id ?? 'new'}`} name="profileUrl" type="url" inputMode="url" maxLength={300} defaultValue={row?.profileUrl ?? ''} className={input} />
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Their LinkedIn page or their page on the organisation&apos;s website (https://).</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-[var(--ejo-text)]">
        <input type="checkbox" name="isPublic" defaultChecked={row ? row.isPublic : true} className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
        <span>Show on the website and in the customer portal<span className="block text-xs text-[var(--ejo-text-muted)]">Untick to keep them for staff only: Enyo in the portal still knows them.</span></span>
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton label={row ? 'Save changes' : 'Add person'} pendingLabel="Saving…" />
        {row ? <LoadingLink href="/organisation/people" className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</LoadingLink> : null}
      </div>
    </form>
  );
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; edit?: string; add?: string }> }) {
  const { error, status, edit, add } = await searchParams;
  const { rows, areas } = await listPublicProfiles();
  const editing = edit ? rows.find((r) => r.id === edit) : undefined;
  const done: Record<string, string> = { added: 'Person added.', saved: 'Changes saved.', removed: 'Person removed from the list.' };
  const shown = rows.filter((r) => r.isPublic).length;

  return (
    <div className="space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="users"
        title="People we publish"
        description="The organisation's leadership and other people it introduces publicly. Enyo answers “who is …” questions from this list: on the website and in the customer portal for people shown publicly, and in the staff portal for everyone here."
      />
      <SubNav tabs={ORGANISATION_TABS} active="/organisation/people" label="Organisation" />

      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      {status && done[status] ? <FormFeedbackBanner kind="success" message={done[status]!} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard
          icon="users"
          title={`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
          description={rows.length ? `${shown} shown publicly · ${rows.length - shown} for staff only` : 'Nobody published yet'}
          flush
        >
          {rows.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {rows.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-5" data-testid={`person-${r.id}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-sm font-semibold text-[var(--ejo-primary)]" aria-hidden>
                    {r.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]">
                      {r.name}
                      <StatusChip tone={r.isPublic ? 'success' : 'neutral'} label={r.isPublic ? 'Public' : 'Staff only'} />
                    </p>
                    <p className="text-sm text-[var(--ejo-text-muted)]">{r.title}{r.area ? ` · ${r.area}` : ''}</p>
                    {r.bio ? <p className="mt-1 line-clamp-3 text-xs text-[var(--ejo-text-muted)]">{r.bio}</p> : null}
                    {r.profileUrl ? <a href={r.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="globe" size={12} />Public profile</a> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <form action={movePublicProfileFormAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="direction" value="up" /><button type="submit" disabled={i === 0} aria-label={`Move ${r.name} up`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs disabled:opacity-40">↑</button></form>
                    <form action={movePublicProfileFormAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="direction" value="down" /><button type="submit" disabled={i === rows.length - 1} aria-label={`Move ${r.name} down`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs disabled:opacity-40">↓</button></form>
                    <LoadingLink href={`/organisation/people?edit=${r.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--ejo-bg)]">Edit</LoadingLink>
                    <form action={removePublicProfileFormAction}><input type="hidden" name="id" value={r.id} /><ConfirmDeleteButton confirmMessage={`Remove ${r.name} from the list? Enyo will stop answering questions about them.`} label="Remove" pendingLabel="Removing…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-danger)]/40 px-2.5 py-1 text-xs font-medium text-[var(--ejo-danger)] hover:bg-[var(--ejo-danger)]/10" /></form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4"><EmptyState icon="users" title="Nobody is published yet">Add the organisation&apos;s leadership (directors, general managers, heads of department) so Enyo can introduce them. Without a list, Enyo can only search the public web.</EmptyState></div>
          )}
        </SectionCard>

        <SectionCard icon={editing ? 'user' : 'plus'} title={editing ? `Edit ${editing.name}` : 'Add a person'} description={editing ? 'Changes reach Enyo straight away.' : 'Name, title and the part of the business they lead.'} id="person-form">
          {editing ? <ProfileForm row={editing} areas={areas} /> : <ProfileForm key={add ? 'again' : 'new'} areas={areas} />}
          <div className="mt-5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-xs text-[var(--ejo-text-muted)]">
            <p className="font-medium text-[var(--ejo-text)]">Privacy</p>
            <p className="mt-1">Only professional, public details belong here. Enyo never gives out anyone&apos;s personal phone number, email or address, and for anyone not on this list it only repeats what public sources say about their professional role.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
