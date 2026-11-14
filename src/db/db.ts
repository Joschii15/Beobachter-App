import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import type { Match, MatchEvent, Settings } from '../domain/types';

interface SettingRow {
  key: string;
  value: unknown;
}

/** Alle Daten liegen ausschließlich in der IndexedDB dieses Geräts. */
class AppDB extends Dexie {
  matches!: Table<Match, string>;
  events!: Table<MatchEvent, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('beobachter');
    this.version(1).stores({
      matches: 'id, date',
      events: 'id, matchId',
      settings: 'key',
    });
  }
}

export const db = new AppDB();

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(loadSettings, []);
}

export function useMatches(): Match[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.matches.toArray();
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, []);
}

/** undefined = lädt noch, null = nicht vorhanden */
export function useMatch(id: string): Match | null | undefined {
  return useLiveQuery(async () => (await db.matches.get(id)) ?? null, [id]);
}

export function useEvents(matchId: string): MatchEvent[] | undefined {
  return useLiveQuery(() => db.events.where('matchId').equals(matchId).toArray(), [matchId]);
}

/** Bittet den Browser, die Daten nicht von sich aus zu räumen. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Nicht jeder Browser unterstützt das – die App funktioniert trotzdem.
  }
}
