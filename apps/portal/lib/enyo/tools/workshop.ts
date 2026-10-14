/**
 * Workshop intelligence for Enyo: past fixes for a complaint, and the likely
 * estimate lines for a Job Card or Vehicle Service — from the organisation's
 * own finished jobs (lib/enyo/predict).
 *
 * Both run as the person asking: they only ever name jobs the person may
 * open (reachWhere / allows on 'workshop.job_card.view'), and Store prices
 * come through the Store's own readers. Nothing here writes.
 */
import type { Source, ToolResult } from '@ejo/enyo';
import { prisma } from '@ejo/database';
import { allows, getPrincipal, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { findSimilarJobs, type SimilarScope } from '@/lib/enyo/predict/similar';
import { loadSubject, type Subject } from '@/lib/enyo/predict/lines';
import { suggestionFor } from '@/lib/enyo/predict/suggest';
import type { LineType } from '@/lib/enyo/predict/lines-core';
import { NOT_PERMITTED, type StaffTool } from '../types';

const ok = (data: unknown, sources?: Source[]): ToolResult => (sources?.length ? { ok: true, data, sources } : { ok: true, data });
const nothing = (message: string): ToolResult => ({ ok: false, message });
const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const hrefOf = (kind: 'JOB_CARD' | 'SERVICE', id: string) => (kind === 'JOB_CARD' ? `/workshop/job-cards/${id}` : `/workshop/vehicle-service/${id}`);
const NOT_FOUND = 'No Job Card or Vehicle Service with that number is available to this person (it may not exist, or it is outside what they can see). Say so and ask them to check the number.';
const GENERAL = 'These come from this workshop\'s own finished jobs. If you add general automotive knowledge, say clearly that it is general guidance, not from these records.';

/** A Job Card (JC-…) or Vehicle Service (SV-…) by its number, only when this person may see it. */
async function visibleSubject(number: string): Promise<Subject | null> {
  const n = number.trim().toUpperCase().slice(0, 40);
  if (!n) return null;
  const job = await prisma.jobCard.findUnique({ where: { jobNumber: n }, select: { id: true, branchId: true } });
  if (job) return (await allows('workshop.job_card.view', { branchId: job.branchId })) ? { kind: 'JOB_CARD', id: job.id } : null;
  const sv = await prisma.vehicleService.findUnique({ where: { serviceNumber: n }, select: { id: true, branchId: true } });
  if (sv) return (await allows('workshop.job_card.view', { branchId: sv.branchId })) ? { kind: 'SERVICE', id: sv.id } : null;
  return null;
}

/** The person's reach for Job Cards / Vehicle Services, as a similarity scope. */
async function myScope(): Promise<SimilarScope> {
  const p = await getPrincipal();
  const reach = await reachWhere('workshop.job_card.view');
  const b = reach.branchId;
  const branchIds = b === undefined ? null : typeof b === 'string' ? [b] : b.in;
  return { organisationId: p.organisationId ?? (await myOrganisationId()), branchIds };
}

const lineWords = (l: { type: string; description: string; partTypeName?: string | null; quantity: number }) =>
  `${l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description} × ${l.quantity}`;

export const workshopTools: StaffTool[] = [
  {
    name: 'similar_past_jobs',
    kind: 'read',
    status: 'Looking for similar past jobs…',
    description:
      'Finds this workshop\'s finished Job Cards and Vehicle Services whose complaints are most like a given complaint (or like an existing Job Card / Vehicle Service, by its number), with what was done on each (the final approved estimate lines), how alike they are and links. ' +
      'Use it to help a technician diagnose ("what fixed this last time?"). Only jobs the person can open are returned. Give either a complaint (optionally with the vehicle make, model, year, mileage) or a job number.',
    parameters: {
      type: 'object',
      properties: {
        complaint: { type: 'string', maxLength: 500, description: 'The complaint in the customer\'s words, e.g. "AC not cooling, noise when it starts".' },
        job_number: { type: 'string', maxLength: 40, description: 'A Job Card (JC-2026-000123) or Vehicle Service (SV-2026-000045) number to find jobs like it.' },
        make: { type: 'string', maxLength: 60 },
        model: { type: 'string', maxLength: 60 },
        year: { type: 'integer', minimum: 1950, maximum: 2100 },
        mileage: { type: 'integer', minimum: 0, maximum: 5000000, description: 'Odometer in km.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: 'How many jobs (default 5).' },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return NOT_PERMITTED;
      const number = text(args.job_number, 40);
      let query: { text: string; make: string | null; model: string | null; year: number | null; mileage: number | null; kind?: 'JOB_CARD' | 'SERVICE'; exclude?: Subject } | null = null;
      let basedOn: Record<string, unknown>;
      if (number) {
        const subject = await visibleSubject(number);
        const facts = subject ? await loadSubject(subject) : null;
        if (!subject || !facts) return nothing(NOT_FOUND);
        query = { text: facts.complaint, make: facts.make, model: facts.model, year: facts.year, mileage: facts.mileage, kind: facts.kind, exclude: subject };
        basedOn = { record: facts.number, complaint: facts.complaint.slice(0, 300), vehicle: [facts.make, facts.model, facts.year].filter(Boolean).join(' ') || null };
      } else {
        const complaint = text(args.complaint, 500);
        if (!complaint) return nothing('Give a complaint or a Job Card / Vehicle Service number to compare with.');
        query = { text: complaint, make: text(args.make, 60) || null, model: text(args.model, 60) || null, year: typeof args.year === 'number' ? args.year : null, mileage: typeof args.mileage === 'number' ? args.mileage : null };
        basedOn = { complaint, vehicle: [query.make, query.model, query.year].filter(Boolean).join(' ') || null };
      }
      const limit = typeof args.limit === 'number' ? args.limit : 5;
      const { jobs, considered } = await findSimilarJobs(query, await myScope(), { k: limit });
      if (jobs.length === 0) {
        return ok({ basedOn, jobsCompared: considered, found: 0, message: 'No similar finished jobs were found among the jobs this person can open.', note: GENERAL });
      }
      const items = jobs.map((j) => ({
        number: j.number,
        kind: j.kind === 'JOB_CARD' ? 'Job Card' : 'Vehicle Service',
        alike: pct(j.similarity),
        vehicle: j.vehicleLabel,
        opened: j.createdAt.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }),
        complaint: j.text.slice(0, 200),
        sharedWords: j.shared.slice(0, 6),
        done: j.lines.slice(0, 12).map(lineWords),
        href: hrefOf(j.kind, j.id),
      }));
      return ok({ basedOn, jobsCompared: considered, found: items.length, jobs: items, note: GENERAL }, items.map((i) => ({ label: i.number, href: i.href })));
    },
  },
  {
    name: 'likely_estimate_lines',
    kind: 'read',
    status: 'Working out the likely estimate lines…',
    description:
      'For a Job Card or Vehicle Service (by its number) that the person can see: the estimate lines similar finished jobs usually needed — each with how many similar jobs had it, a confidence, the usual quantity, today\'s Store price and stock for Store parts, and what similar jobs charged for labour — plus the similar jobs behind it. ' +
      'These are suggestions only: nothing is added to the estimate. To use one, the supervisor or technician presses Add on the "Likely lines from similar jobs" card or adds it with the normal form.',
    parameters: {
      type: 'object',
      properties: { job_number: { type: 'string', maxLength: 40, description: 'Job Card (JC-…) or Vehicle Service (SV-…) number.' } },
      required: ['job_number'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('workshop.job_card.view'))) return NOT_PERMITTED;
      const subject = await visibleSubject(text(args.job_number, 40));
      if (!subject) return nothing(NOT_FOUND);
      const current = subject.kind === 'JOB_CARD'
        ? await prisma.estimateLineItem.findMany({ where: { estimate: { jobCardId: subject.id } }, select: { type: true, description: true, partType: { select: { name: true } } } })
        : await prisma.serviceEstimateLineItem.findMany({ where: { estimate: { vehicleServiceId: subject.id } }, select: { type: true, description: true, partType: { select: { name: true } } } });
      const s = await suggestionFor(subject, current.map((l: { type: string; description: string; partType: { name: string } | null }) => ({ type: l.type as LineType, description: l.description, partTypeName: l.partType?.name ?? null })));
      if (!s) return nothing('Estimate suggestions are switched off for this organisation. Say so; an administrator can switch them on in Settings → Enyo.');
      const href = hrefOf(subject.kind, subject.id);
      const evidence = s.evidence.map((e) => ({ number: e.number, alike: pct(e.similarity), vehicle: e.vehicle, complaint: e.complaint.slice(0, 160), href: e.href }));
      if (!s.ok) {
        return ok({ record: s.facts.number, href, suggestions: [], why: s.reason, similarJobs: evidence, similarJobsNotListed: s.hiddenEvidence, note: GENERAL }, [{ label: s.facts.number, href }]);
      }
      let storeToday = 0;
      let storeUnpriced = 0;
      let labourUsual = 0;
      const lines = s.lines.map((l) => {
        const base = { line: l.label, type: l.type, quantity: l.quantity, similarJobs: `${l.support} of ${l.of}`, confidence: pct(l.confidence), alreadyOnEstimate: l.alreadyOnEstimate };
        if (l.type === 'STORE_PART') {
          if (!l.partTypeId) return { ...base, store: 'Not in this branch\'s Store catalogue' };
          if (!l.store || l.store.priceMin === null) { storeUnpriced++; return { ...base, store: l.store?.parts ? 'No selling price set yet' : 'No fitting part in the Store yet' }; }
          if (!l.alreadyOnEstimate) storeToday += l.store.priceMin * l.quantity;
          return { ...base, priceEachToday: l.store.priceMin, priceEachTodayHighest: l.store.priceMax, inStock: l.store.available, lineTotalToday: r2(l.store.priceMin * l.quantity) };
        }
        if (l.type === 'LABOUR' && l.amount && !l.alreadyOnEstimate) labourUsual += l.amount.median;
        return { ...base, usualCharge: l.amount ? l.amount.median : null, usualRange: l.amount ? { from: l.amount.p25, to: l.amount.p75 } : null };
      });
      return ok({
        record: s.facts.number,
        href,
        mode: s.settings.predictionsMode === 'SHADOW' ? 'Trial (shadow) mode: suggestions are being measured and are not yet shown on the estimate page.' : 'Suggest mode: the estimate page shows these suggestions.',
        basedOnSimilarJobs: s.lines[0]?.of ?? evidence.length,
        suggestions: lines,
        totals: {
          storePartsAtTodaysLowestPrice: r2(storeToday),
          storePartsWithoutPrice: storeUnpriced,
          usualLabour: r2(labourUsual),
          note: 'Totals leave out lines already on the estimate.',
        },
        similarJobs: evidence,
        similarJobsNotListed: s.hiddenEvidence,
        note: `Suggestions only — nothing has been added. ${GENERAL}`,
      }, [{ label: s.facts.number, href }, ...evidence.slice(0, 5).map((e) => ({ label: e.number, href: e.href }))]);
    },
  },
];
