'use server';

/**
 * Thin <form action={...}> wrappers around lib/actions/store.ts — same
 * pattern as workshop-form-handlers.ts: native React 19 form actions,
 * FormData in, redirect or revalidatePath out.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createPart, recordGoodsReceipt, updatePart, setPartAlternativeUnits, createPartFitment, deletePartFitment, createPartCategory, createPartType, matchEstimateStorePartLine } from './store';

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

export async function updatePartFormAction(formData: FormData) {
  const id = str(formData, 'id');
  try {
    // Alternative units validated and applied first — if a duplicate
    // name or a name matching the base unit slips through, this
    // throws before any of the part's other fields are touched,
    // avoiding a partial update where the description saved but the
    // units silently didn't.
    const unitNames = formData.getAll('altUnitName').map((v) => (typeof v === 'string' ? v : ''));
    const unitFactors = formData.getAll('altUnitFactor').map((v) => (typeof v === 'string' ? v : ''));
    const units = unitNames
      .map((unitName, i) => ({ unitName, conversionFactor: Number(unitFactors[i]) }))
      .filter((u) => u.unitName.trim() && u.conversionFactor > 0);
    await setPartAlternativeUnits(id, units);

    await updatePart({
      id,
      name: str(formData, 'name'),
      description: str(formData, 'description') || undefined,
      category: str(formData, 'category') || undefined,
      partNumber: str(formData, 'partNumber') || undefined,
      reorderPoint: num(formData, 'reorderPoint'),
      safetyStock: num(formData, 'safetyStock'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update this part.';
    redirect(`/inventory/parts/${id}/edit?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/inventory/parts/${id}`);
  revalidatePath('/inventory/parts');
  redirect(`/inventory/parts/${id}?status=updated`);
}

export async function createPartFitmentFormAction(formData: FormData) {
  const partId = str(formData, 'partId');
  try {
    await createPartFitment({
      partId,
      make: str(formData, 'make'),
      model: str(formData, 'model'),
      engineType: str(formData, 'engineType') || undefined,
      yearFrom: num(formData, 'yearFrom'),
      yearTo: num(formData, 'yearTo'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add this fitment.';
    redirect(`/inventory/parts/${partId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/inventory/parts/${partId}`);
  redirect(`/inventory/parts/${partId}?status=fitment_added`);
}

export async function deletePartFitmentFormAction(formData: FormData) {
  const partId = str(formData, 'partId');
  const fitmentId = str(formData, 'fitmentId');
  try {
    await deletePartFitment(fitmentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not remove this fitment.';
    redirect(`/inventory/parts/${partId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/inventory/parts/${partId}`);
  redirect(`/inventory/parts/${partId}?status=fitment_removed`);
}

export async function createPartCategoryFormAction(formData: FormData) {
  const branchId = str(formData, 'branchId');
  try {
    await createPartCategory(branchId, str(formData, 'name'), str(formData, 'description') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create this Part Category.';
    redirect(`/inventory/part-types?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/inventory/part-types');
  redirect('/inventory/part-types?status=category_created');
}

export async function createPartTypeFormAction(formData: FormData) {
  const branchId = str(formData, 'branchId');
  try {
    await createPartType(branchId, str(formData, 'categoryId'), str(formData, 'name'), str(formData, 'description') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create this Part Type.';
    redirect(`/inventory/part-types?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/inventory/part-types');
  redirect('/inventory/part-types?status=type_created');
}

export async function matchEstimateStorePartLineFormAction(formData: FormData) {
  const lineItemId = str(formData, 'lineItemId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    const partId = str(formData, 'partId');
    if (!partId) {
      throw new Error('Pick a Part to match this line to.');
    }
    await matchEstimateStorePartLine(lineItemId, partId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not match this line.';
    redirect(`/inventory/estimate-matching?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/inventory/estimate-matching');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect('/inventory/estimate-matching?status=line_matched');
}
