import { guardAnyPage } from '@/lib/authz/server';
import { listPeopleOut } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { durationText, exitPassOverdueMinutes } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { PageHeader } from '@/components/ui';

export default async function PeopleOutPage() {
  await guardAnyPage(['security.view'], '/security/people-out');
  const rows = await listPeopleOut();
  const now = new Date();
  const people = rows.reduce((s, p) => s + p.people.length, 0);
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="walk"
        title="People out on exit passes"
        description={<>{pluralize(people, 'person', 'people')} out on {pluralize(rows.length, 'pass', 'passes')}.</>}
      />
      <SecurityNav active="/security" />
      <SecurityTable headers={['Pass', 'People', 'Reason', 'Time out', 'Expected back', 'Status', '']} widths={['12%', '22%', '20%', '12%', '12%', '15%', '7%']} empty={rows.length ? null : 'Nobody is out on an exit pass.'}>
        {rows.map((p) => {
          const over = exitPassOverdueMinutes(p, now);
          return (
            <tr key={p.id}>
              <td className="font-medium">{p.passNumber}</td>
              <td>{p.people.map((x, i) => <span key={i} className="block">{x.name}{x.department ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {x.department}</span> : null}</span>)}</td>
              <td className="text-xs">{p.reason}</td>
              <td className="text-xs">{p.gateOutAt ? formatDateTimeCompact(p.gateOutAt) : '—'}</td>
              <td className="text-xs">{p.returning ? (p.expectedReturnAt ? formatDateTimeCompact(p.expectedReturnAt) : '—') : 'Not returning'}</td>
              <td className={`text-xs font-medium ${over > 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>{over > 0 ? `Late by ${durationText(over)}` : 'On time'}</td>
              <td><LoadingLink href={`/security/exit-passes/${p.id}`} className="text-xs text-[var(--ejo-primary)] hover:underline">Open</LoadingLink></td>
            </tr>
          );
        })}
      </SecurityTable>
    </div>
  );
}
