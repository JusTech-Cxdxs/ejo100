import { NextRequest, NextResponse } from 'next/server';
import { getVehiclesNeedingServiceReminder, sendServiceReminder } from '@/lib/actions/vehicle-service-reminders';

/**
 * The real, decoupled service-reminder job — same exact real pattern
 * as /api/cron/pricing-alerts: runs entirely on its own schedule,
 * computes what's genuinely true right now with no memory of past
 * runs, and never re-sends anything already logged for the current
 * real prediction cycle. One real email per vehicle per real
 * eligible stage, never a batch of duplicates.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const needing = await getVehiclesNeedingServiceReminder();

  let sent = 0;
  let failed = 0;

  for (const need of needing) {
    try {
      await sendServiceReminder(need);
      sent += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error('Failed to send service reminder', need.vehicleId, err);
    }
  }

  return NextResponse.json({ evaluated: needing.length, sent, failed });
}
