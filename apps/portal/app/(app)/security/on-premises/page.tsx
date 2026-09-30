import { listOnPremises } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { VEHICLE_TYPE_LABEL, durationText, visitOverdueMinutes } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

export default async function OnPremisesPage() {
  const rows = await listOnPremises();
  const now = new Date();
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Visitors on the premises</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">{pluralize(rows.reduce((n, v) => n + v.partySize, 0), 'person', 'people')} on {pluralize(rows.length, 'pass', 'passes')} — checked in and not yet out.</p>
      <SecurityNav active="/security" />
      <SecurityTable headers={['Pass', 'Visitor', 'Visiting', 'Came by', 'Time in', 'Stay', 'Reception', '']} widths={['12%', '18%', '14%', '13%', '12%', '14%', '10%', '7%']} empty={rows.length ? null : 'No visitors on the premises.'}>
        {rows.map((v) => {
          const over = visitOverdueMinutes(v, now);
          const left = v.checkedInAt ? v.expectedDurationMinutes - Math.floor((now.getTime() - new Date(v.checkedInAt).getTime()) / 60000) : null;
          return (
            <tr key={v.id}>
              <td className="font-medium">{v.passNumber}</td>
              <td><span className="font-medium text-[var(--ejo-text)]">{v.visitorName}</span>{v.partySize > 1 ? <span className="block text-xs text-[var(--ejo-text-muted)]">+ {v.memberNames.join(', ')}</span> : null}{v.company ? <span className="block text-xs text-[var(--ejo-text-muted)]">{v.company}</span> : null}<span className="block text-xs text-[var(--ejo-text-muted)]">{v.purpose}</span></td>
              <td>{v.host.fullName}</td>
              <td>{v.vehicleType === 'ON_FOOT' ? 'On foot' : <>{VEHICLE_TYPE_LABEL[v.vehicleType] ?? 'Vehicle'}<span className="block text-xs font-medium">{v.vehiclePlate}</span></>}</td>
              <td className="text-xs">{v.checkedInAt ? formatDateTimeCompact(v.checkedInAt) : '—'}</td>
              <td className="text-xs">
                {durationText(v.expectedDurationMinutes)}{v.extendedMinutes ? ' (extended)' : ''}
                <span className={`block font-medium ${over > 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>{over > 0 ? `Overdue ${durationText(over)}` : left !== null ? `${durationText(left)} left` : ''}</span>
              </td>
              <td className="text-xs">{v.receivedAt ? 'Received' : <span className="text-[var(--ejo-warning)]">Not yet</span>}</td>
              <td><LoadingLink href={`/security/visitors/${v.id}`} className={`text-xs ${link}`}>Open</LoadingLink></td>
            </tr>
          );
        })}
      </SecurityTable>
    </div>
  );
}
