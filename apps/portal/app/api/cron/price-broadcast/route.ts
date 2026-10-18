import { NextRequest, NextResponse } from 'next/server';
import { prisma, setAuditActor, type Prisma } from '@ejo/database';
import { isCronRequest } from '@/lib/cron-auth';
import { recordJobRun } from '@/lib/job-runs';
import { logFailure } from '@/lib/log';
import { sendEmail } from '@/lib/email';
import { websiteBaseUrl } from '@/lib/portal-url';
import { letterheadFor } from '@/lib/support/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { renderSalesPriceBroadcastEmail, type PriceBroadcastEmailLine } from '@/lib/email-templates/sales-price-broadcast';
import { changeSummary, snapshotKey, lagosDayOf, type PriceSnapshotLine } from '@/lib/pricing-core';
import { naira, TIER_LABEL } from '@/lib/sales-core';

/**
 * The daily dealer price broadcast (vercel.json: every working morning).
 * For every organisation with an ACTIVE dealer price list that has not been
 * broadcast today (Lagos), publish one as the system — the same record and
 * email the Commercial Director's "Publish today's dealer prices" button
 * makes (lib/actions/pricing.ts), attributed to the organisation's first
 * administrator (or the list's creator). Running twice in a day sends nothing
 * twice: a list already broadcast today is skipped.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  setAuditActor(null, 'cron:price-broadcast');
  if (!isCronRequest(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = lagosDayOf(new Date());
  const lists = await prisma.priceList.findMany({
    where: { status: 'ACTIVE', channel: 'DEALER', organisation: { isActive: true } },
    include: { items: { include: { product: { select: { name: true, sku: true } }, configuration: { select: { name: true, code: true } } } }, organisation: { select: { id: true, name: true } } },
    take: 500,
  });
  let published = 0, skipped = 0, emailsSent = 0, emailsFailed = 0;
  const dateLabel = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' });
  for (const list of lists) {
    try {
      const previous = await prisma.priceBroadcast.findFirst({ where: { organisationId: list.organisationId, priceList: { channel: list.channel, tier: list.tier } }, orderBy: { publishedAt: 'desc' }, select: { publishedAt: true, changes: true } });
      if (previous && lagosDayOf(previous.publishedAt) === today) { skipped += 1; continue; }
      if (!list.items.length) { skipped += 1; continue; }
      const lines: PriceSnapshotLine[] = list.items.map((i: (typeof list.items)[number]) => ({ key: snapshotKey(i), label: i.configuration ? `${i.product.name} — ${i.configuration.name}` : i.product.name, unitPrice: Number(i.unitPrice), minQuantity: i.minQuantity }));
      const before = (previous?.changes as { snapshot?: PriceSnapshotLine[] } | null)?.snapshot ?? null;
      const diff = changeSummary(previous ? before ?? [] : null, lines);
      const publisher = (await prisma.user.findFirst({ where: { organisationId: list.organisationId, isActive: true, roles: { some: { role: { slug: 'administrator' } } } }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id ?? list.createdById;
      const dealers = await prisma.dealerAccount.findMany({ where: { channel: 'DEALER', receivesPriceBroadcast: true, ...(list.tier ? { tier: list.tier } : {}), customer: { organisationId: list.organisationId, isActive: true } }, select: { customer: { select: { fullName: true, email: true } } } });
      const number = await nextDocumentNumber('PB', list.organisationId);
      const broadcast = await prisma.priceBroadcast.create({
        data: { number, organisationId: list.organisationId, priceListId: list.id, publishedById: publisher, summary: diff.summary, recipientsCount: dealers.length, emailed: dealers.some((d: { customer: { email: string | null } }) => Boolean(d.customer.email)), changes: { snapshot: lines, changes: diff.changes, listNumber: list.number, scheduled: true } as unknown as Prisma.InputJsonValue },
      });
      await writeAuditLog({ userId: null, organisationId: list.organisationId, action: 'price_broadcast.published', entityType: 'PriceBroadcast', entityId: broadcast.id, metadata: { referenceNumber: number, priceList: list.number, summary: diff.summary, recipientsCount: dealers.length, scheduled: true } });
      published += 1;
      const emailLines: PriceBroadcastEmailLine[] = lines.map((l) => {
        const c = diff.changes.find((x) => x.key === l.key);
        return { label: l.label, unitPrice: naira(l.unitPrice), minQuantity: l.minQuantity, change: c?.kind === 'ADDED' ? 'NEW' : c?.kind === 'UP' ? 'UP' : c?.kind === 'DOWN' ? 'DOWN' : null, previousPrice: c?.from !== null && c?.from !== undefined ? naira(c.from) : null };
      });
      const removed = diff.changes.filter((c) => c.kind === 'REMOVED').map((c) => c.label);
      const head = await letterheadFor(list.organisationId, null);
      const portalUrl = `${websiteBaseUrl()}/customer-portal/dashboard`;
      for (const d of dealers) {
        if (!d.customer.email) continue;
        try {
          const m = renderSalesPriceBroadcastEmail({ dealerName: d.customer.fullName, listName: list.name, tierLabel: list.tier ? TIER_LABEL[list.tier] : null, dateLabel, broadcastNumber: number, changeSummary: diff.summary, lines: emailLines, removed, portalUrl, logoUrl: head.logoUrl, companyName: head.companyName });
          await sendEmail(d.customer.email, m.subject, m.html);
          emailsSent += 1;
        } catch (err) {
          emailsFailed += 1;
          logFailure('Could not email a dealer the scheduled price broadcast', number, err);
        }
      }
    } catch (err) {
      logFailure('Scheduled price broadcast failed for a price list', list.number, err);
    }
  }
  await recordJobRun('price-broadcast', { activeDealerLists: lists.length, published, skipped, emailsSent, emailsFailed });
  return NextResponse.json({ activeDealerLists: lists.length, published, skipped, emailsSent, emailsFailed });
}
