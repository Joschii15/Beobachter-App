import type { Match, MatchEvent } from '../domain/types';
import { db, saveSettings } from './db';

interface BackupFile {
  app: 'beobachter';
  version: 1;
  exportedAt: string;
  matches: Match[];
  events: MatchEvent[];
  settings: { key: string; value: unknown }[];
}

export async function buildBackup(): Promise<{ blob: Blob; filename: string }> {
  const data: BackupFile = {
    app: 'beobachter',
    version: 1,
    exportedAt: new Date().toISOString(),
    matches: await db.matches.toArray(),
    events: await db.events.toArray(),
    settings: (await db.settings.toArray()).filter((s) => s.key !== 'lastBackupAt'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return { blob, filename: `beobachter-sicherung-${data.exportedAt.slice(0, 10)}.json` };
}

export async function markBackupDone(): Promise<void> {
  await saveSettings({ lastBackupAt: Date.now() });
}

/** Spielt eine Sicherung ein. Vorhandene Spiele mit gleicher ID werden überschrieben, andere bleiben erhalten. */
export async function importBackup(file: File): Promise<{ matches: number; events: number }> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung.');
  }
  if (data?.app !== 'beobachter' || !Array.isArray(data.matches) || !Array.isArray(data.events)) {
    throw new Error('Die Datei ist keine Sicherung dieser App.');
  }
  await db.transaction('rw', db.matches, db.events, db.settings, async () => {
    await db.matches.bulkPut(data.matches);
    await db.events.bulkPut(data.events);
    if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings);
  });
  return { matches: data.matches.length, events: data.events.length };
}
