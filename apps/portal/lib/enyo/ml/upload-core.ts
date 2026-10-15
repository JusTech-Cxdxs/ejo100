/**
 * Checks on a model upload from the trainer (POST /api/ml/models), before
 * anything is stored. Pure: tested in tests/enyo-ml.test.ts.
 */
import { ArtifactError, ML_TASKS, LIMITS, validateArtifact, type Artifact, type MlTask } from './artifact-core';

export type ModelUpload = {
  organisation: string;
  task: MlTask;
  version: string;
  algorithm: string;
  metrics: Record<string, unknown>;
  baseline: Record<string, unknown> | null;
  gate: { passed: boolean; reasons: string[] };
  artifact: Artifact;
  artifactBytes: number;
  rows: number;
  dataFrom: Date | null;
  dataTo: Date | null;
  trainer: string;
  trainedAt: Date;
};

export class UploadError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const smallJson = (v: unknown, what: string, max = 50_000): Record<string, unknown> => {
  if (!isObj(v)) throw new UploadError(`${what} must be an object`);
  if (JSON.stringify(v).length > max) throw new UploadError(`${what} is too large`);
  return v;
};
const day = (v: unknown, what: string): Date | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new UploadError(`${what} must be a date (YYYY-MM-DD) or null`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new UploadError(`${what} is not a real date`);
  return d;
};

/** The upload, checked (the artifact too); `rawBytes` is the request body's size. */
export function parseUpload(raw: unknown, rawBytes: number, now = new Date()): ModelUpload {
  if (rawBytes > LIMITS.bytes + 300_000) throw new UploadError('The upload is too large');
  if (!isObj(raw)) throw new UploadError('The upload must be a JSON object');
  const r = raw;
  const organisation = typeof r.organisation === 'string' && /^[a-z0-9-]{1,80}$/.test(r.organisation) ? r.organisation : null;
  if (!organisation) throw new UploadError('organisation must be the organisation slug');
  const task = ML_TASKS.find((t) => t === r.task);
  if (!task) throw new UploadError(`task must be one of ${ML_TASKS.join(', ')}`);
  const version = typeof r.version === 'string' && /^[a-z0-9][a-z0-9-]{7,119}$/.test(r.version) ? r.version : null;
  if (!version) throw new UploadError('version must be 8–120 lower-case letters, digits and hyphens');
  const algorithm = typeof r.algorithm === 'string' && /^[a-z0-9][a-z0-9-]{1,59}$/.test(r.algorithm) ? r.algorithm : null;
  if (!algorithm) throw new UploadError('algorithm must be a short lower-case name');
  const metrics = smallJson(r.metrics, 'metrics');
  const baseline = r.baseline === null || r.baseline === undefined ? null : smallJson(r.baseline, 'baseline');
  const g = smallJson(r.gate, 'gate', 10_000);
  if (typeof g.passed !== 'boolean' || !Array.isArray(g.reasons) || g.reasons.length > 10 || !g.reasons.every((x) => typeof x === 'string' && x.length <= 400)) {
    throw new UploadError('gate must be { passed: boolean, reasons: string[] }');
  }
  let artifact: Artifact;
  try {
    artifact = validateArtifact(task, r.artifact);
  } catch (e) {
    if (e instanceof ArtifactError) throw new UploadError(`The model is not valid: ${e.message}`);
    throw e;
  }
  const artifactBytes = JSON.stringify(artifact).length;
  if (artifactBytes > LIMITS.bytes) throw new UploadError('The model is too large');
  const rows = typeof r.rows === 'number' && Number.isInteger(r.rows) && r.rows >= 0 && r.rows <= 10_000_000 ? r.rows : null;
  if (rows === null) throw new UploadError('rows must be a whole number');
  const trainer = typeof r.trainer === 'string' && r.trainer.length > 0 && r.trainer.length <= 200 ? r.trainer : null;
  if (!trainer) throw new UploadError('trainer must name the trainer and its versions');
  const trainedAt = typeof r.trainedAt === 'string' ? new Date(r.trainedAt) : new Date(Number.NaN);
  if (Number.isNaN(trainedAt.getTime()) || trainedAt.getTime() > now.getTime() + 86_400_000) throw new UploadError('trainedAt must be a date and time, not in the future');
  const dataFrom = day(r.dataFrom, 'dataFrom');
  const dataTo = day(r.dataTo, 'dataTo');
  if (dataFrom && dataTo && dataFrom > dataTo) throw new UploadError('dataFrom must not be after dataTo');
  return {
    organisation, task, version, algorithm, metrics, baseline,
    gate: { passed: g.passed, reasons: g.reasons as string[] }, artifact, artifactBytes, rows, dataFrom, dataTo, trainer, trainedAt,
  };
}
