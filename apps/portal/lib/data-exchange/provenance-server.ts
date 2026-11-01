/**
 * "Where this came from" for a record page (server only, never a 'use server'
 * file): created in EJO by whom and when, or brought in by an import (IMP-…,
 * its file, when, who approved it), with the number the other system gave it
 * and its original date there. The import link shows only to people who may
 * open imports. Read inside the record's own organisation.
 */
import { prisma } from '@ejo/database';
import { allows } from '@/lib/authz/server';

export type Provenance = {
  /** ejo: made in EJO 100; sap / legacy: brought in from SAP or an old spreadsheet. */
  source: 'ejo' | 'sap' | 'legacy';
  enteredAt: Date;
  enteredBy: string | null;
  external: { label: string; number: string } | null;
  original: { label: string; date: Date } | null;
  importJob: { id: string; number: string; fileName: string; loadedAt: Date | null; approvedBy: string | null; canOpen: boolean } | null;
};

export async function provenanceOf(input: {
  /** The record's organisation (or its branch's, given as branchId). */
  organisationId?: string | null;
  branchId?: string | null;
  createdAt: Date;
  createdBy: string | null;
  importJobId: string | null;
  externalSource: string | null;
  externalId: string | null;
  /** "customer number", "equipment number", "material number"… */
  numberLabel: string;
  original?: { label: string; date: Date | null } | null;
}): Promise<Provenance> {
  const organisationId = input.organisationId
    ?? (input.branchId ? (await prisma.branch.findUnique({ where: { id: input.branchId }, select: { businessUnit: { select: { organisationId: true } } } }))?.businessUnit.organisationId : null)
    ?? '__none__';
  const job = input.importJobId
    ? await prisma.importJob.findFirst({
        where: { id: input.importJobId, organisationId },
        select: { id: true, number: true, fileName: true, sourceSystem: true, completedAt: true, approvedBy: { select: { fullName: true } } },
      })
    : null;
  const src = (input.externalSource ?? job?.sourceSystem ?? '').toUpperCase();
  const source: Provenance['source'] = job || input.externalSource ? (src.startsWith('LEGACY') ? 'legacy' : 'sap') : 'ejo';
  const sys = source === 'legacy' ? 'Old system' : 'SAP';
  const canOpen = job ? (await allows('dataexchange.import.run')) || (await allows('dataexchange.import.approve')) : false;
  return {
    source,
    enteredAt: input.createdAt,
    enteredBy: input.createdBy,
    external: input.externalId ? { label: `${sys} ${input.numberLabel}`, number: input.externalId } : null,
    original: input.original?.date ? { label: input.original.label, date: input.original.date } : null,
    importJob: job ? { id: job.id, number: job.number, fileName: job.fileName, loadedAt: job.completedAt, approvedBy: job.approvedBy?.fullName ?? null, canOpen } : null,
  };
}
