import type { BinOffer } from '@/lib/actions/recycle-bin';
import type { BinEntity } from '@/lib/recycle-bin/rules';
import { REASON_MAX, REASON_MIN } from '@/lib/recycle-bin/rules';
import { moveToRecycleBinFormAction } from '@/lib/actions/recycle-bin-form-handlers';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';
import { FormPendingOverlay } from './FormPendingOverlay';
import { Icon } from './ui/Icon';
import { pluralize } from '@/lib/utils/pluralize';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

const MISTAKE: Record<BinEntity, string> = {
  JobCard: 'a Job Card opened',
  VehicleService: 'a Vehicle Service opened',
  Customer: 'a customer registered',
  CustomerVehicle: 'a vehicle registered',
  Part: 'a part added',
};

/**
 * "Delete (created by mistake)" on a record page. Shown only when the server
 * says this person may delete it AND nothing of consequence has happened to
 * it; managers see a short note when it has history and must be cancelled
 * or closed instead. Everyone else sees nothing.
 */
export function RecycleBinPanel({ offer, entity, id, className = '' }: { offer: BinOffer; entity: BinEntity; id: string; className?: string }) {
  if (offer.mode === 'none') return null;
  if (offer.mode === 'note') {
    return (
      <section aria-label="Deleting this record" className={`h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 ${className}`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><Icon name="info" size={16} className="text-[var(--ejo-info)]" />Created by mistake?</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ejo-text-muted)]">{offer.message}</p>
      </section>
    );
  }
  const what = MISTAKE[entity];
  return (
    <section aria-label="Deleting this record" className={`h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/25 bg-[var(--ejo-error)]/[0.04] p-4 ${className}`}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-[var(--ejo-error)]">
          <span className="flex items-center gap-2"><Icon name="trash" size={16} />Delete (created by mistake)</span>
          <span aria-hidden="true" className="text-xs text-[var(--ejo-text-muted)] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-[var(--ejo-text-muted)]">
          Only for {what} by mistake. It goes to the Recycle bin, where an administrator can restore it for {pluralize(offer.days, 'day')}. After that it is removed for good.
          {offer.creatorWindow ? ' You can do this yourself for 24 hours after opening it; after that, ask a Workshop Manager.' : ''}
        </p>
        <form action={moveToRecycleBinFormAction} className="mt-3 space-y-2">
          <FormPendingOverlay />
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="id" value={id} />
          <label htmlFor={`bin-reason-${id}`} className="block text-xs font-medium text-[var(--ejo-text)]">What was the mistake?</label>
          <textarea
            id={`bin-reason-${id}`}
            name="reason"
            required
            minLength={REASON_MIN}
            maxLength={REASON_MAX}
            rows={2}
            placeholder="For example: opened on the wrong vehicle"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <RefineTextButton targetId={`bin-reason-${id}`} />
          <ConfirmDeleteButton
            confirmMessage={`Move ${offer.reference} to the Recycle bin? It disappears from lists and search straight away. An administrator can restore it within ${pluralize(offer.days, 'day')}.`}
            label="Move to Recycle bin"
            pendingLabel="Moving…"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
          />
        </form>
      </details>
    </section>
  );
}

/** "JC-2026-000123 moved to the Recycle bin." on the list a delete returns to. */
export function BinnedNotice({ reference, days }: { reference?: string; days?: number }) {
  if (!reference) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm text-[var(--ejo-success)]">
      <Icon name="trash" size={16} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-medium">{reference} moved to the Recycle bin.</span>{' '}
        <span className="text-[var(--ejo-text-muted)]">An administrator can restore it{days ? ` within ${pluralize(days, 'day')}` : ''} from Administration → Recycle bin.</span>
      </span>
    </div>
  );
}
