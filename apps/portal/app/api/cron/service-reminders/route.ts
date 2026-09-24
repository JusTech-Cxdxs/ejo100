import { NextRequest, NextResponse } from 'next/server';
import { getVehiclesNeedingServiceReminder } from '@/lib/actions/vehicle-service-reminders';

/**
 * Service reminders are SEMI-AUTOMATIC by design: the system works out
 * which reminders are due, and a person sends them (Service Tracker,
 * custody, or the vehicle page). This route is no longer scheduled
 * (removed from vercel.json) and deliberately never sends anything — it
 * only reports how many reminders are currently due, for monitoring.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const due = await getVehiclesNeedingServiceReminder();
  return NextResponse.json({ mode: 'semi-automatic', remindersDue: due.length, sent: 0 });
}
