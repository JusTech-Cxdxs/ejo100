/** Edge-safe helpers shared by instrumentation, error screens and lib/error-events.ts. */

/** Secrets removed and emails masked: the only form of error text that is logged or stored. */
export function redact(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***@')
    .replace(/\b(bearer|token|apikey|api_key|password|secret|authorization|cookie)\b(["':=\s]+)[^\s"',}]+/gi, '$1$2***')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***jwt***')
    .replace(/(reset-password|set-password|email-verification)[:/][A-Za-z0-9_-]{8,}/gi, '$1:***')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')
    .slice(0, 2000);
}

export function newRef(): string {
  const a = new Uint32Array(2);
  globalThis.crypto.getRandomValues(a);
  return String(1_000_000_000 + (a[0]! % 900_000) * 10_000 + (a[1]! % 10_000));
}
