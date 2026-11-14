import { useLiveQuery } from 'dexie-react-hooks';
import { db, useMatches } from '../db/db';
import { score } from '../domain/stats';
import type { Match, MatchEvent, Settings } from '../domain/types';
import { navigate } from '../lib/hooks';

const BACKUP_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function statusOf(match: Match): { label: string; cls: string } {
  if (match.finished) return { label: 'beendet', cls: '' };
  if (match.periods.length > 0) return { label: 'läuft', cls: 'live' };
  return { label: 'angelegt', cls: 'open' };
}

export function MatchList({ settings }: { settings: Settings }) {
  const matches = useMatches();
  const goals = useLiveQuery(
    () => db.events.filter((e: MatchEvent) => e.type === 'goal').toArray(),
    [],
  );

  const backupDue =
    !!matches?.length &&
    Date.now() - (settings.lastBackupAt ?? Math.min(...matches.map((m) => m.createdAt))) > BACKUP_REMINDER_MS;

  return (
    <div className="screen">
      <header className="topbar">
        <h1>SR-Beobachter</h1>
        <button className="btn ghost" onClick={() => navigate('/settings')}>
          Einstellungen
        </button>
      </header>

      <main className="content">
        {backupDue && (
          <button className="notice" style={{ border: 0, textAlign: 'left' }} onClick={() => navigate('/settings')}>
            Die letzte Sicherung ist älter als 30 Tage. Die Spiele liegen nur auf diesem Gerät – jetzt in den
            Einstellungen sichern.
          </button>
        )}

        {matches && matches.length === 0 && (
          <div className="empty">
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>Noch kein Spiel angelegt</p>
            <p className="small" style={{ marginTop: 6 }}>
              Lege vor dem Anpfiff ein Spiel an. Alle Daten bleiben auf diesem Gerät.
            </p>
          </div>
        )}

        <div className="list">
          {matches?.map((m) => {
            const st = statusOf(m);
            const s = score((goals ?? []).filter((g) => g.matchId === m.id));
            return (
              <button
                key={m.id}
                className="match-item"
                onClick={() => navigate(`/match/${m.id}/${m.finished ? 'review' : 'live'}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">
                    {m.home || 'Heim'} – {m.away || 'Gast'}
                  </div>
                  <div className="small muted">
                    {formatDate(m.date)}
                    {m.league ? ` · ${m.league}` : ''}
                    {m.sr ? ` · SR ${m.sr}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {m.periods.length > 0 && (
                    <div className="result">
                      {s.H}:{s.G}
                    </div>
                  )}
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="bottombar">
        <button className="btn primary block" onClick={() => navigate('/new')}>
          Neues Spiel
        </button>
      </footer>
    </div>
  );
}
