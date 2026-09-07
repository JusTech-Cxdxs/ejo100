'use client';

import { useEffect } from 'react';

export function PrintOnLoad() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
