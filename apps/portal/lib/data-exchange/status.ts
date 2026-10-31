/** Data Exchange — how each import status reads on screen, and the six steps. Pure. */
import type { Tone } from '../../components/ui/tones';

export const IMPORT_STATUS: Record<string, { label: string; tone: Tone; step: number }> = {
  UPLOADING: { label: 'Uploading', tone: 'info', step: 1 },
  UPLOADED: { label: 'Match the columns', tone: 'warning', step: 2 },
  VALIDATING: { label: 'Checking', tone: 'info', step: 3 },
  VALIDATED: { label: 'Checked — send for approval', tone: 'warning', step: 3 },
  AWAITING_APPROVAL: { label: 'Waiting for approval', tone: 'warning', step: 4 },
  APPROVED: { label: 'Approved — ready to load', tone: 'info', step: 5 },
  LOADING: { label: 'Loading', tone: 'info', step: 5 },
  PAUSED: { label: 'Paused', tone: 'warning', step: 5 },
  COMPLETED: { label: 'Loaded', tone: 'success', step: 6 },
  UNDOING: { label: 'Undoing', tone: 'warning', step: 6 },
  UNDONE: { label: 'Undone', tone: 'neutral', step: 6 },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', step: 0 },
  FAILED: { label: 'Failed', tone: 'error', step: 0 },
};

export const importStatus = (s: string) => IMPORT_STATUS[s] ?? { label: s, tone: 'neutral' as Tone, step: 0 };

export const IMPORT_STEPS = ['Upload', 'Match columns', 'Check', 'Approve', 'Load', 'Report'] as const;

/** How a staged row ended up, for the row lists and the report file. */
export const ROW_OUTCOME: Record<string, string> = {
  PENDING: 'Not checked yet',
  GOOD: 'Ready to load',
  WARNING: 'Ready to load, with a note',
  REJECTED: 'Rejected',
  DUPLICATE: 'Duplicate in the file',
  CREATED: 'Added',
  UPDATED: 'Filled in an existing record',
  SKIPPED: 'Not added',
  UNDONE: 'Undone',
};
