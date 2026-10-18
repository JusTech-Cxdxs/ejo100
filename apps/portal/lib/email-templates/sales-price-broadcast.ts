import { renderEmailLayout, html, greeting, para, callout, raw, escapeHtml, type SafeHtml } from './layout';

export type PriceBroadcastEmailLine = { label: string; unitPrice: string; minQuantity: number; change: 'UP' | 'DOWN' | 'NEW' | null; previousPrice?: string | null };

export type SalesPriceBroadcastEmailOptions = {
  dealerName: string;
  listName: string;
  tierLabel?: string | null;
  dateLabel: string;
  broadcastNumber: string;
  /** One line, e.g. "2 prices up, 1 new". */
  changeSummary: string;
  lines: PriceBroadcastEmailLine[];
  removed?: string[];
  /** The dealer portal's prices page. */
  portalUrl: string;
  logoUrl: string;
  companyName: string;
};

function priceRows(lines: PriceBroadcastEmailLine[]): SafeHtml {
  const rows = lines.map((l) => {
    const tag = l.change === 'UP' ? '<span style="color:#B45309;font-size:11px;font-weight:600;">up</span>' : l.change === 'DOWN' ? '<span style="color:#047857;font-size:11px;font-weight:600;">down</span>' : l.change === 'NEW' ? '<span style="color:#1D4ED8;font-size:11px;font-weight:600;">new</span>' : '';
    const was = l.previousPrice && l.change && l.change !== 'NEW' ? `<div style="font-size:11px;color:#64748B;">was ${escapeHtml(l.previousPrice)}</div>` : '';
    const qty = l.minQuantity > 1 ? `<div style="font-size:11px;color:#64748B;">from ${l.minQuantity} units</div>` : '';
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;">${escapeHtml(l.label)}${qty}</td><td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:13px;color:#0F172A;text-align:right;white-space:nowrap;"><strong>${escapeHtml(l.unitPrice)}</strong> ${tag}${was}</td></tr>`;
  });
  return raw(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;"><tbody>${rows.join('')}</tbody></table>`);
}

/** The daily dealer price broadcast: today's prices for the dealer's tier, changes marked. */
export function renderSalesPriceBroadcastEmail(o: SalesPriceBroadcastEmailOptions): { subject: string; html: string } {
  const changed = o.lines.some((l) => l.change) || (o.removed?.length ?? 0) > 0;
  const bodyHtml = html`
    ${greeting(o.dealerName)}
    ${para(`Here are today's dealer prices${o.tierLabel ? ` for ${o.tierLabel}` : ''} (${o.listName}), as of ${o.dateLabel}. Prices are in Naira, before VAT, per unit.`)}
    ${changed ? callout(o.changeSummary, 'info', 'What changed since the last broadcast') : callout('No change since the last broadcast.', 'neutral', 'What changed')}
    ${priceRows(o.lines)}
    ${o.removed?.length ? para(`No longer listed: ${o.removed.join(', ')}.`, 'small') : ''}
    ${para(`Broadcast ${o.broadcastNumber}. Place orders and check stock on your dealer portal; prices can change daily.`, 'small')}`;
  return {
    subject: `Dealer prices — ${o.dateLabel}${changed ? ` — ${o.changeSummary}` : ''}`.slice(0, 110),
    html: renderEmailLayout({
      previewText: `${o.listName}: ${o.changeSummary}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      status: { label: 'Daily price list', tone: 'info' },
      heading: `Dealer prices for ${o.dateLabel}`,
      bodyHtml,
      ctaLabel: 'Open the dealer portal',
      ctaUrl: o.portalUrl,
      audience: 'customer',
      reason: 'You receive this because your dealer account is set to get the daily price broadcast. Ask your account manager to switch it off.',
    }),
  };
}
