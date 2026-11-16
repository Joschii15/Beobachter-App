export type Person = 'SR' | 'SRA1' | 'SRA2';
export type Team = 'H' | 'G';
export type Rating = 'pos' | 'neg' | 'neu';
export type CardType = 'Y' | 'YR' | 'R';
export type PeriodId = 'H1' | 'H2' | 'ET1' | 'ET2';

/** Ein Spielabschnitt. Die Spielzeit wird aus Zeitstempeln berechnet, nie hochgezählt. */
export interface PeriodState {
  id: PeriodId;
  startedAt: number;
  endedAt?: number;
  /** Summe abgeschlossener Unterbrechungen in ms */
  pausedMs: number;
  /** gesetzt, solange die Uhr angehalten ist */
  pausedAt?: number;
  /** manuelle Korrektur in ms (±1 Minute) */
  offsetMs: number;
}

export interface Summary {
  overall: string;
  strengths: string;
  development: string;
}

export interface Match {
  id: string;
  createdAt: number;
  updatedAt: number;
  home: string;
  away: string;
  date: string; // JJJJ-MM-TT
  league: string;
  venue: string;
  sr: string;
  sra1: string;
  sra2: string;
  withAssistants: boolean;
  halfLength: number;
  etLength: number;
  extraTimeAllowed: boolean;
  periods: PeriodState[];
  finished: boolean;
  summaries: Record<Person, Summary>;
}

export type EventType = 'note' | 'goal' | 'foul';

export interface MatchEvent {
  id: string;
  matchId: string;
  createdAt: number;
  type: EventType;
  period: PeriodId;
  /** laufende Spielminute (37 = 37. Minute); 0 = vor dem Anpfiff */
  minute: number;
  /** Nachspielzeit-Minute, z. B. 2 bei 45+2 */
  stoppage: number;
  /** Exakte Spielzeit in Sekunden auf der durchlaufenden Uhr (10:30 = 630; 2. Halbzeit beginnt bei 45:00) */
  sec?: number;
  /** Allgemeiner Hinweis ohne Zeitbezug */
  general?: boolean;
  person?: Person;
  category?: string;
  rating?: Rating;
  text?: string;
  team?: Team;
  playerNo?: string;
  card?: CardType;
}

export interface Category {
  id: string;
  name: string;
}

export type ThemeSetting = 'auto' | 'light' | 'dark';

export interface Settings {
  categoriesSR: Category[];
  categoriesSRA: Category[];
  defaultHalfLength: number;
  theme: ThemeSetting;
  lastBackupAt: number | null;
}

export const PERSON_LABEL: Record<Person, string> = {
  SR: 'SR',
  SRA1: 'SRA 1',
  SRA2: 'SRA 2',
};

export const CARD_LABEL: Record<CardType, string> = {
  Y: 'Gelb',
  YR: 'Gelb-Rot',
  R: 'Rot',
};

export const emptySummary = (): Summary => ({ overall: '', strengths: '', development: '' });

export function personsOf(match: Pick<Match, 'withAssistants'>): Person[] {
  return match.withAssistants ? ['SR', 'SRA1', 'SRA2'] : ['SR'];
}

export function personName(match: Match, p: Person): string {
  return p === 'SR' ? match.sr : p === 'SRA1' ? match.sra1 : match.sra2;
}
