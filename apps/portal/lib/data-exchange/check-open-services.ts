/**
 * Data Exchange — checking one row of the open services and bookings file
 * (P6b): the routine services still in the workshop on the cut-over day,
 * and the bookings already in the diary. Pure, like check.ts; the server
 * part (open-services-server.ts) finds the customer, the vehicle and staff.
 */
import { cellText, phoneKey, vinKey, type Checked, type Issue } from './check';
import { lagosToday, parseDay } from './dates';
import type { Mapping } from './fields';
import { parseKm } from './check-history';

function get(cells: unknown[], mapping: Mapping, key: string): string {
  const i = mapping[key];
  return typeof i === 'number' ? cellText(cells[i]) : '';
}

export type OpenServiceStage = 'SCHEDULED' | 'CHECKED_IN' | 'IN_SERVICE' | 'COMPLETED' | 'READY_FOR_COLLECTION';
export const OPEN_SERVICE_STAGE_WORDS: Record<OpenServiceStage, string> = {
  SCHEDULED: 'Booked', CHECKED_IN: 'Checked in', IN_SERVICE: 'In service', COMPLETED: 'Completed', READY_FOR_COLLECTION: 'Ready for collection',
};

/**
 * The stage, from EJO's words or the old system's: empty, "booked",
 * "scheduled", "appointment", "confirmed" → booked; "checked in",
 * "received", CRTD → checked in; "in service", "in progress", REL → in
 * service; "completed", TECO → completed; "ready" → ready for collection.
 * 'CLOSED' for closed, collected, delivered, cancelled or no-show (history),
 * null for words it does not know.
 */
export function openServiceStage(raw: string): OpenServiceStage | 'CLOSED' | null {
  const k = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return 'SCHEDULED';
  if (/clsd|closed|collected|checkedout|delivered|cancel|cncl|noshow|didnotcome|void/.test(k)) return 'CLOSED';
  if (/ready|forcollection|awaitingcollection|invoiced/.test(k)) return 'READY_FOR_COLLECTION';
  if (/teco|complete|done|finished/.test(k)) return 'COMPLETED';
  if (/inservice|inprogress|^rel|released|wip|working|started|onthebay/.test(k)) return 'IN_SERVICE';
  if (/checkedin|checkin|^crtd|received|arrived|inworkshop/.test(k)) return 'CHECKED_IN';
  if (/book|schedul|appointment|confirmed|expected|reserved|planned|open|new/.test(k)) return 'SCHEDULED';
  return null;
}

/** "09:30", "9.30", "0930", "9:30 am", "14h" → "09:30"; null when not a time of day. */
export function parseTime(raw: string): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm|h)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export type OpenServiceValues = {
  serviceNumber: string;
  customer: { externalId: string | null; phone: string | null; email: string | null };
  vin: string | null;
  vinKey: string | null;
  plate: string | null;
  plateKey: string | null;
  stage: OpenServiceStage;
  /** A booking: the day and time (Lagos), "YYYY-MM-DD" and "HH:MM". */
  bookedFor: { day: string; time: string } | null;
  /** In the workshop: the day it came in. */
  checkedInOn: string | null;
  mileage: number | null;
  complaints: string[];
  supervisor: string | null;
  technician: string | null;
  notes: string | null;
  branch: string | null;
};

export const BOOKING_DEFAULT_TIME = '09:00';

export function checkOpenServiceRow(cells: unknown[], mapping: Mapping, today = lagosToday()): Checked<OpenServiceValues> {
  const issues: Issue[] = [];
  const warn = (field: string, message: string) => issues.push({ field, message, level: 'warning' });
  const fail = (field: string, message: string) => issues.push({ field, message, level: 'error' });

  const serviceNumber = get(cells, mapping, 'serviceNumber').replace(/^0+(?=\d)/, '');
  if (!serviceNumber) fail('serviceNumber', 'Booking or service number is required (SAP AUFNR or QMNUM, or the diary’s booking reference).');
  else if (serviceNumber.length > 40) fail('serviceNumber', 'The booking or service number is longer than 40 characters.');

  const stageRaw = get(cells, mapping, 'status');
  const stage = openServiceStage(stageRaw);
  if (stage === 'CLOSED') fail('status', `Stage “${stageRaw}”: a closed, collected or cancelled service is history (load it with the job card history), not an open one.`);
  else if (!stage) fail('status', `“${stageRaw}” is not a stage EJO knows: use Booked, Checked in, In service, Completed or Ready for collection.`);

  const custExt = get(cells, mapping, 'customerExternalId').replace(/^0+(?=\d)/, '') || null;
  const custPhone = phoneKey(get(cells, mapping, 'customerPhone'));
  const custEmail = get(cells, mapping, 'customerEmail').trim().toLowerCase() || null;
  const vinRaw = get(cells, mapping, 'vin');
  const vk = vinKey(vinRaw);
  if (vk && (vk.length < 6 || vk.length > 25)) fail('vin', `“${vinRaw}” does not look like a chassis number.`);
  const plateRaw = get(cells, mapping, 'plateNumber');
  const plateKey = plateRaw ? plateRaw.toUpperCase().replace(/[\s-]/g, '') : null;
  if (!vk && !plateKey) fail('vin', 'Which vehicle is it? Give the chassis number (VIN) or the plate: the vehicle must be in EJO.');

  let bookedFor: OpenServiceValues['bookedFor'] = null;
  let checkedInOn: string | null = null;
  const bookedRaw = get(cells, mapping, 'bookedFor');
  const timeRaw = get(cells, mapping, 'bookedTime');
  const checkedRaw = get(cells, mapping, 'checkedInOn');
  if (stage === 'SCHEDULED') {
    const day = parseDay(bookedRaw);
    if (!bookedRaw) fail('bookedFor', 'A booking needs its day (Booked for): when is the customer expected?');
    else if (!day) fail('bookedFor', `“${bookedRaw}” is not a date. Write it as 12.11.2026, 12/11/2026, 2026-11-12 or 20261112.`);
    else {
      const time = timeRaw ? parseTime(timeRaw) : null;
      if (timeRaw && !time) warn('bookedTime', `“${timeRaw}” is not a time of day; ${BOOKING_DEFAULT_TIME} is used.`);
      bookedFor = { day, time: time ?? BOOKING_DEFAULT_TIME };
      if (day < today) warn('bookedFor', `Booked for ${day}, a day that has passed: the front desk sees it as a booking whose customer has not come.`);
      else if (Number(day.slice(0, 4)) - Number(today.slice(0, 4)) > 1) warn('bookedFor', `Booked for ${day}: more than a year ahead? Check the date.`);
    }
    if (checkedRaw) warn('checkedInOn', 'A booking has not been checked in yet: the check-in date was left out.');
  } else if (stage) {
    const day = parseDay(checkedRaw || bookedRaw);
    if (!checkedRaw && !bookedRaw) fail('checkedInOn', 'A service in the workshop needs the day it came in (Checked in on, SAP ERDAT).');
    else if (!day) fail('checkedInOn', `“${checkedRaw || bookedRaw}” is not a date. Write it as 30.10.2026, 30/10/2026, 2026-10-30 or 20261030.`);
    else if (day > today) fail('checkedInOn', `Checked in on ${day}, which is in the future: a vehicle in the workshop came in already.`);
    else checkedInOn = day;
  }

  const mileageRaw = get(cells, mapping, 'mileage');
  const mileage = mileageRaw ? parseKm(mileageRaw) : null;
  if (mileageRaw && mileage === null) warn('mileage', `Mileage “${mileageRaw}” is not a number of kilometres, so it was left out.`);
  let complaints = get(cells, mapping, 'complaint').split(/;|\n/).map((x) => x.trim()).filter(Boolean).slice(0, 10).map((x) => x.slice(0, 500));
  if (!complaints.length) { warn('complaint', 'No work requested written: the service reads “Service as booked before EJO.”'); complaints = ['Service as booked before EJO.']; }
  const supervisor = get(cells, mapping, 'supervisor').slice(0, 80) || null;
  const technician = get(cells, mapping, 'technician').slice(0, 80) || null;
  if (technician && stage === 'SCHEDULED') warn('technician', 'A booking has no technician yet: the workshop assigns one when the vehicle arrives.');
  const notes = get(cells, mapping, 'notes').slice(0, 1000) || null;
  const branch = get(cells, mapping, 'branch').slice(0, 80) || null;

  const failed = issues.some((i) => i.level === 'error');
  return {
    status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD',
    issues,
    keys: [serviceNumber ? `svc:${serviceNumber.toUpperCase()}` : '', vk ? `vin:${vk}` : '', plateKey ? `plate:${plateKey}` : ''].filter(Boolean),
    values: failed ? null : {
      serviceNumber, customer: { externalId: custExt, phone: custPhone, email: custEmail }, vin: vk ? vinRaw : null, vinKey: vk, plate: plateKey ? plateRaw : null, plateKey,
      stage: stage as OpenServiceStage, bookedFor, checkedInOn, mileage, complaints, supervisor, technician: stage === 'SCHEDULED' ? null : technician, notes, branch,
    },
  };
}
