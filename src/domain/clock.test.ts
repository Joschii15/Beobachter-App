import { describe, expect, it } from 'vitest';
import {
  adjustClock,
  clockView,
  endPeriod,
  formatClock,
  formatMinute,
  minuteAt,
  nextPeriod,
  periodForMinute,
  startPeriod,
  togglePause,
} from './clock';
import type { PeriodState } from './types';

const MIN = 60_000;
const cfg = { halfLength: 45, etLength: 15 };
const base = (periods: PeriodState[] = [], extraTimeAllowed = false) => ({
  ...cfg,
  extraTimeAllowed,
  periods,
  finished: false,
});

describe('minuteAt', () => {
  it('zählt die laufende Minute', () => {
    expect(minuteAt(cfg, 'H1', 0)).toEqual({ minute: 1, stoppage: 0 });
    expect(minuteAt(cfg, 'H1', 36 * MIN + 30_000)).toEqual({ minute: 37, stoppage: 0 });
    expect(minuteAt(cfg, 'H1', 45 * MIN - 1)).toEqual({ minute: 45, stoppage: 0 });
  });

  it('zeigt Nachspielzeit als 45+x', () => {
    expect(minuteAt(cfg, 'H1', 45 * MIN)).toEqual({ minute: 45, stoppage: 1 });
    expect(minuteAt(cfg, 'H1', 46 * MIN + 30_000)).toEqual({ minute: 45, stoppage: 2 });
    expect(minuteAt(cfg, 'H2', 47 * MIN + 5_000)).toEqual({ minute: 90, stoppage: 3 });
  });

  it('beginnt die 2. Halbzeit mit der 46. Minute', () => {
    expect(minuteAt(cfg, 'H2', 10_000)).toEqual({ minute: 46, stoppage: 0 });
  });

  it('rechnet die Verlängerung', () => {
    expect(minuteAt(cfg, 'ET1', 0)).toEqual({ minute: 91, stoppage: 0 });
    expect(minuteAt(cfg, 'ET1', 15 * MIN + 20_000)).toEqual({ minute: 105, stoppage: 1 });
    expect(minuteAt(cfg, 'ET2', 14 * MIN)).toEqual({ minute: 120, stoppage: 0 });
  });

  it('berücksichtigt andere Halbzeitlängen', () => {
    const youth = { halfLength: 40, etLength: 15 };
    expect(minuteAt(youth, 'H2', 0)).toEqual({ minute: 41, stoppage: 0 });
    expect(minuteAt(youth, 'H1', 41 * MIN)).toEqual({ minute: 40, stoppage: 2 });
  });
});

describe('Spielablauf', () => {
  it('läuft durch beide Halbzeiten und endet ohne Verlängerung', () => {
    let m = base();
    expect(clockView(m, 0).state).toBe('pre');
    m = { ...m, periods: startPeriod(m, 1000) };
    expect(clockView(m, 1000 + 12 * MIN)).toMatchObject({ state: 'running', period: 'H1', minute: 13 });

    m = { ...m, ...endPeriod(m, 1000 + 47 * MIN) };
    expect(m.finished).toBe(false);
    // In der Pause bleibt die Uhr beim Halbzeitpfiff stehen
    expect(clockView(m, 1000 + 60 * MIN)).toMatchObject({ state: 'break', minute: 45, stoppage: 3 });
    expect(nextPeriod(m)).toBe('H2');

    const t2 = 1000 + 62 * MIN;
    m = { ...m, periods: startPeriod(m, t2) };
    expect(clockView(m, t2 + 30_000)).toMatchObject({ period: 'H2', minute: 46, displaySeconds: 45 * 60 + 30 });

    m = { ...m, ...endPeriod(m, t2 + 49 * MIN) };
    expect(m.finished).toBe(true);
    expect(clockView(m, t2 + 80 * MIN).state).toBe('finished');
    expect(nextPeriod(m)).toBeNull();
  });

  it('erlaubt Verlängerung, wenn eingestellt', () => {
    let m = base([], true);
    m = { ...m, periods: startPeriod(m, 0) };
    m = { ...m, ...endPeriod(m, 45 * MIN) };
    m = { ...m, periods: startPeriod(m, 60 * MIN) };
    m = { ...m, ...endPeriod(m, 106 * MIN) };
    expect(m.finished).toBe(false);
    expect(nextPeriod(m)).toBe('ET1');
    m = { ...m, periods: startPeriod(m, 110 * MIN) };
    expect(clockView(m, 110 * MIN + 15 * MIN + 10_000)).toMatchObject({ minute: 105, stoppage: 1 });
    m = { ...m, ...endPeriod(m, 126 * MIN) };
    m = { ...m, periods: startPeriod(m, 128 * MIN) };
    m = { ...m, ...endPeriod(m, 144 * MIN) };
    expect(m.finished).toBe(true);
  });

  it('hält die Uhr in einer Unterbrechung an', () => {
    let m = base();
    m = { ...m, periods: startPeriod(m, 0) };
    m = { ...m, periods: togglePause(m, 10 * MIN) };
    expect(clockView(m, 25 * MIN)).toMatchObject({ state: 'paused', minute: 11 });
    m = { ...m, periods: togglePause(m, 25 * MIN) };
    expect(clockView(m, 26 * MIN)).toMatchObject({ state: 'running', minute: 12 });
  });

  it('korrigiert die Uhr um eine Minute und fällt nicht unter null', () => {
    let m = base();
    m = { ...m, periods: startPeriod(m, 0) };
    m = { ...m, periods: adjustClock(m, MIN, 30_000) };
    expect(clockView(m, 30_000)).toMatchObject({ minute: 2, displaySeconds: 90 });
    m = { ...m, periods: adjustClock(m, -5 * MIN, 30_000) };
    expect(clockView(m, 30_000)).toMatchObject({ minute: 1, displaySeconds: 0 });
  });

  it('stimmt auch nach langer Zeit im Hintergrund', () => {
    let m = base();
    m = { ...m, periods: startPeriod(m, 5_000) };
    // Kein Tick dazwischen: allein der Zeitstempel zählt
    expect(clockView(m, 5_000 + 33 * MIN + 59_000)).toMatchObject({ minute: 34, displaySeconds: 33 * 60 + 59 });
  });
});

describe('Formatierung', () => {
  it('formatiert Minuten und Uhr', () => {
    expect(formatMinute(37, 0)).toBe('37');
    expect(formatMinute(45, 2)).toBe('45+2');
    expect(formatMinute(0, 0)).toBe('vor');
    expect(formatClock(45 * 60 + 7)).toBe('45:07');
    expect(formatClock(125 * 60)).toBe('125:00');
  });

  it('ordnet eine Minute dem Abschnitt zu', () => {
    expect(periodForMinute(cfg, 45)).toBe('H1');
    expect(periodForMinute(cfg, 46)).toBe('H2');
    expect(periodForMinute(cfg, 91)).toBe('ET1');
    expect(periodForMinute(cfg, 110)).toBe('ET2');
  });
});
