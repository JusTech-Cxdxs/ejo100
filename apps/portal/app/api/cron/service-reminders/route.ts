import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import { setAuditActor } from '@ejo/database';
import { getVehiclesNeedingServiceReminder } from '@/lib/service-reminders-core';

/**
 * Service reminders are sent by a person (Service Tracker, custody or the
 * vehicle page). This route is not scheduled and never sends anything; it
 * only reports how many reminders are due, for monitoring.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!isCronRequest(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  setAuditActor(null, 'cron:service-reminders');
  const due = await getVehiclesNeedingServiceReminder();
  return NextResponse.json({ mode: 'semi-automatic', remindersDue: due.length, sent: 0 });
}
