import { eventTime, type ClockConfig } from '../domain/clock';
import { isOpenMarker } from '../domain/stats';
import { CARD_LABEL, PERSON_LABEL, type MatchEvent } from '../domain/types';

export function ratingSign(e: MatchEvent): { sign: string; cls: string } {
  if (e.rating === 'pos') return { sign: '+', cls: 'pos' };
  if (e.rating === 'neg') return { sign: '–', cls: 'neg' };
  return { sign: '○', cls: 'neu' };
}

/** "Gelb 4H" – Karte und Spieler in DFB-Schreibweise */
export function cardTag(e: MatchEvent): string {
  const player = e.team && e.playerNo ? `${e.playerNo}${e.team}` : e.team ? (e.team === 'H' ? 'Heim' : 'Gast') : '';
  return [e.card ? CARD_LABEL[e.card] : '', player].filter(Boolean).join(' ');
}

interface Props {
  event: MatchEvent;
  cfg: ClockConfig;
  showPerson?: boolean;
  clamp?: boolean;
  onClick: () => void;
}

export function NoteRow({ event, cfg, showPerson, clamp, onClick }: Props) {
  const { sign, cls } = ratingSign(event);
  const open = isOpenMarker(event);
  const tag = cardTag(event);
  return (
    <button className={`note-row ${clamp ? 'clamp' : ''}`} onClick={onClick}>
      <span className="min">{eventTime(cfg, event)}</span>
      {showPerson && <span className="who">{PERSON_LABEL[event.person ?? 'SR']}</span>}
      <span className={`sign ${cls}`}>{sign}</span>
      <span className="body">
        {open ? (
          <span className="badge open">offen – antippen zum Ausfüllen</span>
        ) : (
          <>
            {event.category && <span className="cat">{event.category}</span>}
            {tag && <span className="cat">{event.category ? ' · ' : ''}{tag}</span>}
            {event.text?.trim() && (
              <span>
                {event.category || tag ? ': ' : ''}
                {event.text.trim()}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
