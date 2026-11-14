import { useEffect, useState } from 'react';
import { createMatch, deleteMatch, updateMatch, type MatchInput } from '../db/actions';
import { useMatch } from '../db/db';
import type { Settings } from '../domain/types';
import { navigate } from '../lib/hooks';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const HALF_PRESETS = [45, 40, 35, 30];

export function MatchSetup({ settings, editId }: { settings: Settings; editId?: string }) {
  const existing = useMatch(editId ?? '');
  const [form, setForm] = useState<MatchInput>({
    home: '',
    away: '',
    date: today(),
    league: '',
    venue: '',
    sr: '',
    sra1: '',
    sra2: '',
    withAssistants: true,
    halfLength: settings.defaultHalfLength,
    extraTimeAllowed: false,
  });
  const [loaded, setLoaded] = useState(!editId);

  useEffect(() => {
    if (editId && existing && !loaded) {
      const { home, away, date, league, venue, sr, sra1, sra2, withAssistants, halfLength, extraTimeAllowed } =
        existing;
      setForm({ home, away, date, league, venue, sr, sra1, sra2, withAssistants, halfLength, extraTimeAllowed });
      setLoaded(true);
    }
  }, [editId, existing, loaded]);

  const set = <K extends keyof MatchInput>(key: K, value: MatchInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const started = !!existing && existing.periods.length > 0;
  const back = () => navigate(editId ? `/match/${editId}/${existing?.finished ? 'review' : 'live'}` : '/');

  const save = async () => {
    const clean: MatchInput = {
      ...form,
      home: form.home.trim(),
      away: form.away.trim(),
      halfLength: Math.min(60, Math.max(5, Math.round(form.halfLength) || 45)),
    };
    if (editId) {
      await updateMatch(editId, clean);
      back();
    } else {
      const id = await createMatch(clean);
      navigate(`/match/${id}/live`, true);
    }
  };

  const remove = async () => {
    if (!editId) return;
    if (!window.confirm('Dieses Spiel mit allen Notizen endgültig löschen?')) return;
    await deleteMatch(editId);
    navigate('/', true);
  };

  if (editId && existing === null) {
    return (
      <div className="screen">
        <div className="empty">Spiel nicht gefunden.</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={back}>
          Abbrechen
        </button>
        <h1 style={{ textAlign: 'center' }}>{editId ? 'Spieldaten' : 'Neues Spiel'}</h1>
        <button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={save}>
          {editId ? 'Sichern' : 'Anlegen'}
        </button>
      </header>

      <main className="content">
        <div className="card block">
          <div className="section-title">Spiel</div>
          <label className="field">
            <span>Heim</span>
            <input className="input" value={form.home} onChange={(e) => set('home', e.target.value)} autoCapitalize="words" />
          </label>
          <label className="field">
            <span>Gast</span>
            <input className="input" value={form.away} onChange={(e) => set('away', e.target.value)} autoCapitalize="words" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Datum</span>
              <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </label>
            <label className="field">
              <span>Spielklasse</span>
              <input className="input" value={form.league} onChange={(e) => set('league', e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Spielort</span>
            <input className="input" value={form.venue} onChange={(e) => set('venue', e.target.value)} />
          </label>
        </div>

        <div className="card block">
          <div className="section-title">Gespann</div>
          <label className="field">
            <span>Schiedsrichter</span>
            <input className="input" value={form.sr} onChange={(e) => set('sr', e.target.value)} autoCapitalize="words" />
          </label>
          <label className="switch-row">
            <span>Mit neutralen Assistenten</span>
            <input
              type="checkbox"
              checked={form.withAssistants}
              onChange={(e) => set('withAssistants', e.target.checked)}
            />
          </label>
          {form.withAssistants && (
            <>
              <label className="field">
                <span>SRA 1</span>
                <input className="input" value={form.sra1} onChange={(e) => set('sra1', e.target.value)} autoCapitalize="words" />
              </label>
              <label className="field">
                <span>SRA 2</span>
                <input className="input" value={form.sra2} onChange={(e) => set('sra2', e.target.value)} autoCapitalize="words" />
              </label>
            </>
          )}
        </div>

        <div className="card block">
          <div className="section-title">Spielzeit</div>
          <div className="field">
            <span>Halbzeitlänge in Minuten</span>
            <div className="row">
              <div className="segmented" style={{ flex: 1 }}>
                {HALF_PRESETS.map((n) => (
                  <button
                    key={n}
                    className={form.halfLength === n ? 'on' : ''}
                    disabled={started}
                    onClick={() => set('halfLength', n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <input
                className="input"
                style={{ width: 76 }}
                type="number"
                inputMode="numeric"
                min={5}
                max={60}
                disabled={started}
                value={form.halfLength || ''}
                onChange={(e) => set('halfLength', Number(e.target.value))}
                aria-label="Halbzeitlänge frei eingeben"
              />
            </div>
          </div>
          <label className="switch-row">
            <span>Verlängerung möglich (2 × 15)</span>
            <input
              type="checkbox"
              checked={form.extraTimeAllowed}
              onChange={(e) => set('extraTimeAllowed', e.target.checked)}
            />
          </label>
          {started && <p className="small muted">Die Halbzeitlänge lässt sich nach dem Anpfiff nicht mehr ändern.</p>}
        </div>

        {editId && (
          <button className="btn danger" onClick={remove}>
            Spiel löschen
          </button>
        )}
      </main>
    </div>
  );
}
