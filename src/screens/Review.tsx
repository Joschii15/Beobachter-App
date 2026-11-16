import { useCallback, useEffect, useState } from 'react';
import { NoteRow } from '../components/NoteRow';
import { NoteSheet } from '../components/NoteSheet';
import { addEvent, deleteEvent, updateSummary } from '../db/actions';
import { useEvents, useMatch } from '../db/db';
import { eventTime } from '../domain/clock';
import {
  cardEvents,
  foulStats,
  formatFouls,
  goalList,
  isOpenMarker,
  ratingCounts,
  score,
  sortEvents,
} from '../domain/stats';
import {
  CARD_LABEL,
  PERSON_LABEL,
  personName,
  personsOf,
  type Match,
  type Person,
  type Settings,
  type Summary,
} from '../domain/types';
import { openFile, shareFile, downloadFile } from '../lib/files';
import { navigate, useDraft } from '../lib/hooks';
import { formatDate } from './MatchList';

type Tab = Person | 'game';

const SUMMARY_FIELDS: { key: keyof Summary; label: string; hint: string }[] = [
  { key: 'overall', label: 'Gesamteindruck', hint: 'Wie hat er das Spiel insgesamt geleitet?' },
  { key: 'strengths', label: 'Stärken', hint: 'Was soll er beibehalten?' },
  { key: 'development', label: 'Entwicklungsfelder', hint: 'Woran soll er arbeiten?' },
];

function SummaryField({
  match,
  person,
  field,
  label,
  hint,
}: {
  match: Match;
  person: Person;
  field: keyof Summary;
  label: string;
  hint: string;
}) {
  const draft = useDraft(match.summaries[person][field], (v) => void updateSummary(match.id, person, field, v));
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="textarea"
        rows={3}
        placeholder={hint}
        value={draft.value}
        onChange={(e) => draft.onChange(e.target.value)}
        onBlur={draft.flush}
      />
    </label>
  );
}

export function Review({ id, settings }: { id: string; settings: Settings }) {
  const match = useMatch(id);
  const events = useEvents(id);
  const [tab, setTab] = useState<Tab>('SR');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeSheet = useCallback(() => setEditing(null), []);
  const [pdf, setPdf] = useState<typeof import('../pdf/buildReport') | null>(null);

  useEffect(() => {
    // PDF-Baustein vorab laden; der Spielscreen bleibt dadurch schlank
    let alive = true;
    void import('../pdf/buildReport').then((m) => alive && setPdf(m));
    return () => {
      alive = false;
    };
  }, []);

  if (match === undefined || events === undefined) return null;
  if (match === null) {
    return (
      <div className="screen">
        <div className="empty">
          <p>Spiel nicht gefunden.</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/')}>
            Zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  const persons = personsOf(match);
  const s = score(events);
  const ht = score(events, ['H1']);
  const fouls = foulStats(events);
  const cards = cardEvents(events);
  const goals = goalList(events);
  const started = match.periods.length > 0;
  const openCount = events.filter(isOpenMarker).length;

  // Das PDF wird ohne Wartezeit direkt im Tipp erzeugt – sonst blockieren Browser das Öffnen/Teilen.
  const makePdf = async (mode: 'share' | 'open') => {
    if (!pdf) return;
    setBusy(true);
    setError('');
    try {
      const { blob, filename } = pdf.buildReport(match, events, settings);
      if (mode === 'open') openFile(blob);
      else if (!(await shareFile(blob, filename, 'Beobachtung'))) downloadFile(blob, filename);
    } catch (e) {
      console.error(e);
      setError('Das PDF konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  };

  const addManualNote = async (person: Person, general = false) => {
    const e = await addEvent(match, { type: 'note', person, ...(general ? { general: true } : {}) });
    setEditing(e.id);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={() => navigate('/')}>
          ‹ Spiele
        </button>
        <h1 style={{ textAlign: 'center' }}>Nacharbeit</h1>
        <button className="btn ghost" onClick={() => navigate(`/match/${match.id}/edit`)}>
          Spieldaten
        </button>
      </header>

      <main className="content">
        <section className="card">
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {match.home || 'Heim'} – {match.away || 'Gast'}
              </div>
              <div className="small muted">
                {formatDate(match.date)}
                {match.league ? ` · ${match.league}` : ''}
              </div>
            </div>
            {started && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {s.H}:{s.G}
                </div>
                <div className="small muted">
                  ({ht.H}:{ht.G})
                </div>
              </div>
            )}
          </div>
          {!match.finished && (
            <button
              className="btn small block"
              style={{ marginTop: 10 }}
              onClick={() => navigate(`/match/${match.id}/live`)}
            >
              {started ? 'Spiel läuft noch – zum Spielscreen' : 'Zum Spielscreen'}
            </button>
          )}
        </section>

        {openCount > 0 && (
          <div className="notice">
            {openCount === 1 ? 'Ein Marker ist' : `${openCount} Marker sind`} noch offen. Offene Marker erscheinen
            im PDF als „offener Marker“.
          </div>
        )}

        <div className="tabs" role="tablist">
          {persons.map((p) => (
            <button key={p} role="tab" className={`tab ${tab === p ? 'on' : ''}`} onClick={() => setTab(p)}>
              {PERSON_LABEL[p]}
            </button>
          ))}
          <button role="tab" className={`tab ${tab === 'game' ? 'on' : ''}`} onClick={() => setTab('game')}>
            Spielverlauf
          </button>
        </div>

        {tab !== 'game' &&
          (() => {
            const person = tab;
            const all = events.filter((e) => e.type === 'note' && e.person === person);
            const general = all.filter((e) => e.general).sort((a, b) => a.createdAt - b.createdAt);
            const notes = sortEvents(all.filter((e) => !e.general));
            const rc = ratingCounts(all);
            return (
              <>
                <section className="card block" key={`sum-${person}`}>
                  <div className="section-title">
                    Fazit {PERSON_LABEL[person]}
                    {personName(match, person) ? ` · ${personName(match, person)}` : ''}
                  </div>
                  {SUMMARY_FIELDS.map((f) => (
                    <SummaryField
                      key={`${person}-${f.key}`}
                      match={match}
                      person={person}
                      field={f.key}
                      label={f.label}
                      hint={f.hint}
                    />
                  ))}
                </section>

                <div className="row">
                  <div className="section-title" style={{ flex: 1 }}>
                    Allgemeine Hinweise
                  </div>
                  <button className="btn small" onClick={() => addManualNote(person, true)}>
                    + Hinweis
                  </button>
                </div>
                <div className="list">
                  {general.map((e) => (
                    <NoteRow key={e.id} event={e} cfg={match} onClick={() => setEditing(e.id)} />
                  ))}
                  {general.length === 0 && (
                    <p className="small muted">Hinweise ohne Zeitangabe, z. B. zum Auftreten über das ganze Spiel.</p>
                  )}
                </div>

                <div className="row">
                  <div className="section-title" style={{ flex: 1 }}>
                    {notes.length} {notes.length === 1 ? 'Szene' : 'Szenen'} · gesamt +{rc.pos} / –{rc.neg} / ○{rc.neu}
                  </div>
                  <button className="btn small" onClick={() => addManualNote(person)}>
                    + Notiz
                  </button>
                </div>
                <div className="list">
                  {notes.map((e) => (
                    <NoteRow key={e.id} event={e} cfg={match} onClick={() => setEditing(e.id)} />
                  ))}
                  {notes.length === 0 && <p className="small muted">Keine Szenen für {PERSON_LABEL[person]}.</p>}
                </div>
              </>
            );
          })()}

        {tab === 'game' && (
          <>
            <section className="card block">
              <div className="section-title">Fouls</div>
              <dl className="facts">
                <dt>{match.home || 'Heim'}</dt>
                <dd>{formatFouls(fouls.H, true)}</dd>
                <dt>{match.away || 'Gast'}</dt>
                <dd>{formatFouls(fouls.G, true)}</dd>
              </dl>
              <p className="small muted">Gesamt (1. Halbzeit + 2. Halbzeit{match.extraTimeAllowed ? ' + Verlängerung' : ''})</p>
            </section>

            <section className="card block">
              <div className="section-title">Tore</div>
              {goals.length === 0 && <p className="small muted">Keine Tore erfasst.</p>}
              {goals.map(({ event, score: sc }) => (
                <div className="row" key={event.id}>
                  <span style={{ minWidth: 64, fontWeight: 700 }}>{eventTime(match, event)}</span>
                  <span style={{ flex: 1 }}>
                    {sc} · {event.team === 'H' ? match.home || 'Heim' : match.away || 'Gast'}
                  </span>
                  <button
                    className="btn small danger"
                    onClick={() => {
                      if (window.confirm('Dieses Tor löschen?')) void deleteEvent(event.id);
                    }}
                  >
                    Löschen
                  </button>
                </div>
              ))}
            </section>

            <section className="card block">
              <div className="section-title">Karten</div>
              {cards.length === 0 && <p className="small muted">Keine Karten erfasst.</p>}
              {cards.map((e) => (
                <button key={e.id} className="row" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => setEditing(e.id)}>
                  <span style={{ minWidth: 64, fontWeight: 700 }}>{eventTime(match, e)}</span>
                  <span className="pcard">
                    <i className={e.card} />
                    {CARD_LABEL[e.card!]} {e.playerNo || '?'}
                    {e.team}
                  </span>
                </button>
              ))}
              <p className="small muted">Karten werden über einen Disziplinar-Eintrag beim SR erfasst und dort geändert.</p>
            </section>
          </>
        )}

        {error && <div className="notice">{error}</div>}
      </main>

      <footer className="bottombar">
        <button className="btn grow" disabled={busy || !pdf} onClick={() => makePdf('open')}>
          PDF ansehen
        </button>
        <button className="btn primary grow" disabled={busy || !pdf} onClick={() => makePdf('share')}>
          PDF teilen
        </button>
      </footer>

      {editing && (
        <NoteSheet
          match={match}
          events={events}
          settings={settings}
          eventId={editing}
          allowTimeEdit
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
