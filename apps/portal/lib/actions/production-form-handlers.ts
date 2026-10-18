'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  approveUnitRework, cancelBuildOrder, checkBuildOrderMaterials, closeBuildOrder, completeBuildOrder, createBuildOrder, finishUnitRework, holdBuildOrder, issueMaterials,
  markUnitAssembled, packUnit, recordLineCheck, recordQaTest, recordUnitComponent, recordUnitSoftware, releaseBuildOrder, releaseUnitToStore, resumeBuildOrder, scrapUnit, startUnit,
} from './production';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'production-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

function done(path: string, status: string, revalidate: string[] = []): never {
  for (const p of [path, ...revalidate]) revalidatePath(p);
  redirect(`${path}?status=${status}`);
}

const BUILD_LISTS = ['/production/build-orders', '/production', '/production/line'];
const UNIT_LISTS = ['/production/units', '/production', '/production/line'];

/** Checklist answers typed on the traveller: item_<i> (the item text) + result_<i> (PASS / FAIL / NA) + note_<i>. */
function checklist(formData: FormData): { answers: Record<string, string>; notes: Record<string, string> } {
  const answers: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    const m = /^item_(\d+)$/.exec(k);
    if (!m || typeof v !== 'string') continue;
    const item = v.trim();
    if (!item) continue;
    answers[item] = str(formData, `result_${m[1]}`).toUpperCase();
    const note = str(formData, `note_${m[1]}`);
    if (note) notes[item] = note;
  }
  return { answers, notes };
}

// ── Build orders ───────────────────────────────────────────────────────────

export async function createBuildOrderFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createBuildOrder({
      configurationId: str(formData, 'configurationId'), quantity: Number(str(formData, 'quantity')), purpose: str(formData, 'purpose') || 'TO_STOCK',
      dueDate: str(formData, 'dueDate') || null, instructions: str(formData, 'instructions'), priority: Number(str(formData, 'priority') || '3'),
    })).id;
  } catch (err) { fail('/production/build-orders/new', err, 'Could not create the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_created', BUILD_LISTS);
}

export async function checkBuildOrderMaterialsFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  let ok = true;
  try { ok = (await checkBuildOrderMaterials(id)).ok; } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not check the materials.'); }
  done(`/production/build-orders/${id}`, ok ? 'materials_checked' : 'materials_short', BUILD_LISTS);
}

export async function releaseBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await releaseBuildOrder(id); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not release the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_released', BUILD_LISTS);
}

export async function holdBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await holdBuildOrder(id, str(formData, 'reason')); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not put the build order on hold.'); }
  done(`/production/build-orders/${id}`, 'build_order_held', BUILD_LISTS);
}

export async function resumeBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await resumeBuildOrder(id); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not resume the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_resumed', BUILD_LISTS);
}

export async function completeBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await completeBuildOrder(id); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not complete the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_completed', BUILD_LISTS);
}

export async function closeBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await closeBuildOrder(id); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not close the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_closed', BUILD_LISTS);
}

export async function cancelBuildOrderFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try { await cancelBuildOrder(id, str(formData, 'reason')); } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not cancel the build order.'); }
  done(`/production/build-orders/${id}`, 'build_order_cancelled', BUILD_LISTS);
}

export async function issueMaterialsFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  try {
    await issueMaterials(id, { partId: str(formData, 'partId'), quantity: Number(str(formData, 'quantity')), lotOrSerials: str(formData, 'lotOrSerials'), notes: str(formData, 'notes') });
  } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not issue the materials.'); }
  done(`/production/build-orders/${id}`, 'materials_issued', BUILD_LISTS);
}

export async function startUnitFormAction(formData: FormData) {
  const id = str(formData, 'buildOrderId');
  let unitId = '';
  try { unitId = (await startUnit(id)).id; } catch (err) { fail(`/production/build-orders/${id}`, err, 'Could not start the unit.'); }
  done(`/production/units/${unitId}`, 'unit_started', [`/production/build-orders/${id}`, ...UNIT_LISTS]);
}

// ── Units ──────────────────────────────────────────────────────────────────

export async function recordUnitComponentFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try {
    await recordUnitComponent(id, { partId: str(formData, 'partId'), serialNumber: str(formData, 'serialNumber'), lotNumber: str(formData, 'lotNumber') });
  } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the component.'); }
  done(`/production/units/${id}`, 'component_recorded');
}

export async function markUnitAssembledFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await markUnitAssembled(id); } catch (err) { fail(`/production/units/${id}`, err, 'Could not mark the unit assembled.'); }
  done(`/production/units/${id}`, 'unit_assembled', UNIT_LISTS);
}

export async function recordUnitSoftwareFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  const packageIds = formData.getAll('packageIds').filter((v): v is string => typeof v === 'string' && v.length > 0);
  try { await recordUnitSoftware(id, { imageNote: str(formData, 'imageNote'), packageIds }); } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the software.'); }
  done(`/production/units/${id}`, 'software_recorded', UNIT_LISTS);
}

export async function recordLineCheckFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  let passed = false;
  try {
    const { answers, notes } = checklist(formData);
    passed = (await recordLineCheck(id, answers, notes)).passed;
  } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the line check.'); }
  done(`/production/units/${id}`, passed ? 'line_check_passed' : 'line_check_failed', UNIT_LISTS);
}

export async function recordQaTestFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  let passed = false;
  try {
    const { answers, notes } = checklist(formData);
    const burn = str(formData, 'burnInHours');
    passed = (await recordQaTest(id, answers, { burnInHours: burn ? Number(burn) : null, notes: str(formData, 'notes'), itemNotes: notes })).passed;
  } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the QA test.'); }
  done(`/production/units/${id}`, passed ? 'qa_passed' : 'qa_failed', UNIT_LISTS);
}

export async function finishUnitReworkFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await finishUnitRework(id, str(formData, 'notes')); } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the rework.'); }
  done(`/production/units/${id}`, 'rework_done', UNIT_LISTS);
}

export async function approveUnitReworkFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await approveUnitRework(id, str(formData, 'notes')); } catch (err) { fail(`/production/units/${id}`, err, 'Could not approve the rework.'); }
  done(`/production/units/${id}`, 'rework_approved', UNIT_LISTS);
}

export async function packUnitFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await packUnit(id); } catch (err) { fail(`/production/units/${id}`, err, 'Could not record the packing.'); }
  done(`/production/units/${id}`, 'unit_packed', UNIT_LISTS);
}

export async function releaseUnitToStoreFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await releaseUnitToStore(id); } catch (err) { fail(`/production/units/${id}`, err, 'Could not release the unit to the store.'); }
  done(`/production/units/${id}`, 'unit_released', [...UNIT_LISTS, '/production/build-orders']);
}

export async function scrapUnitFormAction(formData: FormData) {
  const id = str(formData, 'unitId');
  try { await scrapUnit(id, str(formData, 'reason')); } catch (err) { fail(`/production/units/${id}`, err, 'Could not scrap the unit.'); }
  done(`/production/units/${id}`, 'unit_scrapped', [...UNIT_LISTS, '/production/build-orders']);
}
