import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThemeSetting } from '../domain/types';

/** Aktuelle Zeit, solange `active`; zusätzlich sofort neu, wenn die App wieder sichtbar wird. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    document.addEventListener('visibilitychange', tick);
    const timer = active ? window.setInterval(tick, intervalMs) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', tick);
      if (timer) window.clearInterval(timer);
    };
  }, [active, intervalMs]);
  return now;
}

/** Hält den Bildschirm wach; nach Rückkehr in die App wird die Sperre neu angefordert. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        // z. B. Stromsparmodus – dann eben ohne.
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [enabled]);
}

export function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string, replace = false): void {
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
}

export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Textfeld mit lokalem Zustand: Tippen und Diktieren bleiben flüssig,
 * gespeichert wird kurz verzögert sowie beim Verlassen des Feldes.
 */
export function useDraft(
  value: string,
  save: (v: string) => void,
  delay = 400,
): { value: string; onChange: (v: string) => void; flush: () => void } {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const latest = useRef(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Änderungen von außen nur übernehmen, wenn gerade nichts Ungespeichertes vorliegt
    if (!dirty.current) {
      setDraft(value);
      latest.current = value;
    }
  }, [value]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (dirty.current) {
      dirty.current = false;
      saveRef.current(latest.current);
    }
  }, []);

  useEffect(() => flush, [flush]);

  const onChange = useCallback(
    (v: string) => {
      setDraft(v);
      latest.current = v;
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [delay, flush],
  );

  return { value: draft, onChange, flush };
}
