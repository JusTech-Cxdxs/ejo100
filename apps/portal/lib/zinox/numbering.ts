import 'server-only';
import { prisma } from '@ejo/database';
import { lagosYear } from '@/lib/utils/format-date';

/**
 * Record numbers for the Zinox modules: PREFIX-YYYY-000001, per organisation,
 * from one atomic counter row per prefix and year (document_sequences). Two
 * sales desks confirming orders at the same moment get consecutive numbers;
 * nothing is read-then-written, so a clash cannot happen.
 */
export type DocumentPrefix = 'BLD' | 'UNT' | 'TRF' | 'PRQ' | 'PO' | 'SHP' | 'SCL' | 'QTE' | 'SO' | 'PFI' | 'REL' | 'DSP' | 'INV' | 'RMA' | 'PL' | 'PB' | 'SVC' | 'PRJ';

export async function nextDocumentNumber(prefix: DocumentPrefix, organisationId: string): Promise<string> {
  const year = lagosYear();
  const rows = await prisma.$queryRaw<{ last: number }[]>`
    INSERT INTO "document_sequences" ("organisationId", "prefix", "year", "last")
    VALUES (${organisationId}, ${prefix}, ${year}, 1)
    ON CONFLICT ("organisationId", "prefix", "year") DO UPDATE SET "last" = "document_sequences"."last" + 1
    RETURNING "last"`;
  const n = rows[0]?.last ?? 1;
  return `${prefix}-${year}-${String(n).padStart(6, '0')}`;
}

/** A serial number for a unit built on the line: ZNX + year + line sequence (the label printed at the chassis-close station). */
export async function nextSerialNumber(organisationId: string, familyCode: string): Promise<string> {
  const year = lagosYear();
  const rows = await prisma.$queryRaw<{ last: number }[]>`
    INSERT INTO "document_sequences" ("organisationId", "prefix", "year", "last")
    VALUES (${organisationId}, ${'SN-' + familyCode}, ${year}, 1)
    ON CONFLICT ("organisationId", "prefix", "year") DO UPDATE SET "last" = "document_sequences"."last" + 1
    RETURNING "last"`;
  const n = rows[0]?.last ?? 1;
  return `ZNX${String(year).slice(2)}${familyCode}${String(n).padStart(7, '0')}`;
}
