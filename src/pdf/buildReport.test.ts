import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { emptySummary, type Match, type MatchEvent } from '../domain/types';
import { buildReport, reportFilename } from './buildReport';

const MIN = 60_000;

const match: Match = {
  id: 'm1',
  createdAt: 0,
  updatedAt: 0,
  home: 'SV Musterstadt',
  away: 'FC Beispielheim',
  date: '2026-11-14',
  league: 'Landesliga',
  venue: 'Sportpark Süd',
  sr: 'Max Test',
  sra1: 'Anna Probe',
  sra2: 'Tom Muster',
  withAssistants: true,
  halfLength: 45,
  etLength: 15,
  extraTimeAllowed: false,
  periods: [
    { id: 'H1', startedAt: 0, endedAt: 47 * MIN, pausedMs: 0, offsetMs: 0 },
    { id: 'H2', startedAt: 62 * MIN, endedAt: 111 * MIN, pausedMs: 0, offsetMs: 0 },
  ],
  finished: true,
  summaries: {
    SR: {
      overall: 'Ruhige, souveräne Spielleitung mit klarer Linie in der Zweikampfbewertung.',
      strengths: 'Vorteilsauslegung, Präsenz bei Standards.',
      development: 'Stellungsspiel bei schnellen Gegenangriffen über die rechte Seite.',
    },
    SRA1: { ...emptySummary(), overall: 'Sichere Abseitsbewertung, eine zu frühe Fahne.' },
    SRA2: emptySummary(),
  },
};

let n = 0;
const ev = (p: Partial<MatchEvent>): MatchEvent => ({
  id: `e${++n}`,
  matchId: 'm1',
  createdAt: n,
  type: 'note',
  period: 'H1',
  minute: 1,
  stoppage: 0,
  ...p,
});

const events: MatchEvent[] = [
  ev({ type: 'goal', team: 'H', minute: 12 }),
  ev({ type: 'goal', team: 'G', period: 'H2', minute: 55 }),
  ev({ type: 'goal', team: 'H', period: 'H2', minute: 90, stoppage: 2 }),
  ...Array.from({ length: 7 }, () => ev({ type: 'foul', team: 'H' })),
  ...Array.from({ length: 5 }, () => ev({ type: 'foul', team: 'G', period: 'H2', minute: 60 })),
  ev({ person: 'SR', minute: 8, category: 'Vorteil / VzP', rating: 'pos', text: 'Vorteil nach Foul im Mittelfeld – daraus entsteht eine Torchance.' }),
  ev({ person: 'SR', minute: 23, category: 'Disziplinarkontrolle', rating: 'pos', card: 'Y', team: 'H', playerNo: '4', text: 'Taktisches Foul, „klare“ Verwarnung, gut präsentiert' }),
  ev({ person: 'SR', minute: 31, category: 'Zweikampfbewertung', rating: 'neg', text: 'Halten am Trikot 8G übersehen, verdeckt durch eigene Position.' }),
  ev({ person: 'SR', minute: 45, stoppage: 2, category: 'Lauf- und Stellungsspiel', rating: 'neg', text: 'Bei Konter zu weit weg, kein Seiteneinblick.' }),
  ev({ person: 'SR', period: 'H2', minute: 70, category: 'Disziplinarkontrolle', rating: 'neu', card: 'YR', team: 'H', playerNo: '4' }),
  ev({ person: 'SR', period: 'H2', minute: 77, category: 'Disziplinarkontrolle', rating: 'neg', team: 'G', playerNo: '9', text: 'VW fehlt nach rücksichtslosem Einsteigen' }),
  ev({ person: 'SR', period: 'H2', minute: 82 }),
  ev({ person: 'SRA1', minute: 17, category: 'Abseits', rating: 'pos', text: 'Sehr knappe Situation korrekt laufen gelassen.' }),
  ev({ person: 'SRA1', period: 'H2', minute: 64, category: 'Abseits', rating: 'neg', text: 'Fahne zu früh, kein strafbarer Eingriff' }),
  ev({ person: 'SRA2', period: 'H2', minute: 88, category: 'Eigene alte Kategorie', text: 'Wechsel zügig abgewickelt' }),
];

describe('buildReport', () => {
  it('erzeugt ein mehrseitiges PDF', async () => {
    const { blob, filename } = buildReport(match, events, DEFAULT_SETTINGS);
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    expect(filename).toBe('Beobachtung_2026-11-14_SV-Musterstadt_FC-Beispielheim.pdf');
    // Zum Ansehen: PDF_OUT=/pfad/datei.pdf npm test
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });

  it('kommt mit einem Spiel ohne Einträge und ohne Assistenten zurecht', () => {
    const empty: Match = { ...match, withAssistants: false, periods: [], finished: false, home: '', away: '' };
    const { blob } = buildReport(empty, [], DEFAULT_SETTINGS);
    expect(blob.size).toBeGreaterThan(1000);
    expect(reportFilename(empty)).toBe('Beobachtung_2026-11-14_Team_Team.pdf');
  });
});
