'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createProject, addProjectMilestone, completeProjectMilestone, addProjectDeliverable, recordProjectDelivery, acceptProjectDeliverable, moveProjectStatus, updateProjectDetails } from './projects';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
function day(formData: FormData, key: string): Date | undefined {
  const v = str(formData, key);
  return v ? new Date(`${v}T12:00:00+01:00`) : undefined;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'projects-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(projectId: string, status: string): never {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  redirect(`/projects/${projectId}?status=${status}`);
}

/** /projects/new → the project page (status=created). */
export async function createProjectFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createProject({
      name: str(formData, 'name'), customerId: str(formData, 'customerId'), kind: str(formData, 'kind'), tenderReference: str(formData, 'tenderReference') || undefined,
      contractValue: str(formData, 'contractValue') ? num(formData, 'contractValue') : 0, startDate: day(formData, 'startDate'), endDate: day(formData, 'endDate'),
      managerId: str(formData, 'managerId'), description: str(formData, 'description') || undefined, status: str(formData, 'status') === 'AWARDED' ? 'AWARDED' : 'TENDER',
    })).id;
  } catch (err) {
    fail('/projects/new', err, 'Could not create the project.');
  }
  done(id, 'created');
}

export async function addProjectMilestoneFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try { await addProjectMilestone(projectId, str(formData, 'name'), day(formData, 'dueDate'), str(formData, 'notes') || undefined); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not add the milestone.'); }
  done(projectId, 'milestone_added');
}

export async function completeProjectMilestoneFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try { await completeProjectMilestone(str(formData, 'milestoneId')); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not complete the milestone.'); }
  done(projectId, 'milestone_completed');
}

export async function addProjectDeliverableFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try { await addProjectDeliverable(projectId, str(formData, 'productId'), Math.round(num(formData, 'quantity')), str(formData, 'configurationId') || undefined, str(formData, 'siteName') || undefined); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not add the deliverable.'); }
  done(projectId, 'deliverable_added');
}

export async function recordProjectDeliveryFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try { await recordProjectDelivery(str(formData, 'deliverableId'), Math.round(num(formData, 'quantity'))); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not record the delivery.'); }
  done(projectId, 'delivery_recorded');
}

export async function acceptProjectDeliverableFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try { await acceptProjectDeliverable(str(formData, 'deliverableId')); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not record the acceptance.'); }
  done(projectId, 'deliverable_accepted');
}

export async function moveProjectStatusFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  const to = str(formData, 'to');
  try { await moveProjectStatus(projectId, to, str(formData, 'note') || undefined); } catch (err) { fail(`/projects/${projectId}`, err, 'Could not move the project.'); }
  done(projectId, `moved_${to.toLowerCase()}`);
}

export async function updateProjectDetailsFormAction(formData: FormData) {
  const projectId = str(formData, 'projectId');
  try {
    await updateProjectDetails(projectId, { contractValue: str(formData, 'contractValue') ? num(formData, 'contractValue') : undefined, tenderReference: str(formData, 'tenderReference'), startDate: day(formData, 'startDate') ?? null, endDate: day(formData, 'endDate') ?? null, description: str(formData, 'description') });
  } catch (err) {
    fail(`/projects/${projectId}?edit=1`, err, 'Could not save the project.');
  }
  done(projectId, 'saved');
}
