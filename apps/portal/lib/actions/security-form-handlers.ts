'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  preRegisterVisit, recordArrival, checkInVisit, receiveVisit, extendVisit, checkOutVisit, cancelVisit,
  createExitPass, decideExitPass, cancelExitPass, exitPassGateOut, exitPassGateIn, confirmVehicleExit,
  type VisitInput,
} from './security';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
/** datetime-local values are Lagos wall-clock time (UTC+1). */
const lagosDate = (v: string): Date | undefined => (v ? new Date(`${v}:00+01:00`) : undefined);
function back(path: string, err: unknown, fallback: string): never {
  const message = err instanceof Error ? err.message : fallback;
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function ok(path: string, status: string): never {
  revalidatePath(path);
  revalidatePath('/security');
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

function visitInput(f: FormData): VisitInput {
  return {
    visitorName: str(f, 'visitorName'), company: str(f, 'company'), phone: str(f, 'phone'), idType: str(f, 'idType'), idNumber: str(f, 'idNumber'),
    vehicleType: str(f, 'vehicleType'), vehiclePlate: str(f, 'vehiclePlate'), purpose: str(f, 'purpose'), hostUserId: str(f, 'hostUserId'),
    expectedAt: lagosDate(str(f, 'expectedAt')), expectedDurationMinutes: Math.round(Number(str(f, 'expectedHours') || '0') * 60 + Number(str(f, 'expectedMinutes') || '0')), notes: str(f, 'notes'),
  };
}

export async function registerVisitFormAction(f: FormData) {
  const arrived = str(f, 'mode') === 'ARRIVED';
  let id = '';
  try {
    id = (arrived ? await recordArrival(visitInput(f)) : await preRegisterVisit(visitInput(f))).id;
  } catch (err) {
    back('/security/visitors', err, 'Could not register the visitor.');
  }
  ok(`/security/visitors/${id}`, arrived ? 'arrived' : 'registered');
}

export async function visitActionFormAction(f: FormData) {
  const id = str(f, 'visitId');
  const action = str(f, 'action');
  const path = `/security/visitors/${id}`;
  try {
    if (action === 'check_in') await checkInVisit(id, str(f, 'vehicleType') || undefined, str(f, 'vehiclePlate') || undefined);
    else if (action === 'receive') await receiveVisit(id);
    else if (action === 'extend') await extendVisit(id, Number(str(f, 'extraMinutes')), str(f, 'reason'));
    else if (action === 'check_out') await checkOutVisit(id);
    else if (action === 'cancel') await cancelVisit(id, str(f, 'reason'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the visit.');
  }
  ok(path, action);
}

export async function createExitPassFormAction(f: FormData) {
  const names = f.getAll('otherName').map(String);
  const roles = f.getAll('otherDesignation').map(String);
  let id = '';
  try {
    id = (
      await createExitPass({
        reason: str(f, 'reason'),
        returning: str(f, 'returning') === 'yes',
        expectedOutAt: lagosDate(str(f, 'expectedOutAt')),
        expectedReturnAt: lagosDate(str(f, 'expectedReturnAt')),
        employeeIds: f.getAll('employeeIds').map(String).filter(Boolean),
        others: names.map((n, i) => ({ name: n, designation: roles[i] ?? '' })),
      })
    ).id;
  } catch (err) {
    back('/security/exit-passes/new', err, 'Could not create the exit pass.');
  }
  ok(`/security/exit-passes/${id}`, 'requested');
}

export async function exitPassActionFormAction(f: FormData) {
  const id = str(f, 'passId');
  const action = str(f, 'action');
  const path = `/security/exit-passes/${id}`;
  try {
    if (action === 'approve') await decideExitPass(id, true, '');
    else if (action === 'decline') await decideExitPass(id, false, str(f, 'reason'));
    else if (action === 'cancel') await cancelExitPass(id, str(f, 'reason'));
    else if (action === 'gate_out') await exitPassGateOut(id);
    else if (action === 'gate_in') await exitPassGateIn(id);
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the exit pass.');
  }
  ok(path, action);
}

export async function confirmVehicleExitFormAction(f: FormData) {
  try {
    await confirmVehicleExit(str(f, 'kind') as 'JOB_CARD' | 'VEHICLE_SERVICE', str(f, 'recordId'), str(f, 'driverName'), str(f, 'notes'));
  } catch (err) {
    back('/security/vehicles', err, 'Could not record the vehicle leaving.');
  }
  ok('/security/vehicles', 'vehicle_out');
}
