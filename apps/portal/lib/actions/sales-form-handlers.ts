'use server';
import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createQuotation, updateQuotation, sendQuotation, approveQuotationDiscount, rejectQuotationDiscount, acceptQuotation, declineQuotation, cancelQuotation, convertQuotationToOrder,
  issueProFormaInvoice, recordSalesPayment, confirmSalesPayment, rejectSalesPayment, approveCreditSale, declineCreditSale, clearOrderForRelease, issueSalesInvoice, closeSalesOrder, cancelSalesOrder,
  requestSalesReturn, approveSalesReturn, rejectSalesReturn, receiveSalesReturn, resolveSalesReturn,
  type QuotationLineInput,
} from './sales';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function dateOrNull(formData: FormData, key: string): Date | null {
  const v = str(formData, key);
  if (!v) return null;
  const d = new Date(`${v}T12:00:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** The quotation editor submits its lines as JSON in one hidden field. */
function readLines(formData: FormData): QuotationLineInput[] {
  let parsed: unknown = [];
  try { parsed = JSON.parse(str(formData, 'linesJson') || '[]'); } catch { parsed = []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 60).map((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const [productId = '', configurationId = ''] = String(l.product ?? '').split('|');
    return { productId, configurationId: configurationId || null, quantity: Number(l.quantity) || 0, unitPrice: Number(String(l.unitPrice ?? '').replace(/,/g, '')) || 0, discountPercent: Number(l.discountPercent) || 0, notes: typeof l.notes === 'string' ? l.notes : undefined };
  });
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'sales-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function doneQuote(id: string, status: string): never {
  revalidatePath(`/sales/quotations/${id}`);
  revalidatePath('/sales/quotations');
  revalidatePath('/sales');
  redirect(`/sales/quotations/${id}?status=${status}`);
}
function doneOrder(id: string, status: string): never {
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath('/sales/orders');
  revalidatePath('/sales/payments');
  revalidatePath('/sales');
  redirect(`/sales/orders/${id}?status=${status}`);
}
function doneReturn(id: string, status: string): never {
  revalidatePath(`/sales/returns/${id}`);
  revalidatePath('/sales/returns');
  redirect(`/sales/returns/${id}?status=${status}`);
}

// ── Quotations ────────────────────────────────────────────────────────────

/** → /sales/quotations/<id>?status=created */
export async function createQuotationFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createQuotation({ customerId: str(formData, 'customerId'), lines: readLines(formData), validUntil: dateOrNull(formData, 'validUntil'), notes: str(formData, 'notes') })).id;
  } catch (err) {
    fail('/sales/quotations/new', err, 'Could not save the quotation.');
  }
  doneQuote(id, 'created');
}

/** → ?status=saved */
export async function updateQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await updateQuotation(id, { lines: readLines(formData), validUntil: dateOrNull(formData, 'validUntil'), notes: str(formData, 'notes') });
  } catch (err) {
    fail(`/sales/quotations/${id}?edit=1`, err, 'Could not save the quotation.');
  }
  doneQuote(id, 'saved');
}

/** → ?status=sent or ?status=discount_approval_requested */
export async function sendQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  let outcome = 'sent';
  try {
    outcome = (await sendQuotation(id)).status === 'SENT' ? 'sent' : 'discount_approval_requested';
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not send the quotation.');
  }
  doneQuote(id, outcome);
}

/** → ?status=discount_approved */
export async function approveQuotationDiscountFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await approveQuotationDiscount(id);
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not approve the discount.');
  }
  doneQuote(id, 'discount_approved');
}

/** → ?status=discount_rejected */
export async function rejectQuotationDiscountFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await rejectQuotationDiscount(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not send the quotation back.');
  }
  doneQuote(id, 'discount_rejected');
}

/** → ?status=accepted */
export async function acceptQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await acceptQuotation(id);
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not record the acceptance.');
  }
  doneQuote(id, 'accepted');
}

/** → ?status=declined */
export async function declineQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await declineQuotation(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not record the decision.');
  }
  doneQuote(id, 'declined');
}

/** → ?status=cancelled */
export async function cancelQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  try {
    await cancelQuotation(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not cancel the quotation.');
  }
  doneQuote(id, 'cancelled');
}

/** → /sales/orders/<orderId>?status=confirmed (or ?status=credit_approval_needed) */
export async function convertQuotationFormAction(formData: FormData) {
  const id = str(formData, 'quotationId');
  let orderId = '';
  let outcome = 'confirmed';
  try {
    const r = await convertQuotationToOrder(id);
    orderId = r.id;
    outcome = r.creditNeedsApproval ? 'credit_approval_needed' : 'confirmed';
  } catch (err) {
    fail(`/sales/quotations/${id}`, err, 'Could not convert the quotation.');
  }
  revalidatePath(`/sales/quotations/${id}`);
  doneOrder(orderId, outcome);
}

// ── Orders ────────────────────────────────────────────────────────────────

/** → ?status=pro_forma_issued */
export async function issueProFormaFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await issueProFormaInvoice(id, { dueDate: dateOrNull(formData, 'dueDate'), notes: str(formData, 'notes') });
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not issue the pro-forma invoice.');
  }
  doneOrder(id, 'pro_forma_issued');
}

/** → ?status=payment_recorded */
export async function recordSalesPaymentFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await recordSalesPayment(id, { amount: num(formData, 'amount'), method: str(formData, 'method'), reference: str(formData, 'reference'), paidAt: dateOrNull(formData, 'paidAt'), proofNote: str(formData, 'proofNote') });
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not record the payment.');
  }
  doneOrder(id, 'payment_recorded');
}

/** From the order page or the payments list (`back=payments`). → ?status=payment_confirmed */
export async function confirmSalesPaymentFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  const back = str(formData, 'back') === 'payments';
  try {
    await confirmSalesPayment(str(formData, 'salesPaymentId'));
  } catch (err) {
    fail(back ? '/sales/payments' : `/sales/orders/${id}`, err, 'Could not confirm the payment.');
  }
  if (back) { revalidatePath('/sales/payments'); revalidatePath(`/sales/orders/${id}`); redirect('/sales/payments?status=payment_confirmed'); }
  doneOrder(id, 'payment_confirmed');
}

/** → ?status=payment_rejected */
export async function rejectSalesPaymentFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  const back = str(formData, 'back') === 'payments';
  try {
    await rejectSalesPayment(str(formData, 'salesPaymentId'), str(formData, 'reason'));
  } catch (err) {
    fail(back ? '/sales/payments' : `/sales/orders/${id}`, err, 'Could not reject the payment.');
  }
  if (back) { revalidatePath('/sales/payments'); revalidatePath(`/sales/orders/${id}`); redirect('/sales/payments?status=payment_rejected'); }
  doneOrder(id, 'payment_rejected');
}

/** → ?status=credit_approved */
export async function approveCreditSaleFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await approveCreditSale(id);
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not approve the credit sale.');
  }
  doneOrder(id, 'credit_approved');
}

/** → ?status=credit_declined */
export async function declineCreditSaleFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await declineCreditSale(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not decline the credit sale.');
  }
  doneOrder(id, 'credit_declined');
}

/** → ?status=cleared */
export async function clearOrderForReleaseFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await clearOrderForRelease(id);
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not clear the order for release.');
  }
  doneOrder(id, 'cleared');
}

/** → ?status=invoiced */
export async function issueSalesInvoiceFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await issueSalesInvoice(id);
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not issue the invoice.');
  }
  doneOrder(id, 'invoiced');
}

/** → ?status=closed */
export async function closeSalesOrderFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await closeSalesOrder(id);
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not close the order.');
  }
  doneOrder(id, 'closed');
}

/** → ?status=cancelled */
export async function cancelSalesOrderFormAction(formData: FormData) {
  const id = str(formData, 'salesOrderId');
  try {
    await cancelSalesOrder(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/orders/${id}`, err, 'Could not cancel the order.');
  }
  doneOrder(id, 'cancelled');
}

// ── Returns ───────────────────────────────────────────────────────────────

/** → /sales/returns/<id>?status=requested */
export async function requestSalesReturnFormAction(formData: FormData) {
  const orderId = str(formData, 'salesOrderId');
  let id = '';
  try {
    id = (await requestSalesReturn(orderId, { reason: str(formData, 'reason'), finishedUnitId: str(formData, 'finishedUnitId') || null })).id;
  } catch (err) {
    fail(`/sales/orders/${orderId}`, err, 'Could not request the return.');
  }
  revalidatePath(`/sales/orders/${orderId}`);
  doneReturn(id, 'requested');
}

/** → ?status=approved */
export async function approveSalesReturnFormAction(formData: FormData) {
  const id = str(formData, 'salesReturnId');
  try {
    await approveSalesReturn(id);
  } catch (err) {
    fail(`/sales/returns/${id}`, err, 'Could not approve the return.');
  }
  doneReturn(id, 'approved');
}

/** → ?status=rejected */
export async function rejectSalesReturnFormAction(formData: FormData) {
  const id = str(formData, 'salesReturnId');
  try {
    await rejectSalesReturn(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/returns/${id}`, err, 'Could not reject the return.');
  }
  doneReturn(id, 'rejected');
}

/** → ?status=received */
export async function receiveSalesReturnFormAction(formData: FormData) {
  const id = str(formData, 'salesReturnId');
  try {
    await receiveSalesReturn(id, str(formData, 'notes'));
  } catch (err) {
    fail(`/sales/returns/${id}`, err, 'Could not receive the return.');
  }
  doneReturn(id, 'received');
}

/** → ?status=resolved */
export async function resolveSalesReturnFormAction(formData: FormData) {
  const id = str(formData, 'salesReturnId');
  try {
    await resolveSalesReturn(id, { resolution: str(formData, 'resolution'), notes: str(formData, 'notes') });
  } catch (err) {
    fail(`/sales/returns/${id}`, err, 'Could not resolve the return.');
  }
  doneReturn(id, 'resolved');
}
