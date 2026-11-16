import type { Match, PeriodId, PeriodState } from './types';

export const PERIOD_ORDER: PeriodId[] = ['H1', 'H2', 'ET1', 'ET2'];

export const PERIOD_LABEL: Record<PeriodId, string> = {
  H1: '1. Halbzeit',
  H2: '2. Halbzeit',
  ET1: '1. Hälfte Verlängerung',
  ET2: '2. Hälfte Verlängerung',
};

export interface ClockConfig {
  halfLength: number;
  etLength: number;
}

type ClockMatch = Pick<Match, 'halfLength' | 'etLength' | 'extraTimeAllowed' | 'periods' | 'finished'>;

const MIN = 60_000;

/** Spielminute, mit der der Abschnitt beginnt (0 → erste Minute ist die 1.) */
export function periodBase(cfg: ClockConfig, id: PeriodId): number {
  switch (id) {
    case 'H1':
      return 0;
    case 'H2':
      return cfg.halfLength;
    case 'ET1':
      return 2 * cfg.halfLength;
    case 'ET2':
      return 2 * cfg.halfLength + cfg.etLength;
  }
}

export function periodLength(cfg: ClockConfig, id: PeriodId): number {
  return id === 'H1' || id === 'H2' ? cfg.halfLength : cfg.etLength;
}

export function periodElapsedMs(p: PeriodState, now: number): number {
  const end = p.endedAt ?? p.pausedAt ?? now;
  return Math.max(0, end - p.startedAt - p.pausedMs + p.offsetMs);
}

/** 0:00–0:59 ist die 1. Minute; nach Ablauf der regulären Zeit zählt die Nachspielzeit (45+1 …). */
export function minuteAt(cfg: ClockConfig, id: PeriodId, elapsedMs: number): { minute: number; stoppage: number } {
  const base = periodBase(cfg, id);
  const len = periodLength(cfg, id);
  if (elapsedMs < len * MIN) {
    return { minute: base + Math.floor(elapsedMs / MIN) + 1, stoppage: 0 };
  }
  return { minute: base + len, stoppage: Math.floor((elapsedMs - len * MIN) / MIN) + 1 };
}

export type ClockState = 'pre' | 'running' | 'paused' | 'break' | 'finished';

export interface ClockView {
  state: ClockState;
  period: PeriodId | null;
  minute: number;
  stoppage: number;
  /** Anzeige als durchlaufende Uhr (2. Halbzeit beginnt bei 45:00) */
  displaySeconds: number;
}

export function clockView(match: ClockMatch, now: number): ClockView {
  const p = match.periods[match.periods.length - 1];
  if (!p) return { state: 'pre', period: null, minute: 0, stoppage: 0, displaySeconds: 0 };
  const elapsed = periodElapsedMs(p, now);
  const { minute, stoppage } = minuteAt(match, p.id, elapsed);
  const state: ClockState = p.endedAt
    ? match.finished
      ? 'finished'
      : 'break'
    : p.pausedAt
      ? 'paused'
      : 'running';
  return {
    state,
    period: p.id,
    minute,
    stoppage,
    displaySeconds: periodBase(match, p.id) * 60 + Math.floor(elapsed / 1000),
  };
}

export function nextPeriod(match: ClockMatch): PeriodId | null {
  const last = match.periods[match.periods.length - 1];
  if (!last) return 'H1';
  if (!last.endedAt) return null;
  switch (last.id) {
    case 'H1':
      return 'H2';
    case 'H2':
      return match.extraTimeAllowed ? 'ET1' : null;
    case 'ET1':
      return 'ET2';
    case 'ET2':
      return null;
  }
}

export function startPeriod(match: ClockMatch, now: number): PeriodState[] {
  const id = nextPeriod(match);
  if (!id) return match.periods;
  return [...match.periods, { id, startedAt: now, pausedMs: 0, offsetMs: 0 }];
}

function mapLast(periods: PeriodState[], fn: (p: PeriodState) => PeriodState): PeriodState[] {
  if (periods.length === 0) return periods;
  return [...periods.slice(0, -1), fn(periods[periods.length - 1])];
}

/** Beendet den laufenden Abschnitt. Das Spiel gilt als beendet, wenn kein weiterer Abschnitt folgen kann. */
export function endPeriod(match: ClockMatch, now: number): { periods: PeriodState[]; finished: boolean } {
  const last = match.periods[match.periods.length - 1];
  if (!last || last.endedAt) return { periods: match.periods, finished: match.finished };
  const periods = mapLast(match.periods, (p) => ({
    ...p,
    pausedMs: p.pausedAt ? p.pausedMs + (now - p.pausedAt) : p.pausedMs,
    pausedAt: undefined,
    endedAt: now,
  }));
  const finished = nextPeriod({ ...match, periods }) === null;
  return { periods, finished };
}

/** Nimmt einen versehentlichen Pfiff zurück: Der letzte Abschnitt läuft weiter, als wäre nie gepfiffen worden. */
export function reopenPeriod(match: ClockMatch): PeriodState[] {
  const last = match.periods[match.periods.length - 1];
  if (!last || !last.endedAt) return match.periods;
  return mapLast(match.periods, (p) => ({ ...p, endedAt: undefined }));
}

export function togglePause(match: ClockMatch, now: number): PeriodState[] {
  const last = match.periods[match.periods.length - 1];
  if (!last || last.endedAt) return match.periods;
  return mapLast(match.periods, (p) =>
    p.pausedAt
      ? { ...p, pausedMs: p.pausedMs + (now - p.pausedAt), pausedAt: undefined }
      : { ...p, pausedAt: now },
  );
}

/** Korrigiert die laufende Uhr um deltaMs, ohne unter 0:00 des Abschnitts zu fallen. */
export function adjustClock(match: ClockMatch, deltaMs: number, now: number): PeriodState[] {
  const last = match.periods[match.periods.length - 1];
  if (!last || last.endedAt) return match.periods;
  const elapsed = periodElapsedMs(last, now);
  const delta = Math.max(deltaMs, -elapsed);
  return mapLast(match.periods, (p) => ({ ...p, offsetMs: p.offsetMs + delta }));
}

/** Abschnitt zu einer von Hand eingegebenen Minute (für die Nacharbeit). */
export function periodForMinute(cfg: ClockConfig, minute: number): PeriodId {
  if (minute <= cfg.halfLength) return 'H1';
  if (minute <= 2 * cfg.halfLength) return 'H2';
  if (minute <= 2 * cfg.halfLength + cfg.etLength) return 'ET1';
  return 'ET2';
}

export function formatMinute(minute: number, stoppage: number): string {
  if (minute <= 0) return 'vor';
  return stoppage > 0 ? `${minute}+${stoppage}` : `${minute}`;
}

/** Schreibweise nach DFB-Handbuch: (37.) */
export function formatMinuteDot(minute: number, stoppage: number): string {
  if (minute <= 0) return 'vor Spiel';
  return `${formatMinute(minute, stoppage)}.`;
}

/**
 * Exakte Spielzeit eines Eintrags: "10:30", in der Nachspielzeit "45+1:30".
 * `sec` ist die Zeit auf der durchlaufenden Uhr.
 */
export function formatExact(cfg: ClockConfig, period: PeriodId, sec: number): string {
  const end = (periodBase(cfg, period) + periodLength(cfg, period)) * 60;
  if (sec < end) return formatClock(Math.max(0, sec));
  const over = sec - end;
  return `${end / 60}+${Math.floor(over / 60)}:${String(over % 60).padStart(2, '0')}`;
}

interface Timed {
  period: PeriodId;
  minute: number;
  stoppage: number;
  sec?: number;
  general?: boolean;
}

/** Zeitangabe für Listen und PDF. Ältere Einträge ohne Sekunden zeigen die Spielminute. */
export function eventTime(cfg: ClockConfig, e: Timed): string {
  if (e.general) return 'allg.';
  if (e.sec !== undefined) return formatExact(cfg, e.period, e.sec);
  return formatMinuteDot(e.minute, e.stoppage);
}

/** Position auf der durchlaufenden Uhr – auch für ältere Einträge ohne Sekunden. */
export function eventSeconds(e: Timed): number {
  return e.sec ?? Math.max(0, e.minute - 1 + e.stoppage) * 60;
}

/** Rechnet eine Uhrzeit des Abschnitts in Minute/Nachspielzeit um (für die Korrektur von Hand). */
export function timeFields(
  cfg: ClockConfig,
  period: PeriodId,
  sec: number,
): { period: PeriodId; sec: number; minute: number; stoppage: number } {
  const base = periodBase(cfg, period) * 60;
  const clamped = Math.max(base, Math.round(sec));
  return { period, sec: clamped, ...minuteAt(cfg, period, (clamped - base) * 1000) };
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
