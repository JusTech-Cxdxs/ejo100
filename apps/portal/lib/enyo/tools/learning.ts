/**
 * Enyo's trained models, as tools: parts to reorder, what customers come in
 * for, and when a vehicle is likely ready. Each runs as the person asking,
 * within their reach, and only when the organisation has the capability at
 * Assist with a model an administrator chose (lib/enyo/ml). Nothing here writes.
 */
import type { ToolResult } from '@ejo/enyo';
import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { complaintThemes, reorderList, shownDuration } from '@/lib/enyo/ml/models';
import { NOT_PERMITTED, type StaffTool } from '../types';

const nothing = (message: string): ToolResult => ({ ok: false, message });
const OFF = 'This capability is not switched on for the organisation (or no model has been chosen yet). Say so; an administrator manages it on the Enyo models page (/enyo/models).';
const lagos = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function orgId(): Promise<string | null> {
  return (await getPrincipal()).organisationId ?? (await myOrganisationId());
}

export const learningTools: StaffTool[] = [
  {
    name: 'parts_to_reorder',
    kind: 'read',
    status: 'Checking which parts need reordering…',
    description: 'Parts in the person\'s branches that are at or below the reorder point Enyo learned from real weekly use, with what is available now, the next four weeks\' expected use and a suggested order quantity. Suggestions only: nobody has ordered anything. Store staff raise orders themselves.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('analytics.inventory.view'))) return NOT_PERMITTED;
      const reach = await reachWhere('analytics.inventory.view');
      const b = reach.branchId;
      const list = await reorderList(await orgId(), b === undefined ? null : typeof b === 'string' ? [b] : b.in);
      if (!list.version) return nothing(OFF);
      const parts = list.rows.slice(0, 30).map((r) => ({ part: r.name, partNumber: r.partNumber, branch: r.branchName, available: r.onHand, reorderPoint: r.reorderPoint, nextFourWeeks: r.forecast4w, suggestedOrder: r.suggestedQuantity, unit: r.unit }));
      return { ok: true, data: { usageCountedUpTo: list.asOf, model: list.version, partsToReorder: list.rows.length, parts, note: 'Suggestions only — nothing has been ordered.' }, sources: [{ label: 'Reorder suggestions', href: '/inventory/reorder' }] };
    },
  },
  {
    name: 'complaint_themes',
    kind: 'read',
    status: 'Looking at what customers come in for…',
    description: 'The recurring themes in what customers bring their vehicles in for (from this organisation\'s finished jobs): each theme\'s main words, its share of all complaints and its count per month for the last 12 months. For managers asking what is common or rising.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('analytics.business.view'))) return NOT_PERMITTED;
      const t = await complaintThemes(await orgId());
      if (!t.version) return nothing(OFF);
      return { ok: true, data: { model: t.version, themes: t.themes.map((x) => ({ theme: x.label, words: x.terms, share: `${Math.round(x.share * 100)}%`, jobs: x.size, byMonth: x.monthly })) }, sources: [{ label: 'Enyo models', href: '/enyo/models' }] };
    },
  },
  {
    name: 'likely_ready_time',
    kind: 'read',
    status: 'Estimating when the vehicle will be ready…',
    description: 'When a Job Card or Vehicle Service (by its number) is likely to be ready for collection, from Enyo\'s job time model: a low, a most likely and a high time. Available once the estimate has its final approval. It is an estimate, not a promise to the customer.',
    parameters: { type: 'object', properties: { job_number: { type: 'string', maxLength: 40, description: 'Job Card (JC-…) or Vehicle Service (SV-…) number.' } }, required: ['job_number'], additionalProperties: false },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return NOT_PERMITTED;
      const n = String(args.job_number ?? '').trim().toUpperCase().slice(0, 40);
      const job = await prisma.jobCard.findUnique({ where: { jobNumber: n }, select: { id: true, branchId: true, readyForCollectionAt: true } });
      const sv = job ? null : await prisma.vehicleService.findUnique({ where: { serviceNumber: n }, select: { id: true, branchId: true, readyForCollectionAt: true } });
      const rec = job ?? sv;
      if (!rec || !(await allows('workshop.job_card.view', { branchId: rec.branchId }))) return nothing('No Job Card or Vehicle Service with that number is available to this person. Say so and ask them to check the number.');
      const href = job ? `/workshop/job-cards/${rec.id}` : `/workshop/vehicle-service/${rec.id}`;
      if (rec.readyForCollectionAt) return { ok: true, data: { record: n, readyAlready: lagos(rec.readyForCollectionAt) }, sources: [{ label: n, href }] };
      const p = await shownDuration({ kind: job ? 'JOB_CARD' : 'SERVICE', id: rec.id }, await orgId());
      if (!p) return nothing(`There is no time estimate for ${n} to show: either the capability is not at Assist, no model is in use, or the estimate has not had its final approval yet. Say which steps remain if asked.`);
      const at = (h: number) => lagos(new Date(new Date(p.openedAt).getTime() + h * 3_600_000));
      return { ok: true, data: { record: n, likely: at(p.p50), earliest: at(p.p10), latest: at(p.p90), model: p.modelVersion, note: 'An estimate from similar finished jobs, not a promise. Confirm with the workshop before telling the customer.' }, sources: [{ label: n, href }] };
    },
  },
];
