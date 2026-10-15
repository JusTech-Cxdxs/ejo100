'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Phones: a full-screen chat must fit the part of the screen the person can
 * actually see. When the on-screen keyboard opens, mobile browsers shrink the
 * *visual* viewport but leave `position: fixed; inset: 0` sized to the layout
 * viewport, then scroll the page to keep the text box in view, which pushes
 * the chat's header off the top. This hook follows window.visualViewport and
 * returns the box (top and height) the chat should occupy, and locks the
 * page behind it so only the conversation scrolls.
 *
 * Wider screens (≥ 640 px) get `undefined`: the docked panel is unaffected.
 */
export function useChatViewport(active: boolean, query = '(max-width: 639px)'): CSSProperties | undefined {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') { setBox(null); return; }
    const small = window.matchMedia(query);
    const vv = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!small.matches) { setBox(null); return; }
        setBox(vv ? { top: Math.max(0, vv.offsetTop), height: vv.height } : { top: 0, height: window.innerHeight });
      });
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    small.addEventListener('change', update);

    // Lock the page behind (iOS ignores overflow:hidden on body alone, so pin it).
    const html = document.documentElement;
    const body = document.body;
    const prev = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const lock = small.matches;
    if (lock) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.width = '100%';
    }
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      small.removeEventListener('change', update);
      if (lock) {
        html.style.overflow = prev.htmlOverflow;
        body.style.overflow = prev.bodyOverflow;
        body.style.position = prev.position;
        body.style.top = prev.top;
        body.style.width = prev.width;
        // 'instant': pages with smooth scrolling would otherwise glide down from the top.
        window.scrollTo({ top: scrollY, left: scrollX, behavior: 'instant' as ScrollBehavior });
      }
    };
  }, [active, query]);

  return box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined;
}
