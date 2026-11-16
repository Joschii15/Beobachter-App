import { eventSeconds, PERIOD_ORDER } from './clock';
import type { CardType, MatchEvent, PeriodId, Team } from './types';

export function compareEvents(a: MatchEvent, b: MatchEvent): number {
  return (
    PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period) ||
    eventSeconds(a) - eventSeconds(b) ||
    a.createdAt - b.createdAt
  );
}

export function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort(compareEvents);
}

export interface FoulCount {
  H1: number;
  H2: number;
  ET: number;
  total: number;
}

export function foulStats(events: MatchEvent[]): Record<Team, FoulCount> {
  const out: Record<Team, FoulCount> = {
    H: { H1: 0, H2: 0, ET: 0, total: 0 },
    G: { H1: 0, H2: 0, ET: 0, total: 0 },
  };
  for (const e of events) {
    if (e.type !== 'foul' || !e.team) continue;
    const c = out[e.team];
    if (e.period === 'H1') c.H1++;
    else if (e.period === 'H2') c.H2++;
    else c.ET++;
    c.total++;
  }
  return out;
}

/** "7 (4+3)" – ab der 2. Halbzeit mit Aufschlüsselung, in der Verlängerung "(4+3+1)" */
export function formatFouls(c: FoulCount, showBreakdown: boolean): string {
  if (!showBreakdown) return `${c.total}`;
  const parts = [c.H1, c.H2];
  if (c.ET > 0) parts.push(c.ET);
  return `${c.total} (${parts.join('+')})`;
}

export function score(events: MatchEvent[], periods?: PeriodId[]): Record<Team, number> {
  const out: Record<Team, number> = { H: 0, G: 0 };
  for (const e of events) {
    if (e.type !== 'goal' || !e.team) continue;
    if (periods && !periods.includes(e.period)) continue;
    out[e.team]++;
  }
  return out;
}

/** Tore in zeitlicher Reihenfolge mit dem jeweiligen Zwischenstand ("2:1") */
export function goalList(events: MatchEvent[]): { event: MatchEvent; score: string }[] {
  let h = 0;
  let g = 0;
  return sortEvents(events.filter((e) => e.type === 'goal' && e.team)).map((event) => {
    if (event.team === 'H') h++;
    else g++;
    return { event, score: `${h}:${g}` };
  });
}

export function cardEvents(events: MatchEvent[]): MatchEvent[] {
  return sortEvents(events.filter((e) => e.type === 'note' && e.card && e.team));
}

export function cardCounts(events: MatchEvent[]): Record<Team, Record<CardType, number>> {
  const out: Record<Team, Record<CardType, number>> = {
    H: { Y: 0, YR: 0, R: 0 },
    G: { Y: 0, YR: 0, R: 0 },
  };
  for (const e of cardEvents(events)) out[e.team!][e.card!]++;
  return out;
}

const CARD_RANK: Record<CardType, number> = { Y: 1, YR: 2, R: 3 };

/** Je Spieler die höchste Strafe – für die Anzeige auf dem Spielscreen. */
export function playerCards(events: MatchEvent[], team: Team): { playerNo: string; card: CardType }[] {
  const out: { playerNo: string; card: CardType }[] = [];
  for (const e of cardEvents(events)) {
    if (e.team !== team) continue;
    const no = (e.playerNo ?? '').trim();
    const existing = no ? out.find((x) => x.playerNo === no) : undefined;
    if (existing) {
      if (CARD_RANK[e.card!] > CARD_RANK[existing.card]) existing.card = e.card!;
    } else {
      out.push({ playerNo: no, card: e.card! });
    }
  }
  return out;
}

/** Hat dieser Spieler schon Gelb gesehen? Dann ist ein weiteres Gelb ein Fall für Gelb-Rot. */
export function hasPriorYellow(
  events: MatchEvent[],
  team: Team | undefined,
  playerNo: string | undefined,
  excludeId?: string,
): boolean {
  const no = (playerNo ?? '').trim();
  if (!team || !no) return false;
  return events.some(
    (e) =>
      e.id !== excludeId &&
      e.type === 'note' &&
      e.card === 'Y' &&
      e.team === team &&
      (e.playerNo ?? '').trim() === no,
  );
}

/** Marker, der nur die Minute enthält und noch ausgefüllt werden muss. */
export function isOpenMarker(e: MatchEvent): boolean {
  return e.type === 'note' && !e.category && !e.text?.trim() && !e.rating && !e.card;
}

export function ratingCounts(events: MatchEvent[]): { pos: number; neg: number; neu: number } {
  const out = { pos: 0, neg: 0, neu: 0 };
  for (const e of events) {
    if (e.type !== 'note') continue;
    if (e.rating === 'pos') out.pos++;
    else if (e.rating === 'neg') out.neg++;
    else out.neu++;
  }
  return out;
}
