import { describe, expect, it } from 'vitest';
import {
  cardCounts,
  foulStats,
  formatFouls,
  goalList,
  hasPriorYellow,
  isOpenMarker,
  playerCards,
  score,
  sortEvents,
} from './stats';
import type { MatchEvent } from './types';

let n = 0;
const ev = (p: Partial<MatchEvent>): MatchEvent => ({
  id: `e${++n}`,
  matchId: 'm',
  createdAt: n,
  type: 'note',
  period: 'H1',
  minute: 1,
  stoppage: 0,
  ...p,
});

describe('Fouls', () => {
  it('zählt je Mannschaft und Halbzeit', () => {
    const events = [
      ev({ type: 'foul', team: 'H', period: 'H1' }),
      ev({ type: 'foul', team: 'H', period: 'H1' }),
      ev({ type: 'foul', team: 'H', period: 'H2' }),
      ev({ type: 'foul', team: 'G', period: 'H2' }),
      ev({ type: 'foul', team: 'G', period: 'ET1' }),
    ];
    const s = foulStats(events);
    expect(s.H).toEqual({ H1: 2, H2: 1, ET: 0, total: 3 });
    expect(s.G).toEqual({ H1: 0, H2: 1, ET: 1, total: 2 });
    expect(formatFouls(s.H, true)).toBe('3 (2+1)');
    expect(formatFouls(s.G, true)).toBe('2 (0+1+1)');
    expect(formatFouls(s.H, false)).toBe('3');
  });
});

describe('Tore', () => {
  it('liefert Spielstand, Halbzeitstand und Torfolge', () => {
    const events = [
      ev({ type: 'goal', team: 'G', period: 'H2', minute: 55 }),
      ev({ type: 'goal', team: 'H', period: 'H1', minute: 12 }),
      ev({ type: 'goal', team: 'H', period: 'H2', minute: 90, stoppage: 2 }),
    ];
    expect(score(events)).toEqual({ H: 2, G: 1 });
    expect(score(events, ['H1'])).toEqual({ H: 1, G: 0 });
    expect(goalList(events).map((g) => g.score)).toEqual(['1:0', '1:1', '2:1']);
  });
});

describe('Karten', () => {
  const events = [
    ev({ card: 'Y', team: 'H', playerNo: '4', minute: 23 }),
    ev({ card: 'Y', team: 'G', playerNo: '4', minute: 30 }),
    ev({ card: 'YR', team: 'H', playerNo: '4', minute: 70, period: 'H2' }),
    ev({ card: 'R', team: 'G', playerNo: '9', minute: 80, period: 'H2' }),
    ev({ category: 'Disziplinarkontrolle', rating: 'neg', text: 'VW fehlt' }),
  ];

  it('zählt nur gezeigte Karten', () => {
    expect(cardCounts(events)).toEqual({
      H: { Y: 1, YR: 1, R: 0 },
      G: { Y: 1, YR: 0, R: 1 },
    });
  });

  it('zeigt je Spieler die höchste Strafe', () => {
    expect(playerCards(events, 'H')).toEqual([{ playerNo: '4', card: 'YR' }]);
    expect(playerCards(events, 'G')).toEqual([
      { playerNo: '4', card: 'Y' },
      { playerNo: '9', card: 'R' },
    ]);
  });

  it('erkennt bereits verwarnte Spieler nur in der eigenen Mannschaft', () => {
    expect(hasPriorYellow(events, 'G', '4')).toBe(true);
    expect(hasPriorYellow(events, 'G', ' 4 ')).toBe(true);
    expect(hasPriorYellow(events, 'G', '7')).toBe(false);
    expect(hasPriorYellow(events, 'G', '')).toBe(false);
    // Der Eintrag selbst zählt nicht als Vorverwarnung
    expect(hasPriorYellow(events, 'G', '4', events[1].id)).toBe(false);
  });
});

describe('Sortierung und offene Marker', () => {
  it('sortiert nach Abschnitt, Minute, Nachspielzeit', () => {
    const a = ev({ period: 'H2', minute: 46 });
    const b = ev({ period: 'H1', minute: 45, stoppage: 2 });
    const c = ev({ period: 'H1', minute: 45 });
    expect(sortEvents([a, b, c]).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it('erkennt Marker ohne Inhalt', () => {
    expect(isOpenMarker(ev({ person: 'SR' }))).toBe(true);
    expect(isOpenMarker(ev({ person: 'SR', text: '  ' }))).toBe(true);
    expect(isOpenMarker(ev({ person: 'SR', rating: 'pos' }))).toBe(false);
    expect(isOpenMarker(ev({ type: 'foul', team: 'H' }))).toBe(false);
  });
});
