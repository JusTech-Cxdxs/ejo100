/**
 * Tools: the only way Enyo reaches company data or does anything.
 *
 * Each tool wraps code the app already trusts (a server action or reader that
 * runs the normal permission checks for the signed-in person). A tool never
 * widens access: if the person can't see it on the page, the tool refuses.
 */
import type { ToolSpec } from './llm';

export type Source = { label: string; href?: string };

export type ToolResult =
  | { ok: true; data: unknown; sources?: Source[] }
  | { ok: false; refused?: boolean; message: string };

export type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, JsonSchemaProp>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProp =
  | { type: 'string'; description?: string; enum?: string[]; maxLength?: number; minLength?: number; format?: 'date' | 'date-time' }
  | { type: 'number' | 'integer'; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: JsonSchemaProp; maxItems?: number };

export type Tool<Ctx> = {
  name: string;
  /** What it does and when to use it, written for the model. */
  description: string;
  parameters: JsonSchemaObject;
  /** read: looks things up. draft: prepares something a person confirms. Nothing else exists in version 1. */
  kind: 'read' | 'draft';
  /** Shown to the person while it runs ("Checking the parts list…"). */
  status: string;
  run: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
};

export function toolSpec<Ctx>(t: Tool<Ctx>): ToolSpec {
  return { name: t.name, description: t.description, parameters: t.parameters as unknown as Record<string, unknown> };
}

/** Plain, strict validation of the model's arguments against the tool's schema. */
export function validateArgs(schema: JsonSchemaObject, raw: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: 'Arguments must be an object.' };
  const input = raw as Record<string, unknown>;
  const args: Record<string, unknown> = {};
  for (const name of schema.required ?? []) {
    if (input[name] === undefined || input[name] === null || input[name] === '') return { ok: false, message: `Missing "${name}".` };
  }
  for (const [name, value] of Object.entries(input)) {
    const prop = schema.properties[name];
    if (!prop) {
      if (schema.additionalProperties === false) return { ok: false, message: `Unknown argument "${name}".` };
      continue;
    }
    if (value === undefined || value === null) continue;
    const check = checkProp(name, prop, value);
    if (typeof check === 'string') return { ok: false, message: check };
    args[name] = check.value;
  }
  return { ok: true, args };
}

function checkProp(name: string, prop: JsonSchemaProp, value: unknown): { value: unknown } | string {
  switch (prop.type) {
    case 'string': {
      if (typeof value !== 'string') return `"${name}" must be text.`;
      const v = value.trim();
      if (prop.minLength !== undefined && v.length < prop.minLength) return `"${name}" is too short.`;
      if (v.length > (prop.maxLength ?? 2000)) return `"${name}" is too long.`;
      if (prop.enum && !prop.enum.includes(v)) return `"${name}" must be one of: ${prop.enum.join(', ')}.`;
      if (prop.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `"${name}" must be a date like 2026-10-14.`;
      if (prop.format === 'date-time' && Number.isNaN(Date.parse(v))) return `"${name}" must be a date and time.`;
      return { value: v };
    }
    case 'number':
    case 'integer': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) return `"${name}" must be a number.`;
      if (prop.type === 'integer' && !Number.isInteger(n)) return `"${name}" must be a whole number.`;
      if (prop.minimum !== undefined && n < prop.minimum) return `"${name}" must be at least ${prop.minimum}.`;
      if (prop.maximum !== undefined && n > prop.maximum) return `"${name}" must be at most ${prop.maximum}.`;
      return { value: n };
    }
    case 'boolean':
      if (typeof value === 'boolean') return { value };
      if (value === 'true' || value === 'false') return { value: value === 'true' };
      return `"${name}" must be true or false.`;
    case 'array': {
      if (!Array.isArray(value)) return `"${name}" must be a list.`;
      if (value.length > (prop.maxItems ?? 50)) return `"${name}" has too many items.`;
      const out: unknown[] = [];
      for (const item of value) {
        const c = checkProp(name, prop.items, item);
        if (typeof c === 'string') return c;
        out.push(c.value);
      }
      return { value: out };
    }
  }
}

/** Parses the model's argument string; models sometimes send an empty string for "no arguments". */
export function parseArgs(text: string): unknown {
  const t = text.trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
