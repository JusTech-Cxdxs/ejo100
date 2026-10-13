import type { ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { UnitOfMeasureInput } from '@/components/UnitOfMeasureInput';

/** One estimate line, already worked out by the page (Job Card or Vehicle Service). */
export type EstimateLineView = {
  id: string;
  typeLabel: string;
  description: string;
  /** Under the description: matched part, "Awaiting Store match", warranty. */
  notes?: ReactNode;
  quantity: number;
  /** "Set", "Sets" or "—". */
  unit: string;
  /** Formatted unit price, or a short note ("Awaiting match"). */
  unitPrice: string;
  /** A small "live" tag next to a Draft's matched price. */
  liveTag?: boolean;
  amount: string;
  enteredBy: string;
  /** Edit / Remove (EstimateLineEditLink + a form with EstimateLineRemoveButton), or null. */
  actions?: ReactNode;
  /** While this line is being edited: the edit form, in place of the line. */
  editor?: ReactNode;
};

const TYPE_CHIP = 'inline-flex max-w-full items-center whitespace-nowrap rounded-full bg-[var(--ejo-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-primary)]';

/**
 * Estimate lines. One <table> with one row per line (the e2e specs count
 * `table tbody tr`). Where the card is narrow (phones, and the main column of
 * a Job Card on smaller laptops) each row is laid out as a line card by the
 * .ejo-lines container query in globals.css; wider, it is a normal table that
 * scrolls inside the card before it would ever squeeze columns together.
 */
export function EstimateLinesTable({ lines, withActions }: { lines: EstimateLineView[]; withActions: boolean }) {
  const columns = withActions ? 8 : 7;
  return (
    <div className="ejo-lines ejo-scroll-x mt-3" style={{ ['--ejo-table-min' as string]: '44rem' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--ejo-border)] text-left text-[11px] text-[var(--ejo-text-muted)]">
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="min-w-[10rem] py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 pr-3 font-medium">Unit</th>
            <th className="py-2 pr-3 text-right font-medium">Unit price</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            <th className="py-2 pr-3 font-medium">Entered by</th>
            {withActions ? <th className="py-2 font-medium"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) =>
            line.editor ? (
              <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                <td colSpan={columns} data-cell="editor" className="py-3">{line.editor}</td>
              </tr>
            ) : (
              <tr key={line.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                <td data-cell="type" className="py-2 pr-3 text-[var(--ejo-text-muted)]">
                  <span className={TYPE_CHIP}>{line.typeLabel}</span>
                </td>
                <td data-cell="desc" className="py-2 pr-3 text-[var(--ejo-text)]">
                  <span className="block break-words text-[13px] font-medium leading-snug">{line.description}</span>
                  {line.notes}
                  <span className="ejo-lines-summary mt-1 text-xs text-[var(--ejo-text-muted)]">
                    {line.unitPrice === '—' ? 'Qty ' : ''}{line.quantity}{line.unit !== '—' ? ` ${line.unit}` : ''}{line.unitPrice !== '—' ? ` × ${line.unitPrice}` : ''}
                    {line.liveTag ? <span className="ml-1 text-[9px] font-medium uppercase text-[var(--ejo-success)]">live</span> : null}
                  </span>
                </td>
                <td data-cell="qty" className="whitespace-nowrap py-2 pr-3 text-right text-[var(--ejo-text)]">{line.quantity}</td>
                <td data-cell="unit" className="whitespace-nowrap py-2 pr-3 text-[var(--ejo-text-muted)]">{line.unit}</td>
                <td data-cell="price" className="whitespace-nowrap py-2 pr-3 text-right text-[var(--ejo-text)]">
                  {line.unitPrice}
                  {line.liveTag ? <span className="ml-1 text-[9px] font-medium uppercase text-[var(--ejo-success)]">live</span> : null}
                </td>
                <td data-cell="amount" className="whitespace-nowrap py-2 pr-3 text-right text-[13px] font-semibold text-[var(--ejo-text)]">{line.amount}</td>
                <td data-cell="by" className="py-2 pr-3 text-[11px] text-[var(--ejo-text-muted)]">
                  <span className="ejo-lines-by block max-w-[8rem] break-words">{line.enteredBy}</span>
                </td>
                {withActions ? (
                  <td data-cell="actions" className="py-2">{line.actions ? <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">{line.actions}</div> : null}</td>
                ) : null}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

const ACTION = 'ejo-line-action inline-flex items-center text-xs font-medium leading-none hover:underline';

/** The "Edit" link on an estimate line. */
export function EstimateLineEditLink({ href }: { href: string }) {
  return (
    <LoadingLink href={href} className={`${ACTION} text-[var(--ejo-primary)]`}>
      Edit
    </LoadingLink>
  );
}

/** The "Remove" button on an estimate line (inside the page's own remove form). */
export function EstimateLineRemoveButton() {
  return (
    <button type="submit" className={`${ACTION} text-[var(--ejo-error)]`}>
      Remove
    </button>
  );
}

const FIELD = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const LABEL = 'mb-1 block text-[11px] font-medium text-[var(--ejo-text-muted)]';

/**
 * Editing one estimate line in place. The page passes its own server action
 * and hidden ids; the field names (description, quantity, unitOfMeasure,
 * unitPrice) are what the actions read.
 */
export function EstimateLineEditor({
  action,
  hidden,
  typeLabel,
  description,
  quantity,
  unitOfMeasure,
  storePartUnit,
  isStorePart,
  unitPrice,
  datalistId,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: ReactNode;
  typeLabel: string;
  description: string;
  quantity: number;
  unitOfMeasure: string | null;
  /** Store Part: the matched or typical unit (the Store sets it). */
  storePartUnit: string | null;
  isStorePart: boolean;
  unitPrice: number | null;
  datalistId: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-bg)] p-3">
      <FormPendingOverlay />
      {hidden}
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--ejo-text)]">
        Editing line <span className={TYPE_CHIP}>{typeLabel}</span>
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <label className="block sm:col-span-6">
          <span className={LABEL}>Description</span>
          <input name="description" defaultValue={description} required list={datalistId} className={FIELD} />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Quantity</span>
          <input name="quantity" type="number" inputMode="numeric" step="1" min="1" required defaultValue={quantity} className={FIELD} />
        </label>
        <div className="sm:col-span-2">
          <span className={LABEL}>Unit</span>
          {isStorePart ? (
            <p className="flex min-h-[2.375rem] items-center rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] px-3 text-sm text-[var(--ejo-text)]">
              {storePartUnit ?? <span className="text-xs text-[var(--ejo-text-muted)]">Awaiting Store match</span>}
            </p>
          ) : (
            <UnitOfMeasureInput name="unitOfMeasure" defaultValue={unitOfMeasure ?? undefined} placeholder="Unit" />
          )}
        </div>
        {!isStorePart ? (
          <label className="block sm:col-span-2">
            <span className={LABEL}>Unit price (₦)</span>
            <input
              name="unitPrice"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Unit Price"
              defaultValue={unitPrice ?? ''}
              className={FIELD}
            />
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <LoadingLink
          href={cancelHref}
          className="inline-flex min-h-10 items-center justify-center rounded-[var(--ejo-radius-md)] px-4 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:underline"
        >
          Cancel
        </LoadingLink>
        <SubmitButton
          label="Save"
          pendingLabel="Saving…"
          className="min-h-10 w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
        />
      </div>
    </form>
  );
}
