import { useCallback, useEffect, useRef, useState } from 'react';
import { NoteRow } from '../components/NoteRow';
import { NoteSheet } from '../components/NoteSheet';
import {
  addEvent,
  deleteEvent,
  finishMatch,
  kickOff,
  nudgeClock,
  pauseResume,
  removeLastFoul,
  restoreEvent,
  undoKickOff,
  undoWhistle,
  whistleEnd,
} from '../db/actions';
import { useEvents, useMatch } from '../db/db';
import {
  clockView,
  formatClock,
  formatMinute,
  nextPeriod,
  PERIOD_LABEL,
  type ClockState,
} from '../domain/clock';
import { foulStats, formatFouls, playerCards, score } from '../domain/stats';
import {
  PERSON_LABEL,
  personName,
  personsOf,
  type Match,
  type MatchEvent,
  type PeriodId,
  type Person,
  type Settings,
  type Team,
} from '../domain/types';
import { navigate, useNow, useWakeLock } from '../lib/hooks';

interface Undo {
  label: string;
  run: () => Promise<void>;
}

const START_LABEL: Record<PeriodId, string> = {
  H1: 'Anpfiff',
  H2: 'Anpfiff 2. Halbzeit',
  ET1: 'Verlängerung anpfeifen',
  ET2: 'Anpfiff 2. Hälfte Verlängerung',
};

function endLabel(match: Match, period: PeriodId): string {
  if (period === 'H1') return 'Halbzeitpfiff';
  if (period === 'H2') return match.extraTimeAllowed ? 'Ende 2. Halbzeit' : 'Abpfiff';
  if (period === 'ET1') return 'Ende 1. Hälfte';
  return 'Abpfiff';
}

function Clock({ match }: { match: Match }) {
  const state = clockView(match, Date.now()).state;
  const now = useNow(state === 'running');
  const cv = clockView(match, now);
  const statusText: Record<ClockState, string> = {
    pre: 'Vor dem Anpfiff',
    running: cv.period ? PERIOD_LABEL[cv.period] : '',
    paused: 'Unterbrochen',
    break: cv.period === 'H1' ? 'Halbzeitpause' : 'Pause',
    finished: 'Spiel beendet',
  };
  return (
    <>
      <div className="period">{statusText[cv.state]}</div>
      <div className={`time ${cv.state === 'paused' ? 'paused' : ''}`}>{formatClock(cv.displaySeconds)}</div>
      <div className="minute">{cv.period ? `${formatMinute(cv.minute, cv.stoppage)}. Minute` : ''}</div>
    </>
  );
}

export function LiveMatch({ id, settings }: { id: string; settings: Settings }) {
  const match = useMatch(id);
  const events = useEvents(id);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [armed, setArmed] = useState(false);
  const undoTimer = useRef<number | undefined>(undefined);
  const armTimer = useRef<number | undefined>(undefined);

  useWakeLock(!!match && !match.finished);

  useEffect(
    () => () => {
      window.clearTimeout(undoTimer.current);
      window.clearTimeout(armTimer.current);
    },
    [],
  );

  const offerUndo = useCallback((u: Undo, ms = 6000) => {
    window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), ms);
  }, []);

  const closeSheet = useCallback(() => setEditing(null), []);

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

  const cv = clockView(match, Date.now());
  const active = cv.state === 'running' || cv.state === 'paused';
  const next = nextPeriod(match);
  const fouls = foulStats(events);
  const goals = score(events);
  const showBreakdown = match.periods.length > 1;
  const persons = personsOf(match);
  const recent = events
    .filter((e) => e.type === 'note')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  const teamName = (t: Team) => (t === 'H' ? match.home || 'Heim' : match.away || 'Gast');

  const logged = (label: string) => async (e: MatchEvent) =>
    offerUndo({ label, run: () => deleteEvent(e.id) });

  const addFoul = (team: Team) => addEvent(match, { type: 'foul', team }).then(logged(`Foul ${teamName(team)}`));
  const addGoal = (team: Team) => addEvent(match, { type: 'goal', team }).then(logged(`Tor ${teamName(team)}`));

  const minusFoul = async (team: Team) => {
    const removed = await removeLastFoul(match.id, team);
    if (removed) offerUndo({ label: `Foul ${teamName(team)} entfernt`, run: () => restoreEvent(removed) });
  };

  const addNote = async (person: Person) => {
    const e = await addEvent(match, { type: 'note', person });
    setEditing(e.id);
  };

  const start = async () => {
    await kickOff(match);
    offerUndo({ label: START_LABEL[next!], run: () => undoKickOff(match) });
  };

  // Abpfiff braucht zwei Tipps, damit er nicht versehentlich ausgelöst wird
  const end = async () => {
    if (!armed) {
      setArmed(true);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    window.clearTimeout(armTimer.current);
    setArmed(false);
    await whistleEnd(match);
    offerUndo({ label: endLabel(match, cv.period!), run: () => undoWhistle(match) }, 10_000);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={() => navigate('/')} aria-label="Zur Spieleliste">
          ‹ Spiele
        </button>
        <h1 style={{ textAlign: 'center', fontSize: 15 }}>
          {teamName('H')} – {teamName('G')}
        </h1>
        <button className="btn ghost" onClick={() => navigate(`/match/${match.id}/review`)}>
          Notizen
        </button>
      </header>

      <div className="live">
        <section className="card clock">
          <Clock match={match} />
          <div className="clock-controls">
            {active && (
              <>
                <button className="btn small" onClick={() => nudgeClock(match, -60_000)} aria-label="Uhr eine Minute zurück">
                  −1
                </button>
                <button className="btn small" onClick={() => nudgeClock(match, 60_000)} aria-label="Uhr eine Minute vor">
                  +1
                </button>
                <button className="btn small grow" onClick={() => pauseResume(match)}>
                  {cv.state === 'paused' ? 'Weiter' : 'Unterbrechen'}
                </button>
                <button className={`btn small end ${armed ? 'armed' : 'danger'}`} onClick={end}>
                  {armed ? 'Sicher? Nochmal tippen' : endLabel(match, cv.period!)}
                </button>
              </>
            )}
            {!active && next && (
              <button className="btn primary grow" onClick={start}>
                {START_LABEL[next]}
              </button>
            )}
            {cv.state === 'break' && next === 'ET1' && (
              <button className="btn grow" onClick={() => finishMatch(match)}>
                Spiel beenden
              </button>
            )}
            {cv.state === 'finished' && (
              <>
                <button className="btn small" onClick={() => undoWhistle(match)}>
                  Abpfiff zurücknehmen
                </button>
                <button className="btn primary grow" onClick={() => navigate(`/match/${match.id}/review`)}>
                  Nacharbeit &amp; PDF
                </button>
              </>
            )}
          </div>
        </section>

        <div className="teams">
          {(['H', 'G'] as Team[]).map((t) => (
            <section key={t} className="card team">
              <div className="team-name">{teamName(t)}</div>
              <div className="score-row">
                <span className="score">{goals[t]}</span>
                <button className="btn small" onClick={() => addGoal(t)}>
                  + Tor
                </button>
              </div>
              <div className="foul-row">
                <button className="foul-minus" onClick={() => minusFoul(t)} aria-label={`Foul ${teamName(t)} abziehen`}>
                  −
                </button>
                <button className="foul-plus" onClick={() => addFoul(t)} aria-label={`Foul ${teamName(t)} zählen`}>
                  <span className="count">{formatFouls(fouls[t], showBreakdown)}</span>
                  <span className="label">+ Foul</span>
                </button>
              </div>
              <div className="cardlist">
                {playerCards(events, t).map((c, i) => (
                  <span key={`${c.playerNo}-${i}`} className="pcard">
                    <i className={c.card} />
                    {c.playerNo || '?'}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="recent">
          {recent.map((e) => (
            <NoteRow key={e.id} event={e} cfg={match} showPerson clamp onClick={() => setEditing(e.id)} />
          ))}
          {recent.length === 0 && (
            <p className="small muted" style={{ textAlign: 'center', padding: 12 }}>
              Ein Tipp auf SR{match.withAssistants ? ', SRA 1 oder SRA 2' : ''} setzt einen Marker mit der aktuellen
              Spielminute.
            </p>
          )}
        </div>
      </div>

      <footer className="persons">
        {undo && (
          <div className="undo" role="status">
            <span>{undo.label}</span>
            <button
              onClick={async () => {
                window.clearTimeout(undoTimer.current);
                setUndo(null);
                await undo.run();
              }}
            >
              Rückgängig
            </button>
          </div>
        )}
        {persons.map((p) => (
          <button key={p} className={`person-btn ${p === 'SR' ? 'sr' : ''}`} onClick={() => addNote(p)}>
            {PERSON_LABEL[p]}
            {personName(match, p) && <small>{personName(match, p)}</small>}
          </button>
        ))}
      </footer>

      {editing && (
        <NoteSheet match={match} events={events} settings={settings} eventId={editing} onClose={closeSheet} />
      )}
    </div>
  );
}
