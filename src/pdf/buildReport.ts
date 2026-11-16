import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput } from 'jspdf-autotable';
import {
  eventTime,
  formatMinuteDot,
  minuteAt,
  PERIOD_LABEL,
  PERIOD_ORDER,
  periodBase,
  periodElapsedMs,
  periodLength,
} from '../domain/clock';
import {
  cardCounts,
  cardEvents,
  foulStats,
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
  type MatchEvent,
  type Person,
  type Settings,
  type Team,
} from '../domain/types';

type RGB = [number, number, number];
const INK: RGB = [20, 24, 27];
const MUTED: RGB = [91, 102, 112];
const GREEN: RGB = [15, 122, 74];
const RED: RGB = [194, 51, 31];
const LIGHT: RGB = [233, 238, 236];
const MARGIN = 15;

/** Die eingebaute PDF-Schrift kennt nur Latin-1 – typografische Zeichen aus dem Diktat werden ersetzt. */
function clean(s: string | undefined): string {
  return (s ?? '')
    .replace(/[–—−]/g, '-')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '')
    .trim();
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function sign(e: MatchEvent): string {
  return e.rating === 'pos' ? '+' : e.rating === 'neg' ? '-' : 'o';
}

function noteText(e: MatchEvent): string {
  if (isOpenMarker(e)) return '(offener Marker)';
  const player = e.team && e.playerNo ? `${e.playerNo}${e.team}` : '';
  const prefix = [e.card ? CARD_LABEL[e.card] : '', player].filter(Boolean).join(' ');
  const text = clean(e.text);
  return [prefix, text].filter(Boolean).join(': ') || '(ohne Text)';
}

function colorSign(data: CellHookData, column: number): void {
  if (data.section !== 'body' || data.column.index !== column || data.cell.colSpan > 1) return;
  const v = String(data.cell.raw ?? '');
  if (v === '+') data.cell.styles.textColor = GREEN;
  else if (v === '-') data.cell.styles.textColor = RED;
  else data.cell.styles.textColor = MUTED;
  data.cell.styles.fontStyle = 'bold';
}

export function reportFilename(match: Match): string {
  const slug = (s: string) =>
    clean(s)
      .replace(/[^A-Za-z0-9À-ÿ]+/g, '-')
      .replace(/^-|-$/g, '') || 'Team';
  return `Beobachtung_${match.date}_${slug(match.home)}_${slug(match.away)}.pdf`;
}

export function buildReport(match: Match, events: MatchEvent[], settings: Settings): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - 2 * MARGIN;
  let y = MARGIN;

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (space: number) => {
    if (y + space > pageH - 18) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const heading = (text: string) => {
    ensure(24);
    doc.setFillColor(...INK);
    doc.rect(MARGIN, y, width, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(clean(text), MARGIN + 3, y + 5.6);
    doc.setTextColor(...INK);
    y += 12;
  };
  const line = (text: string, opts: { bold?: boolean; color?: RGB; size?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 9.5);
    doc.setTextColor(...(opts.color ?? INK));
    const rows = doc.splitTextToSize(clean(text), width) as string[];
    for (const r of rows) {
      ensure(6);
      doc.text(r, MARGIN, y + 3.5);
      y += 4.6;
    }
    doc.setTextColor(...INK);
  };

  const home = clean(match.home) || 'Heim';
  const away = clean(match.away) || 'Gast';
  const teamName = (t: Team) => (t === 'H' ? home : away);
  const persons = personsOf(match);
  const started = match.periods.length > 0;

  // ---------- Kopf ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('BEOBACHTUNG - NOTIZEN FÜR DAS FEEDBACKGESPRÄCH', MARGIN, y + 3);
  y += 8;
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  const title = doc.splitTextToSize(`${home} - ${away}`, width) as string[];
  doc.text(title, MARGIN, y + 5);
  y += title.length * 7.5 + 2;

  const total = score(events);
  const half = score(events, ['H1']);
  const result = started ? `${total.H}:${total.G} (${half.H}:${half.G})${match.finished ? '' : ' - Spiel läuft'}` : '-';

  const meta: RowInput[] = [
    ['Datum', formatDate(match.date), 'Spielklasse', clean(match.league) || '-'],
    ['Spielort', clean(match.venue) || '-', 'Ergebnis', result],
    ['SR', clean(match.sr) || '-', 'Spielzeit', `2 x ${match.halfLength} min${match.periods.some((p) => p.id === 'ET1') ? ' + Verlängerung' : ''}`],
  ];
  if (match.withAssistants) meta.push(['SRA 1', clean(match.sra1) || '-', 'SRA 2', clean(match.sra2) || '-']);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    body: meta,
    styles: { fontSize: 9.5, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 3 }, textColor: INK },
    columnStyles: {
      0: { textColor: MUTED, cellWidth: 22 },
      1: { fontStyle: 'bold', cellWidth: width / 2 - 22 },
      2: { textColor: MUTED, cellWidth: 24 },
      3: { fontStyle: 'bold' },
    },
  });
  y = lastY() + 3;

  const goals = goalList(events);
  if (goals.length) {
    line(`Tore: ${goals.map((g) => `${g.score} (${formatMinuteDot(g.event.minute, g.event.stoppage)})`).join(', ')}`);
    y += 1;
  }

  // ---------- Statistik ----------
  const fouls = foulStats(events);
  const cc = cardCounts(events);
  const hasET = fouls.H.ET + fouls.G.ET > 0 || match.periods.some((p) => p.id === 'ET1');
  const statHead = ['', 'Fouls 1. HZ', 'Fouls 2. HZ', ...(hasET ? ['Fouls Verl.'] : []), 'Fouls ges.', 'Gelb', 'Gelb-Rot', 'Rot'];
  const statRow = (t: Team) => [
    teamName(t),
    fouls[t].H1,
    fouls[t].H2,
    ...(hasET ? [fouls[t].ET] : []),
    fouls[t].total,
    cc[t].Y,
    cc[t].YR,
    cc[t].R,
  ];
  y += 2;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [statHead],
    body: [statRow('H'), statRow('G')],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center', cellPadding: 1.8, textColor: INK, lineColor: [200, 208, 204] },
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
  });
  y = lastY() + 3;

  const cards = cardEvents(events);
  if (cards.length) {
    line(
      `Karten: ${cards
        .map((c) => `(${formatMinuteDot(c.minute, c.stoppage)}) ${CARD_LABEL[c.card!]} ${c.playerNo || '?'}${c.team}`)
        .join('; ')}`,
    );
  }
  y += 3;

  // ---------- Foulspiele im Zeitverlauf ----------
  const foulEvents = sortEvents(events.filter((e) => e.type === 'foul' && e.team));
  if (foulEvents.length) {
    const STEP = 15;
    const rows: RowInput[] = [];
    for (const id of PERIOD_ORDER) {
      const inPeriod = foulEvents.filter((e) => e.period === id);
      if (!match.periods.some((p) => p.id === id) && inPeriod.length === 0) continue;
      const base = periodBase(match, id);
      const len = periodLength(match, id);
      const buckets = Math.ceil(len / STEP);
      for (let i = 0; i < buckets; i++) {
        const last = i === buckets - 1;
        const list = inPeriod.filter((e) => {
          const idx = Math.min(buckets - 1, Math.max(0, Math.floor((e.minute - base - 1) / STEP)));
          return idx === i;
        });
        const cell = (t: Team) => {
          const mine = list.filter((e) => e.team === t);
          return mine.length ? `${mine.length}   (${mine.map((e) => eventTime(match, e)).join(', ')})` : '0';
        };
        const from = base + i * STEP + 1;
        const to = Math.min(base + (i + 1) * STEP, base + len);
        rows.push([`${from}.-${to}.${last ? ' + Nachspielzeit' : ''}`, cell('H'), cell('G')]);
      }
    }
    ensure(30);
    line('Foulspiele im Zeitverlauf', { bold: true, size: 10 });
    y += 1;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      head: [['Spielminuten', home, away]],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: [200, 208, 204], valign: 'top' },
      headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
      rowPageBreak: 'avoid',
    });
    y = lastY() + 3;
  }
  y += 4;

  // ---------- Je Person ----------
  const personSection = (person: Person) => {
    const name = clean(personName(match, person));
    heading(`${PERSON_LABEL[person]}${name ? ` - ${name}` : ''}`);

    const sum = match.summaries[person];
    const sumRows: RowInput[] = [
      ['Gesamteindruck', clean(sum.overall)],
      ['Stärken', clean(sum.strengths)],
      ['Entwicklungsfelder', clean(sum.development)],
    ].filter((r) => r[1]);
    if (sumRows.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        theme: 'plain',
        body: sumRows,
        styles: { fontSize: 9.5, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 3 }, textColor: INK, valign: 'top' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 36 } },
      });
      y = lastY() + 3;
    }

    const all = events.filter((e) => e.type === 'note' && e.person === person);
    if (all.length === 0) {
      line('Keine Notizen erfasst.', { color: MUTED });
      y += 6;
      return;
    }

    const rc = ratingCounts(all);
    line(`${all.length} ${all.length === 1 ? 'Notiz' : 'Notizen'}:  positiv ${rc.pos}  |  negativ ${rc.neg}  |  neutral ${rc.neu}`, {
      color: MUTED,
      size: 9,
    });
    y += 1;

    // Allgemeine Hinweise ohne Zeitbezug stehen vor den Einzelszenen
    const general = all.filter((e) => e.general).sort((a, b) => a.createdAt - b.createdAt);
    if (general.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, bottom: 18 },
        theme: 'grid',
        body: [
          [{ content: 'Allgemeine Hinweise', colSpan: 2, styles: { fontStyle: 'bold', fillColor: LIGHT, textColor: INK } }],
          ...general.map((n): RowInput => {
            const cat = clean(n.category);
            return [sign(n), `${cat ? `${cat}: ` : ''}${noteText(n)}`];
          }),
        ],
        styles: { fontSize: 9.5, cellPadding: 1.8, textColor: INK, lineColor: [215, 221, 218], valign: 'top' },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' } },
        didParseCell: (d) => colorSign(d, 0),
        rowPageBreak: 'avoid',
      });
      y = lastY() + 3;
    }

    const notes = sortEvents(all.filter((e) => !e.general));
    if (notes.length === 0) {
      y += 5;
      return;
    }

    // Reihenfolge wie in den Einstellungen, danach unbekannte Kategorien, zuletzt "Ohne Kategorie"
    const known = (person === 'SR' ? settings.categoriesSR : settings.categoriesSRA).map((c) => c.name);
    const groups = new Map<string, MatchEvent[]>();
    for (const n of notes) {
      const key = n.category ?? '';
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    const order = [
      ...known.filter((k) => groups.has(k)),
      ...[...groups.keys()].filter((k) => k && !known.includes(k)),
      ...(groups.has('') ? [''] : []),
    ];

    const body: RowInput[] = [];
    for (const key of order) {
      const list = groups.get(key)!;
      const c = ratingCounts(list);
      body.push([
        {
          content: `${clean(key) || 'Ohne Kategorie'}   (+${c.pos} / -${c.neg} / o${c.neu})`,
          colSpan: 3,
          styles: { fontStyle: 'bold', fillColor: LIGHT, textColor: INK },
        },
      ]);
      for (const n of list) body.push([eventTime(match, n), sign(n), noteText(n)]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      theme: 'grid',
      body,
      styles: { fontSize: 9.5, cellPadding: 1.8, textColor: INK, lineColor: [215, 221, 218], valign: 'top' },
      columnStyles: { 0: { cellWidth: 21, fontStyle: 'bold' }, 1: { cellWidth: 8, halign: 'center' } },
      didParseCell: (d) => colorSign(d, 1),
      rowPageBreak: 'avoid',
    });
    y = lastY() + 8;
  };
  persons.forEach(personSection);

  // ---------- Anhang: Zeitleiste ----------
  doc.addPage();
  y = MARGIN;
  heading('Anhang - Zeitleiste');

  const timeline: RowInput[] = [];
  const marker = (text: string): RowInput => [
    { content: text, colSpan: 4, styles: { fontStyle: 'bold', fillColor: LIGHT, textColor: INK } },
  ];
  const sorted = sortEvents(events.filter((e) => e.type !== 'foul' && !e.general));
  let h = 0;
  let g = 0;
  for (const id of PERIOD_ORDER) {
    const period = match.periods.find((p) => p.id === id);
    const inPeriod = sorted.filter((e) => e.period === id);
    if (!period && inPeriod.length === 0) continue;
    if (period) timeline.push(marker(`Beginn ${PERIOD_LABEL[id]} (${periodBase(match, id) + 1}.)`));
    for (const e of inPeriod) {
      const min = eventTime(match, e);
      if (e.type === 'goal') {
        if (e.team === 'H') h++;
        else g++;
        timeline.push([min, '', '', { content: `Tor ${teamName(e.team!)} - ${h}:${g}`, styles: { fontStyle: 'bold' } }]);
      } else {
        const cat = clean(e.category);
        timeline.push([min, PERSON_LABEL[e.person ?? 'SR'], sign(e), `${cat ? `${cat}: ` : ''}${noteText(e)}`]);
      }
    }
    if (period?.endedAt) {
      const end = minuteAt(match, id, periodElapsedMs(period, period.endedAt));
      timeline.push(marker(`Ende ${PERIOD_LABEL[id]} (${formatMinuteDot(end.minute, end.stoppage)})`));
    }
  }

  if (timeline.length === 0) {
    line('Keine Ereignisse erfasst.', { color: MUTED });
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 18 },
      theme: 'grid',
      head: [['Zeit', 'Wer', '', 'Eintrag']],
      body: timeline,
      styles: { fontSize: 9, cellPadding: 1.6, textColor: INK, lineColor: [215, 221, 218], valign: 'top' },
      headStyles: { fillColor: INK, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 21, fontStyle: 'bold' }, 1: { cellWidth: 15 }, 2: { cellWidth: 8, halign: 'center' } },
      didParseCell: (d) => colorSign(d, 2),
      rowPageBreak: 'avoid',
    });
  }

  // ---------- Fußzeile ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${home} - ${away} · ${formatDate(match.date)} · vertraulich`, MARGIN, pageH - 9);
    doc.text(`Seite ${i} von ${pages}`, pageW - MARGIN, pageH - 9, { align: 'right' });
  }

  return { blob: doc.output('blob'), filename: reportFilename(match) };
}
