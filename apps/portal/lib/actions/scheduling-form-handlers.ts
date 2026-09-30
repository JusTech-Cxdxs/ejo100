'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAppointment, updateAppointment, cancelAppointment, setAppointmentOutcome, saveRoom, setRoomActive, addDelegate, removeDelegate, type AppointmentInput } from './scheduling';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
function back(path: string, err: unknown, fallback: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(err instanceof Error ? err.message : fallback)}`);
}
function ok(path: string, status: string): never {
  revalidatePath('/schedule');
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

/** Date + start time (Lagos) + duration → start and end. */
function input(f: FormData): AppointmentInput {
  const date = str(f, 'date');
  const time = str(f, 'time');
  const startsAt = date && time ? new Date(`${date}T${time}:00+01:00`) : new Date(NaN);
  const duration = Number(str(f, 'duration') || '0');
  const withVisitors = str(f, 'hasVisitors') === 'yes';
  const group = str(f, 'party') === 'GROUP';
  const where = str(f, 'where');
  return {
    ownerId: str(f, 'ownerId'),
    title: str(f, 'title'),
    agenda: str(f, 'agenda'),
    startsAt,
    endsAt: new Date(startsAt.getTime() + duration * 60000),
    roomId: where === 'ROOM' ? str(f, 'roomId') : undefined,
    location: where === 'OFFICE' ? "Host's office" : where === 'OTHER' ? str(f, 'location') : undefined,
    participantIds: f.getAll('participantIds').map(String).filter(Boolean),
    visitors: withVisitors
      ? {
          names: [str(f, 'visitorName'), ...(group ? f.getAll('memberName').map(String) : [])],
          organisation: str(f, 'affiliation') === 'ORGANISATION' ? str(f, 'company') : '',
          phone: str(f, 'phone'),
          purpose: str(f, 'purpose'),
        }
      : undefined,
  };
}

export async function createAppointmentFormAction(f: FormData) {
  let id = '';
  try {
    id = (await createAppointment(input(f))).id;
  } catch (err) {
    back('/schedule/new', err, 'Could not book the appointment.');
  }
  revalidatePath('/security');
  ok(`/schedule/${id}`, 'created');
}

export async function updateAppointmentFormAction(f: FormData) {
  const id = str(f, 'appointmentId');
  try {
    await updateAppointment(id, input(f));
  } catch (err) {
    back(`/schedule/${id}/edit`, err, 'Could not save the appointment.');
  }
  revalidatePath('/security');
  ok(`/schedule/${id}`, 'changed');
}

export async function appointmentActionFormAction(f: FormData) {
  const id = str(f, 'appointmentId');
  const action = str(f, 'action');
  try {
    if (action === 'cancel') await cancelAppointment(id, str(f, 'reason'));
    else if (action === 'complete') await setAppointmentOutcome(id, 'COMPLETED');
    else if (action === 'no_show') await setAppointmentOutcome(id, 'NO_SHOW');
    else throw new Error('Unknown action.');
  } catch (err) {
    back(`/schedule/${id}`, err, 'Could not update the appointment.');
  }
  revalidatePath('/security');
  ok(`/schedule/${id}`, action);
}

export async function saveRoomFormAction(f: FormData) {
  try {
    const cap = str(f, 'capacity');
    await saveRoom({ id: str(f, 'roomId') || undefined, name: str(f, 'name'), location: str(f, 'location'), capacity: cap ? Number(cap) : null });
  } catch (err) {
    back('/schedule/rooms', err, 'Could not save the room.');
  }
  ok('/schedule/rooms', 'room_saved');
}

export async function roomActiveFormAction(f: FormData) {
  try {
    await setRoomActive(str(f, 'roomId'), str(f, 'active') === 'yes');
  } catch (err) {
    back('/schedule/rooms', err, 'Could not update the room.');
  }
  ok('/schedule/rooms', 'room_saved');
}

export async function addDelegateFormAction(f: FormData) {
  try {
    await addDelegate(str(f, 'ownerId'), str(f, 'delegateId'));
  } catch (err) {
    back('/schedule/aides', err, 'Could not add the aide.');
  }
  ok('/schedule/aides', 'aide_added');
}

export async function removeDelegateFormAction(f: FormData) {
  try {
    await removeDelegate(str(f, 'delegationId'));
  } catch (err) {
    back('/schedule/aides', err, 'Could not remove the aide.');
  }
  ok('/schedule/aides', 'aide_removed');
}
