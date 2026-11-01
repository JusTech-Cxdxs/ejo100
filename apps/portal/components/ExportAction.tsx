import { EXPORT_KINDS, mayExport } from '@/lib/exports/kinds';
import { ExportButton } from '@/components/ExportButton';

/**
 * The Export button for a list, shown only to those who may export it (the
 * list's own permission, dataexchange.export.run, and — for contact details
 * or payments — dataexchange.export.sensitive). Pass the page's own search
 * params: the file follows the list's filters and search.
 */
export async function ExportAction({ kind, params, label, align }: { kind: keyof typeof EXPORT_KINDS | string; params?: Record<string, string | string[] | undefined>; label?: string; align?: 'left' | 'right' }) {
  const k = EXPORT_KINDS[kind];
  if (!k || !(await mayExport(k).catch(() => false))) return null;
  return <ExportButton kind={k.key} params={params} label={label} align={align} />;
}
