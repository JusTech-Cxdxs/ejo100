import { importRowsPage } from '@/lib/actions/data-exchange';
import { csvCell } from '@/lib/hq-core';
import { issueText } from '@/lib/data-exchange/check';
import { ROW_OUTCOME } from '@/lib/data-exchange/status';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * An import's rows as a CSV file, streamed a page at a time (any size):
 *  - rejects:  the rejected and duplicate rows, with the file's own columns and a "Problem" column —
 *              fix them in Excel and upload that file again;
 *  - possible: rows that may be existing customers (same phone), to follow up;
 *  - all:      every row with what happened to it (the reconciliation file).
 * Same check as the import page (the person's organisation and permission);
 * formulas neutralised; the download is in the audit trail; never cached.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const kindRaw = new URL(req.url).searchParams.get('kind');
  const kind = kindRaw === 'possible' || kindRaw === 'all' ? kindRaw : 'rejects';
  let first;
  try {
    first = await importRowsPage(id, kind, 0);
  } catch {
    return new Response('Not available.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const enc = new TextEncoder();
  const line = (cells: unknown[]) => `${cells.map(csvCell).join(',')}\r\n`;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(`\uFEFF${line([...first.headers, 'Row in your file', kind === 'all' ? 'Outcome' : 'Status', 'Problem or note'])}`));
      let page = first;
      for (;;) {
        let text = '';
        for (const r of page.rows) text += line([...first.headers.map((_, i) => r.cells[i] ?? ''), r.rowNumber, ROW_OUTCOME[r.status] ?? r.status, issueText(r.issues)]);
        if (text) controller.enqueue(enc.encode(text));
        if (page.rows.length < 5000) break;
        page = await importRowsPage(id, kind, page.rows[page.rows.length - 1]!.rowNumber);
      }
      controller.close();
    },
  });
  const name = { rejects: 'rejected-rows', possible: 'possible-duplicates', all: 'report' }[kind];
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${first.number}-${name}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
