'use client';

import { useEffect } from 'react';

/** Tells the menu's mail badge to recount whenever what Mail shows changes (a message read, a refresh). */
export function MailChanged({ signal }: { signal: string }) {
  useEffect(() => { window.dispatchEvent(new Event('ejo:mail-changed')); }, [signal]);
  return null;
}
