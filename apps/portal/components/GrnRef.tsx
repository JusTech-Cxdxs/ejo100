import { LoadingLink } from '@/components/LoadingLink';

/** A goods receipt's number — a link for people who may open goods receipts
 * (they show delivery costs), plain text for everyone else. */
export function GrnRef({ id, label, link, className = 'text-[var(--ejo-primary)] hover:underline' }: { id: string; label: string; link: boolean; className?: string }) {
  return link ? <LoadingLink href={`/inventory/goods-receipts/${id}`} className={className}>{label}</LoadingLink> : <span className="font-medium text-[var(--ejo-text)]">{label}</span>;
}
