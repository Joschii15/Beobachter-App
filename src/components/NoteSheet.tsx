import { deleteEvent, updateEvent } from '../db/actions';
import { formatMinuteDot, periodBase, periodForMinute, periodLength } from '../domain/clock';
import { DISCIPLINE_ID } from '../domain/defaults';
import { hasPriorYellow } from '../domain/stats';
import {
  CARD_LABEL,
  PERSON_LABEL,
  type CardType,
  type Match,
  type MatchEvent,
  type Rating,
  type Settings,
  type Team,
} from '../domain/types';
import { useDraft } from '../lib/hooks';

interface Props {
  match: Match;
  events: MatchEvent[];
  settings: Settings;
  eventId: string;
  /** In der Nacharbeit lässt sich die Minute korrigieren */
  allowTimeEdit?: boolean;
  onClose: () => void;
}

const RATINGS: { value: Rating; label: string; cls: string }[] = [
  { value: 'pos', label: '+ Positiv', cls: 'pos' },
  { value: 'neu', label: 'Neutral', cls: '' },
  { value: 'neg', label: '– Negativ', cls: 'neg' },
];

const CARDS: { value: CardType; cls: string }[] = [
  { value: 'Y', cls: 'yellow' },
  { value: 'YR', cls: 'yellow' },
  { value: 'R', cls: 'red' },
];

export function NoteSheet({ match, events, settings, eventId, allowTimeEdit, onClose }: Props) {
  // Direkt nach dem Anlegen kann der Eintrag noch einen Moment fehlen – dann einfach abwarten.
  const ev = events.find((e) => e.id === eventId);

  const text = useDraft(ev?.text ?? '', (v) => void updateEvent(eventId, { text: v }));
  const playerNo = useDraft(ev?.playerNo ?? '', (v) => void updateEvent(eventId, { playerNo: v.trim() }), 250);

  if (!ev) return null;

  const cats = ev.person === 'SR' ? settings.categoriesSR : settings.categoriesSRA;
  const selected = cats.find((c) => c.name === ev.category);
  const legacy = ev.category && !selected ? ev.category : null;
  const isDiscipline = ev.person === 'SR' && (selected?.id === DISCIPLINE_ID || !!ev.card);
  const secondYellow = ev.card === 'Y' && hasPriorYellow(events, ev.team, playerNo.value, ev.id);

  const patch = (p: Partial<MatchEvent>) => void updateEvent(ev.id, p);

  const close = () => {
    text.flush();
    playerNo.flush();
    onClose();
  };

  const remove = async () => {
    await deleteEvent(ev.id);
    onClose();
  };

  const setMinute = (minute: number, stoppage: number) => {
    const m = Math.max(0, Math.round(minute) || 0);
    const period = periodForMinute(match, Math.max(1, m));
    const atEnd = m === periodBase(match, period) + periodLength(match, period);
    patch({ minute: m, period, stoppage: atEnd ? Math.max(0, Math.round(stoppage) || 0) : 0 });
  };

  const teamName = (t: Team) => (t === 'H' ? match.home || 'Heim' : match.away || 'Gast');

  return (
    <div className="sheet" role="dialog" aria-modal="true">
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2>
            {PERSON_LABEL[ev.person ?? 'SR']} · {formatMinuteDot(ev.minute, ev.stoppage)}
          </h2>
          <button className="btn ghost danger" onClick={remove}>
            Löschen
          </button>
          <button className="btn primary" onClick={close}>
            Fertig
          </button>
        </header>

        <div className="sheet-body">
          {allowTimeEdit && (
            <div className="block">
              <div className="section-title">Minute</div>
              <div className="row">
                <input
                  className="input"
                  style={{ width: 90 }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={ev.minute || ''}
                  onChange={(e) => setMinute(Number(e.target.value), ev.stoppage)}
                  aria-label="Spielminute"
                />
                <span className="muted">+</span>
                <input
                  className="input"
                  style={{ width: 76 }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={ev.stoppage || ''}
                  onChange={(e) => setMinute(ev.minute, Number(e.target.value))}
                  aria-label="Nachspielzeit"
                  placeholder="0"
                />
                <span className="small muted">Nachspielzeit nur am Ende eines Abschnitts</span>
              </div>
            </div>
          )}

          <div className="segmented">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                className={ev.rating === r.value ? `on ${r.cls}` : ''}
                onClick={() => patch({ rating: ev.rating === r.value ? undefined : r.value })}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="block">
            <div className="section-title">Kategorie</div>
            <div className="chips">
              {cats.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${selected?.id === c.id ? 'on' : ''}`}
                  onClick={() => patch({ category: selected?.id === c.id ? undefined : c.name })}
                >
                  {c.name}
                </button>
              ))}
              {legacy && (
                <button className="chip on" onClick={() => patch({ category: undefined })}>
                  {legacy}
                </button>
              )}
            </div>
          </div>

          {isDiscipline && (
            <div className="block card">
              <div className="section-title">Gezeigte Karte</div>
              <div className="segmented">
                <button className={!ev.card ? 'on' : ''} onClick={() => patch({ card: undefined })}>
                  Keine
                </button>
                {CARDS.map((c) => (
                  <button
                    key={c.value}
                    className={ev.card === c.value ? `on ${c.cls}` : ''}
                    onClick={() => patch({ card: c.value, team: ev.team ?? 'H' })}
                  >
                    {CARD_LABEL[c.value]}
                  </button>
                ))}
              </div>
              <div className="row">
                <div className="segmented" style={{ flex: 1, minWidth: 0 }}>
                  {(['H', 'G'] as Team[]).map((t) => (
                    <button
                      key={t}
                      className={ev.team === t ? 'on' : ''}
                      onClick={() => patch({ team: ev.team === t && !ev.card ? undefined : t })}
                    >
                      {teamName(t)}
                    </button>
                  ))}
                </div>
                <input
                  className="input"
                  style={{ width: 84 }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={3}
                  placeholder="Nr."
                  value={playerNo.value}
                  onChange={(e) => playerNo.onChange(e.target.value.replace(/\D/g, ''))}
                  onBlur={playerNo.flush}
                  aria-label="Spielernummer"
                />
              </div>
              {secondYellow && (
                <div className="notice row">
                  <span style={{ flex: 1 }}>
                    Nr. {playerNo.value} ist bereits verwarnt.
                  </span>
                  <button className="btn small" onClick={() => patch({ card: 'YR' })}>
                    Gelb-Rot
                  </button>
                </div>
              )}
              <p className="small muted">
                Nur gezeigte Karten erscheinen auf dem Spielscreen. Eine fehlende Karte als negative Notiz ohne
                Karte festhalten.
              </p>
            </div>
          )}

          <div className="block">
            <div className="section-title">Notiz</div>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Tippen oder über das Mikrofon der Tastatur diktieren"
              value={text.value}
              onChange={(e) => text.onChange(e.target.value)}
              onBlur={text.flush}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
