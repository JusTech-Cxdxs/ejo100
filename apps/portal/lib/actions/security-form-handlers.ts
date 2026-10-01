'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  preRegisterVisit, updateBooking, recordArrival, checkInVisit, receiveVisit, extendVisit, checkOutVisit, cancelVisit,
  createExitPass, decideExitPass, cancelExitPass, exitPassGateOut, exitPassGateIn, confirmVehicleExit,
  extendExitPassReturn, addSecurityFollowUp,
  requestRoadTest, decideRoadTest, cancelRoadTest, roadTestGateOut, roadTestGateIn, extendRoadTest,
  reportIncident, assignIncident, closeIncident, reopenIncident,
  expectDelivery, recordDeliveryArrival, confirmDeliveryReceived, recordDeliveryLeft, cancelDelivery, type DeliveryInput,
  requestContractorPass, decideContractorPass, cancelContractorPass, revokeContractorPass, contractorSignIn, contractorSignOut,
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

/** ID type: a chosen suggestion, or "Other" with the typed name. */
const idTypeOf = (f: FormData) => (str(f, 'idType') === 'OTHER' ? str(f, 'idTypeOther') : str(f, 'idType'));

function visitInput(f: FormData): VisitInput {
  const group = str(f, 'party') === 'GROUP';
  const org = str(f, 'affiliation') === 'ORGANISATION';
  return {
    visitorName: str(f, 'visitorName'),
    partySize: group ? Number(str(f, 'partySize')) : 1,
    memberNames: group ? f.getAll('memberName').map(String) : [],
    company: org ? str(f, 'company') : '',
    phone: str(f, 'phone'),
    idType: idTypeOf(f),
    idNumber: str(f, 'idNumber'),
    vehicleType: str(f, 'vehicleType'),
    plates: f.getAll('plate').map(String),
    purpose: str(f, 'purpose'),
    hostUserId: str(f, 'hostUserId'),
    expectedAt: lagosDate(str(f, 'expectedAt')),
    expectedDurationMinutes: Number(str(f, 'expectedMinutes') || '0'),
    notes: str(f, 'notes'),
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
    if (action === 'check_in') await checkInVisit(id, { vehicleType: str(f, 'vehicleType'), plates: f.getAll('plate').map(String), idType: idTypeOf(f), idNumber: str(f, 'idNumber') });
    else if (action === 'receive') await receiveVisit(id);
    else if (action === 'extend') await extendVisit(id, Number(str(f, 'extraMinutes')), str(f, 'reason'));
    else if (action === 'check_out') await checkOutVisit(id);
    else if (action === 'cancel') await cancelVisit(id, str(f, 'reason'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the visit.');
  }
  // A cancelled booking is removed — go back to the list.
  if (action === 'cancel') ok('/security/visitors', 'booking_cancelled');
  ok(path, action);
}

export async function createExitPassFormAction(f: FormData) {
  const who = str(f, 'who');
  const others = f.getAll('otherName').map(String);
  const employees = f.getAll('employeeIds').map(String).filter(Boolean);
  const leaveAt = str(f, 'leaveWhen') === 'LATER' && str(f, 'leaveTime') ? new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T${str(f, 'leaveTime')}:00+01:00`) : undefined;
  let id = '';
  try {
    if (!who) throw new Error('Choose who is going out.');
    id = (
      await createExitPass({
        reason: str(f, 'reason'),
        returning: str(f, 'returning') === 'yes',
        expectedOutAt: leaveAt,
        expectedDurationMinutes: Number(str(f, 'outHours') || '0') * 60 + Number(str(f, 'outMinutes') || '0'),
        employeeIds: who === 'OTHERS' ? employees : [str(f, 'me'), ...employees],
        others: others.map((n) => ({ name: n })),
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
  const type = raw === 'ExitPass' ? 'ExitPass' : raw === 'RoadTestPermit' ? 'RoadTestPermit' : raw === 'SecurityIncident' ? 'SecurityIncident' : raw === 'GateDelivery' ? 'GateDelivery' : raw === 'ContractorPass' ? 'ContractorPass' : 'Visit';
  const id = str(f, 'entityId');
  const from = str(f, 'returnTo') || (type === 'ExitPass' ? `/security/exit-passes/${id}` : type === 'RoadTestPermit' ? `/security/road-tests/${id}` : type === 'SecurityIncident' ? `/security/incidents/${id}` : type === 'GateDelivery' ? `/security/deliveries/${id}` : type === 'ContractorPass' ? `/security/contractors/${id}` : `/security/visitors/${id}`);
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

export async function updateBookingFormAction(f: FormData) {
  const id = str(f, 'visitId');
  try {
    await updateBooking(id, visitInput(f));
  } catch (err) {
    back(`/security/visitors/${id}/edit`, err, 'Could not save the booking.');
  }
  ok(`/security/visitors/${id}`, 'booking_saved');
}

// ── Incidents ─────────────────────────────────────────────────────────

export async function reportIncidentFormAction(f: FormData) {
  let id = '';
  try {
    id = (await reportIncident({ type: str(f, 'type'), severity: str(f, 'severity'), occurredAt: lagosDate(str(f, 'occurredAt')) ?? new Date(NaN), location: str(f, 'location'), description: str(f, 'description'), peopleInvolved: str(f, 'peopleInvolved'), vehiclePlate: str(f, 'vehiclePlate'), actionTaken: str(f, 'actionTaken'), relatedNumber: str(f, 'relatedNumber') })).id;
  } catch (err) {
    back('/security/incidents/new', err, 'Could not report the incident.');
  }
  ok(`/security/incidents/${id}`, 'reported');
}

export async function incidentActionFormAction(f: FormData) {
  const id = str(f, 'incidentId');
  const action = str(f, 'action');
  const path = `/security/incidents/${id}`;
  try {
    if (action === 'assign') await assignIncident(id, str(f, 'assigneeId'));
    else if (action === 'close') await closeIncident(id, str(f, 'resolution'));
    else if (action === 'reopen') await reopenIncident(id, str(f, 'reason'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the incident.');
  }
  ok(path, action);
}

// ── Deliveries ────────────────────────────────────────────────────────

function deliveryInput(f: FormData): DeliveryInput {
  return { supplierName: str(f, 'supplierName'), reference: str(f, 'reference'), items: str(f, 'items'), expectedAt: lagosDate(str(f, 'expectedAt')), driverName: str(f, 'driverName'), driverPhone: str(f, 'driverPhone'), vehicleType: str(f, 'vehicleType'), vehiclePlate: str(f, 'vehiclePlate'), notes: str(f, 'notes') };
}

export async function registerDeliveryFormAction(f: FormData) {
  const arrived = str(f, 'mode') === 'ARRIVED';
  let id = '';
  try {
    if (!str(f, 'mode')) throw new Error('Choose whether the delivery is at the gate now or expected later.');
    id = (arrived ? await recordDeliveryArrival(deliveryInput(f)) : await expectDelivery(deliveryInput(f))).id;
  } catch (err) {
    back('/security/deliveries/new', err, 'Could not record the delivery.');
  }
  revalidatePath('/security/deliveries');
  ok(`/security/deliveries/${id}`, arrived ? 'arrived' : 'expected');
}

export async function deliveryActionFormAction(f: FormData) {
  const id = str(f, 'deliveryId');
  const action = str(f, 'action');
  const path = `/security/deliveries/${id}`;
  try {
    if (action === 'arrive') await recordDeliveryArrival(deliveryInput(f), id);
    else if (action === 'receive') await confirmDeliveryReceived(id, str(f, 'note'), str(f, 'goodsReceiptId') || undefined);
    else if (action === 'left') await recordDeliveryLeft(id, str(f, 'reason'));
    else if (action === 'cancel') await cancelDelivery(id, str(f, 'reason'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the delivery.');
  }
  revalidatePath('/security/deliveries');
  ok(path, action);
}

// ── Contractors ───────────────────────────────────────────────────────

export async function requestContractorFormAction(f: FormData) {
  const team = str(f, 'party') === 'GROUP';
  let id = '';
  try {
    if (!str(f, 'party')) throw new Error('Choose whether it is one person or a team.');
    id = (await requestContractorPass({ company: str(f, 'company'), work: str(f, 'work'), workArea: str(f, 'workArea'), leadName: str(f, 'leadName'), memberNames: team ? f.getAll('memberName').map(String) : [], phone: str(f, 'phone'), validFrom: str(f, 'validFrom'), validUntil: str(f, 'validUntil'), hostUserId: str(f, 'hostUserId') || undefined })).id;
  } catch (err) {
    back('/security/contractors/new', err, 'Could not request the contractor pass.');
  }
  ok(`/security/contractors/${id}`, 'requested');
}

export async function contractorActionFormAction(f: FormData) {
  const id = str(f, 'passId');
  const action = str(f, 'action');
  const path = str(f, 'returnTo') || `/security/contractors/${id}`;
  try {
    if (action === 'approve') await decideContractorPass(id, true, '');
    else if (action === 'decline') await decideContractorPass(id, false, str(f, 'reason'));
    else if (action === 'cancel') await cancelContractorPass(id, str(f, 'reason'));
    else if (action === 'revoke') await revokeContractorPass(id, str(f, 'reason'));
    else if (action === 'sign_in') await contractorSignIn(id, Number(str(f, 'workersPresent')));
    else if (action === 'sign_out') await contractorSignOut(id, str(f, 'note'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the contractor pass.');
  }
  revalidatePath('/security/contractors');
  ok(path, action);
}
