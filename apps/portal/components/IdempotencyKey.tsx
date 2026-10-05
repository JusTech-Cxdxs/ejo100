'use client';

import { useState } from 'react';

/**
 * A unique operation id for this form, created once when the form appears and
 * kept on every resubmission. The server stores it with a UNIQUE constraint,
 * so the same payment / refund can never be recorded twice — even if the
 * connection dropped after the first submission succeeded and the person
 * clicks again minutes later.
 */
export function IdempotencyKey() {
  const [key] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`));
  return <input type="hidden" name="idempotencyKey" value={key} />;
}
