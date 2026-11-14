import { adjustClock, clockView, endPeriod, reopenPeriod, startPeriod, togglePause } from '../domain/clock';
import { compareEvents } from '../domain/stats';
import {
  emptySummary,
  type Match,
  type MatchEvent,
  type Person,
  type Summary,
  type Team,
} from '../domain/types';
import { db } from './db';

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type MatchInput = Pick<
  Match,
  | 'home'
  | 'away'
  | 'date'
  | 'league'
  | 'venue'
  | 'sr'
  | 'sra1'
  | 'sra2'
  | 'withAssistants'
  | 'halfLength'
  | 'extraTimeAllowed'
>;

export async function createMatch(input: MatchInput): Promise<string> {
  const now = Date.now();
  const match: Match = {
    ...input,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    etLength: 15,
    periods: [],
    finished: false,
    summaries: { SR: emptySummary(), SRA1: emptySummary(), SRA2: emptySummary() },
  };
  await db.matches.add(match);
  return match.id;
}

export async function updateMatch(id: string, patch: Partial<Match>): Promise<void> {
  await db.matches.update(id, { ...patch, updatedAt: Date.now() });
}

/** Ändert genau ein Fazitfeld, ohne parallele Änderungen an anderen Feldern zu überschreiben. */
export async function updateSummary(id: string, person: Person, field: keyof Summary, value: string): Promise<void> {
  await db.matches
    .where('id')
    .equals(id)
    .modify((m) => {
      m.summaries[person][field] = value;
      m.updatedAt = Date.now();
    });
}

export async function deleteMatch(id: string): Promise<void> {
  await db.transaction('rw', db.matches, db.events, async () => {
    await db.events.where('matchId').equals(id).delete();
    await db.matches.delete(id);
  });
}

export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', db.matches, db.events, db.settings, async () => {
    await db.events.clear();
    await db.matches.clear();
    await db.settings.clear();
  });
}

/** Aktueller Stand aus der Datenbank – die Anzeige kann bei schnellen Tipps einen Moment hinterherhinken. */
async function fresh(match: Match): Promise<Match> {
  return (await db.matches.get(match.id)) ?? match;
}

/** Legt ein Ereignis mit der aktuellen Spielminute an. */
export async function addEvent(
  match: Match,
  data: Pick<MatchEvent, 'type'> & Partial<MatchEvent>,
  now = Date.now(),
): Promise<MatchEvent> {
  const cv = clockView(await fresh(match), now);
  const event: MatchEvent = {
    period: cv.period ?? 'H1',
    minute: cv.minute,
    stoppage: cv.stoppage,
    ...data,
    id: uid(),
    matchId: match.id,
    createdAt: now,
  };
  await db.events.add(event);
  return event;
}

export async function updateEvent(id: string, patch: Partial<MatchEvent>): Promise<void> {
  await db.events.update(id, patch);
}

export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

export async function restoreEvent(event: MatchEvent): Promise<void> {
  await db.events.put(event);
}

/** Nimmt das zuletzt gezählte Foul der Mannschaft zurück. */
export async function removeLastFoul(matchId: string, team: Team): Promise<MatchEvent | undefined> {
  const fouls = (await db.events.where('matchId').equals(matchId).toArray())
    .filter((e) => e.type === 'foul' && e.team === team)
    .sort(compareEvents);
  const last = fouls[fouls.length - 1];
  if (last) await db.events.delete(last.id);
  return last;
}

/**
 * Liest und ändert das Spiel in einer Transaktion. So gehen auch sehr schnell
 * aufeinanderfolgende Tipps (z. B. dreimal +1) nicht verloren.
 */
async function mutateMatch(id: string, fn: (m: Match) => Partial<Match>): Promise<void> {
  await db.transaction('rw', db.matches, async () => {
    const m = await db.matches.get(id);
    if (m) await db.matches.update(id, { ...fn(m), updatedAt: Date.now() });
  });
}

export async function kickOff(match: Match): Promise<void> {
  await mutateMatch(match.id, (m) => ({ periods: startPeriod(m, Date.now()), finished: false }));
}

export async function whistleEnd(match: Match): Promise<void> {
  await mutateMatch(match.id, (m) => endPeriod(m, Date.now()));
}

export async function undoWhistle(match: Match): Promise<void> {
  await mutateMatch(match.id, (m) => ({ periods: reopenPeriod(m), finished: false }));
}

/** Entfernt den zuletzt begonnenen Abschnitt wieder (versehentlicher Anpfiff). */
export async function undoKickOff(match: Match): Promise<void> {
  await mutateMatch(match.id, (m) => {
    const last = m.periods[m.periods.length - 1];
    return last && !last.endedAt ? { periods: m.periods.slice(0, -1) } : {};
  });
}

export async function finishMatch(match: Match): Promise<void> {
  await updateMatch(match.id, { finished: true });
}

export async function pauseResume(match: Match): Promise<void> {
  await mutateMatch(match.id, (m) => ({ periods: togglePause(m, Date.now()) }));
}

export async function nudgeClock(match: Match, deltaMs: number): Promise<void> {
  await mutateMatch(match.id, (m) => ({ periods: adjustClock(m, deltaMs, Date.now()) }));
}
