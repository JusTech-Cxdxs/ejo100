'use server';

/**
 * Thin <form action={...}> wrappers around lib/actions/store.ts — same
 * pattern as workshop-form-handlers.ts: native React 19 form actions,
 * FormData in, redirect or revalidatePath out.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createPart, recordGoodsReceipt } from './store';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function num(formData: FormData, key: string): number | undefined {
  const raw = str(formData, key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createPartFormAction(formData: FormData) {
  const branchId = str(formData, 'branchId');
  const trackingType = str(formData, 'trackingType');
  try {
    const altUnitName = str(formData, 'altUnitName');
    const altUnitFactor = num(formData, 'altUnitFactor');
    await createPart({
      branchId,
      name: str(formData, 'name'),
      description: str(formData, 'description') || undefined,
      category: str(formData, 'category') || undefined,
      partNumber: str(formData, 'partNumber') || undefined,
      trackingType: trackingType as 'QUANTITY' | 'BATCH' | 'SERIALIZED',
      baseUnitOfMeasure: str(formData, 'baseUnitOfMeasure'),
      reorderPoint: num(formData, 'reorderPoint'),
      safetyStock: num(formData, 'safetyStock'),
      alternativeUnits: altUnitName && altUnitFactor ? [{ unitName: altUnitName, conversionFactor: altUnitFactor }] : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create part.';
    redirect(`/inventory/parts?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/inventory/parts');
  redirect('/inventory/parts?status=part_created');
}

export async function recordGoodsReceiptFormAction(formData: FormData) {
  const branchId = str(formData, 'branchId');
  const partId = str(formData, 'partId');
  try {
    // Multiple real <input name="serialNumbers"> rows, the same
    // getAll() pattern used for complaints on Job Card creation —
    // never a single field a comma/newline had to be parsed back out
    // of, which risked splitting a serial that genuinely contained one.
    const serialNumbers = formData.getAll('serialNumbers')
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    await recordGoodsReceipt({
      branchId,
      supplierName: str(formData, 'supplierName'),
      notes: str(formData, 'notes') || undefined,
      lines: [
        {
          partId,
          quantityReceivedInUnit: num(formData, 'quantityReceivedInUnit') ?? 0,
          unitUsed: str(formData, 'unitUsed'),
          unitCost: num(formData, 'unitCost'),
          batchNumber: str(formData, 'batchNumber') || undefined,
          serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record goods receipt.';
    redirect(`/inventory/goods-receipts/new?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/inventory/goods-receipts');
  revalidatePath('/inventory/parts');
  redirect('/inventory/goods-receipts?status=receipt_recorded');
}
