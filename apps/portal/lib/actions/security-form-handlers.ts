'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  preRegisterVisit, recordArrival, checkInVisit, receiveVisit, extendVisit, checkOutVisit, cancelVisit,
  createExitPass, decideExitPass, cancelExitPass, exitPassGateOut, exitPassGateIn, confirmVehicleExit,
  extendExitPassReturn, addSecurityFollowUp,
  requestRoadTest, decideRoadTest, cancelRoadTest, roadTestGateOut, roadTestGateIn, extendRoadTest,
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
  const path = str(f, 'returnTo') || `/security/visitors/${id}`;
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
  const kind = str(f, 'kind') as 'JOB_CARD' | 'VEHICLE_SERVICE';
  const recordId = str(f, 'recordId');
  let id = '';
  try {
    id = (await confirmVehicleExit(kind, recordId, str(f, 'collectedBy'), str(f, 'notes'))).id;
  } catch (err) {
    back(`/security/vehicles/release/${kind === 'JOB_CARD' ? 'job-card' : 'vehicle-service'}/${recordId}`, err, 'Could not record the vehicle leaving.');
  }
  revalidatePath('/security/vehicles');
  ok(`/security/vehicles/exits/${id}`, 'vehicle_out');
}

/** Extend an exit pass's return time; back to where it was done from. */
export async function extendExitPassFormAction(f: FormData) {
  const id = str(f, 'passId');
  const from = str(f, 'returnTo') || `/security/exit-passes/${id}`;
  try {
    await extendExitPassReturn(id, Number(str(f, 'extraMinutes')), str(f, 'reason'));
  } catch (err) {
    back(from, err, 'Could not extend the return time.');
  }
  revalidatePath(`/security/exit-passes/${id}`);
  ok(from, 'extended');
}

/** Follow-up note on a visitor or exit pass. */
export async function securityFollowUpFormAction(f: FormData) {
  const raw = str(f, 'entityType');
  const type = raw === 'ExitPass' ? 'ExitPass' : raw === 'RoadTestPermit' ? 'RoadTestPermit' : 'Visit';
  const id = str(f, 'entityId');
  const from = str(f, 'returnTo') || (type === 'ExitPass' ? `/security/exit-passes/${id}` : type === 'RoadTestPermit' ? `/security/road-tests/${id}` : `/security/visitors/${id}`);
  try {
    await addSecurityFollowUp(type, id, str(f, 'note'));
  } catch (err) {
    back(from, err, 'Could not save the follow-up.');
  }
  ok(from, 'follow_up');
}

// ── Road tests ────────────────────────────────────────────────────────

export async function requestRoadTestFormAction(f: FormData) {
  const jobCardId = str(f, 'jobCardId') || undefined;
  const vehicleServiceId = str(f, 'vehicleServiceId') || undefined;
  let id = '';
  try {
    id = (await requestRoadTest({ jobCardId, vehicleServiceId, driverId: str(f, 'driverId'), purpose: str(f, 'purpose'), route: str(f, 'route'), expectedDurationMinutes: Number(str(f, 'expectedMinutes')) })).id;
  } catch (err) {
    back(`/security/road-tests/new?${jobCardId ? `jobCardId=${jobCardId}` : `vehicleServiceId=${vehicleServiceId}`}`, err, 'Could not request the road test.');
  }
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  if (vehicleServiceId) revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  ok(`/security/road-tests/${id}`, 'requested');
}

export async function roadTestActionFormAction(f: FormData) {
  const id = str(f, 'permitId');
  const action = str(f, 'action');
  const path = str(f, 'returnTo') || `/security/road-tests/${id}`;
  try {
    if (action === 'approve') await decideRoadTest(id, true, '');
    else if (action === 'decline') await decideRoadTest(id, false, str(f, 'reason'));
    else if (action === 'cancel') await cancelRoadTest(id, str(f, 'reason'));
    else if (action === 'gate_out') await roadTestGateOut(id, Number(str(f, 'odometer')));
    else if (action === 'gate_in') await roadTestGateIn(id, Number(str(f, 'odometer')), str(f, 'notes'));
    else if (action === 'extend') await extendRoadTest(id, Number(str(f, 'extraMinutes')), str(f, 'reason'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the road test.');
  }
  revalidatePath(`/security/road-tests/${id}`);
  ok(path, action);
}
