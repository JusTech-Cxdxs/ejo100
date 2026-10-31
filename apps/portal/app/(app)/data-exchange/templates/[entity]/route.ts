import { allows } from '@/lib/authz/server';
import { getOrganisation } from '@/lib/actions/organisation';
import { ENTITIES, isEntityKey } from '@/lib/data-exchange/fields';
import { templateCsv, templateSheets } from '@/lib/data-exchange/templates';
import { writeXlsx } from '@/lib/data-exchange/xlsx-writer';

export const dynamic = 'force-dynamic';

/** The import template for one kind of record: Excel (with instructions and dropdowns) or CSV. No data in it. */
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }): Promise<Response> {
  const { entity } = await params;
  if (!isEntityKey(entity) || !((await allows('dataexchange.import.run')) || (await allows('dataexchange.import.approve')))) {
    return new Response('Not available.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const csv = new URL(req.url).searchParams.get('format') === 'csv';
  const name = `${ENTITIES[entity].plural}-template`;
  if (csv) {
    return new Response(templateCsv(entity), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const org = await getOrganisation().catch(() => null);
  const bytes = writeXlsx(templateSheets(entity, org?.name ?? 'the system'));
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}.xlsx"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
