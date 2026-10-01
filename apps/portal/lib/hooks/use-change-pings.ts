'use client';

import { useEffect, useRef, useState } from 'react';
import { connectChangePings } from '@/lib/realtime-client';

/** Instant "something changed" pings (Supabase Realtime broadcast). Returns
 * whether push is connected; does nothing when the two public Supabase
 * settings are not configured (the regular check carries on). */
export function useChangePings(onPing: () => void): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onPing);
  useEffect(() => { cb.current = onPing; }, [onPing]);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey || typeof WebSocket === 'undefined') return;
    return connectChangePings({ url, anonKey, onPing: () => cb.current(), onState: setConnected });
  }, []);
  return connected;
}
