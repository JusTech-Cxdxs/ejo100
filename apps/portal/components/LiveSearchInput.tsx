'use client';

import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * A page's search box that updates the results AS YOU TYPE (after a short
 * pause) without reloading the page: it updates the address in place, keeping
 * every other filter in the same form (tabs, kind, dates…). Enter still works
 * and the address stays shareable.
 */
export function LiveSearchInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'onChange'> & { name?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const name = props.name ?? 'q';
  const onChange = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const params = new URLSearchParams();
      const form = el.form;
      if (form) {
        for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string' && v !== '' && !['cursor', 'limit'].includes(k)) params.set(k, v);
      } else if (el.value) params.set(name, el.value);
      if (!el.value) params.delete(name);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    }, 300);
  };
  return <input {...props} ref={ref} name={name} type={props.type ?? 'search'} autoComplete="off" onChange={onChange} />;
}
