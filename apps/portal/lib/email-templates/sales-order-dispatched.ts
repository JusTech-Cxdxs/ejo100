import { renderEmailLayout, html, greeting, para, details, list } from './layout';

export type SalesOrderDispatchedEmailOptions = {
  customerName: string;
  orderNumber: string;
  dispatchNumber: string;
  dispatchedOn: string;
  carrier?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  waybill?: string | null;
  deliveryAddress?: string | null;
  /** "Prestige Pro2 × 2", with serials when known. */
  items: string[];
  portalUrl: string;
  logoUrl: string;
  companyName: string;
  branchName?: string | null;
};

/** The goods have left the warehouse: who is bringing them, and what to check on arrival. */
export function renderSalesOrderDispatchedEmail(o: SalesOrderDispatchedEmailOptions): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Your goods for sales order ${o.orderNumber} were dispatched on ${o.dispatchedOn} under dispatch note ${o.dispatchNumber}.`)}
    ${list(o.items)}
    ${details([
      ['Sales order', o.orderNumber],
      ['Dispatch note', o.dispatchNumber],
      ['Carrier', o.carrier ?? null],
      ['Driver', o.driverName ?? null],
      ['Vehicle', o.vehiclePlate ?? null],
      ['Waybill', o.waybill ?? null],
      ['Delivering to', o.deliveryAddress ?? null],
    ])}
    ${para('On arrival, check the serial numbers against the delivery note before signing. Your warranty starts on the day of delivery; your tax invoice follows.', 'small')}`;
  return {
    subject: `Dispatched — ${o.orderNumber}`,
    html: renderEmailLayout({
      previewText: `Order ${o.orderNumber} dispatched under ${o.dispatchNumber}.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: [o.branchName],
      status: { label: 'Dispatched', tone: 'info' },
      heading: 'Your order is on its way',
      bodyHtml,
      ctaLabel: 'Track the order',
      ctaUrl: o.portalUrl,
      audience: 'customer',
    }),
  };
}
