import { NextResponse } from 'next/server';
import { allows } from '@/lib/authz/server';
import { listSalesPayments } from '@/lib/actions/sales';
import { csvLine, PAYMENT_METHOD_LABEL } from '@/lib/sales-core';

export const dynamic = 'force-dynamic';

/**
 * Payments as CSV for the finance system (finance.export): one row per
 * payment in this person's reach, newest first. 403 for everyone else;
 * the sign-in middleware already keeps anonymous requests out.
 */
export async function GET(): Promise<Response> {
  if (!(await allows('finance.export'))) return NextResponse.json({ error: 'Only Finance (export) can download payments.' }, { status: 403 });
  const rows = await listSalesPayments({ take: 5000 });
  const lines = [csvLine(['Sales order', 'Customer', 'Channel', 'Amount', 'Method', 'Reference', 'Paid on', 'Status', 'Recorded by', 'Decided by', 'Decided at', 'Rejected reason'])];
  for (const p of rows) {
    lines.push(csvLine([
      p.salesOrder.number, p.salesOrder.customer.fullName, p.salesOrder.channel, Number(p.amount).toFixed(2), PAYMENT_METHOD_LABEL[p.method] ?? p.method, p.reference ?? '',
      p.paidAt.toISOString().slice(0, 10), p.status, p.recordedByName ?? 'Customer portal', p.confirmedByName ?? '', p.confirmedAt ? p.confirmedAt.toISOString() : '', p.rejectedReason ?? '',
    ]));
  }
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return new Response(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sales-payments-${day}.csv"`, 'Cache-Control': 'no-store' } });
}
