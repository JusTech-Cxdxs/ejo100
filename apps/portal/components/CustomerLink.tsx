import Link from 'next/link';

/**
 * A customer's name, linking to their Customers (CRM) 360 page
 * (/crm/customers/<id>). Permission-aware without a query per row: the PAGE
 * decides once (allows('crm.view')) and passes `canView`; without it the
 * name is plain text. Never used on printed documents.
 */
export function CustomerLink({ id, name, canView, className }: { id: string | null | undefined; name: string | null | undefined; canView: boolean; className?: string }) {
  const label = name?.trim() || 'Customer';
  if (!canView || !id) return <span className={className}>{label}</span>;
  return (
    <Link
      href={`/crm/customers/${encodeURIComponent(id)}`}
      prefetch={false}
      className={`${className ?? ''} underline decoration-[var(--ejo-primary)]/30 decoration-1 underline-offset-2 transition-colors hover:text-[var(--ejo-primary)] hover:decoration-[var(--ejo-primary)]`}
      title={`Open ${label}'s customer page`}
    >
      {label}
    </Link>
  );
}
