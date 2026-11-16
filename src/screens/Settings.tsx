import { useRef, useState } from 'react';
import { deleteAllData, uid } from '../db/actions';
import { buildBackup, importBackup, markBackupDone } from '../db/backup';
import { saveSettings, useMatches } from '../db/db';
import { DEFAULT_CATEGORIES_SR, DEFAULT_CATEGORIES_SRA, DISCIPLINE_ID } from '../domain/defaults';
import type { Category, Settings, ThemeSetting } from '../domain/types';
import { shareOrDownload } from '../lib/files';
import { navigate } from '../lib/hooks';
import { currentTopExtra } from '../lib/viewport';

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

function CategoryEditor({
  title,
  categories: initial,
  defaults,
  onChange: save,
}: {
  title: string;
  categories: Category[];
  defaults: Category[];
  onChange: (c: Category[]) => void;
}) {
  const [draft, setDraft] = useState('');
  // Lokaler Zustand, damit das Tippen nicht auf die Datenbank warten muss
  const [categories, setLocal] = useState(initial);
  const onChange = (next: Category[]) => {
    setLocal(next);
    save(next);
  };

  const add = () => {
    const name = draft.trim();
    if (!name || categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    onChange([...categories, { id: uid(), name }]);
    setDraft('');
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="card block">
      <div className="section-title">{title}</div>
      {categories.map((c, i) => (
        <div className="cat-edit" key={c.id}>
          <input
            className="input"
            value={c.name}
            onChange={(e) => onChange(categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
            aria-label={`Kategorie ${i + 1}`}
          />
          <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben">
            ↑
          </button>
          <button
            className="btn small danger"
            disabled={c.id === DISCIPLINE_ID}
            title={c.id === DISCIPLINE_ID ? 'Wird für die Kartenerfassung gebraucht' : undefined}
            onClick={() => onChange(categories.filter((x) => x.id !== c.id))}
            aria-label={`${c.name} löschen`}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="cat-edit">
        <input
          className="input"
          placeholder="Neue Kategorie"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn small" onClick={add} disabled={!draft.trim()}>
          Hinzufügen
        </button>
      </div>
      <button
        className="btn small ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          if (window.confirm('Kategorien auf die Standardliste zurücksetzen?')) onChange(defaults);
        }}
      >
        Auf Standard zurücksetzen
      </button>
    </section>
  );
}

export function SettingsScreen({ settings }: { settings: Settings }) {
  const matches = useMatches();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const nudgeTop = (delta: number) =>
    saveSettings({ topOffset: Math.min(120, Math.max(0, (settings.topOffset ?? currentTopExtra()) + delta)) });

  const exportBackup = async () => {
    const { blob, filename } = await buildBackup();
    await shareOrDownload(blob, filename, 'Sicherung SR-Beobachter');
    await markBackupDone();
    setMessage('Sicherung erstellt. Bewahre die Datei an einem sicheren Ort auf – sie enthält alle Namen und Notizen.');
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await importBackup(file);
      setMessage(`Sicherung eingespielt: ${r.matches} Spiele, ${r.events} Einträge.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Die Sicherung konnte nicht eingespielt werden.');
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const wipe = async () => {
    if (!window.confirm('Wirklich alle Spiele, Notizen und Einstellungen auf diesem Gerät löschen?')) return;
    if (!window.confirm('Das lässt sich nicht rückgängig machen. Endgültig löschen?')) return;
    await deleteAllData();
    setMessage('Alle Daten wurden gelöscht.');
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn ghost" onClick={() => navigate('/')}>
          ‹ Spiele
        </button>
        <h1 style={{ textAlign: 'center' }}>Einstellungen</h1>
        <span style={{ width: 70 }} />
      </header>

      <main className="content">
        {message && <div className="notice">{message}</div>}

        <section className="card block">
          <div className="section-title">Darstellung</div>
          <div className="segmented">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={settings.theme === t.value ? 'on' : ''}
                onClick={() => saveSettings({ theme: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="field">
            <span>Abstand oben (iPhone)</span>
            <div className="row">
              <button className="btn small" onClick={() => nudgeTop(-4)} aria-label="Kopfzeile höher setzen">
                ↑ höher
              </button>
              <button className="btn small" onClick={() => nudgeTop(4)} aria-label="Kopfzeile tiefer setzen">
                ↓ tiefer
              </button>
              <button
                className="btn small grow"
                disabled={settings.topOffset === null}
                onClick={() => saveSettings({ topOffset: null })}
              >
                {settings.topOffset === null ? 'Automatisch' : `${settings.topOffset} px · zurücksetzen`}
              </button>
            </div>
            <p className="small muted">
              iOS zeichnet bei Homescreen-Apps den oberen Bildschirmrand weich. Schiebe die Kopfzeile so weit nach
              oben, bis die Schrift gerade noch scharf ist.
            </p>
          </div>
          <label className="field">
            <span>Standard-Halbzeitlänge in Minuten</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={5}
              max={60}
              value={settings.defaultHalfLength || ''}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= 5 && n <= 60) void saveSettings({ defaultHalfLength: n });
              }}
            />
          </label>
        </section>

        <CategoryEditor
          title="Kategorien Schiedsrichter"
          categories={settings.categoriesSR}
          defaults={DEFAULT_CATEGORIES_SR}
          onChange={(c) => saveSettings({ categoriesSR: c })}
        />
        <CategoryEditor
          title="Kategorien Assistenten"
          categories={settings.categoriesSRA}
          defaults={DEFAULT_CATEGORIES_SRA}
          onChange={(c) => saveSettings({ categoriesSRA: c })}
        />

        <section className="card block">
          <div className="section-title">Datensicherung</div>
          <p className="small muted">
            {matches?.length ?? 0} {matches?.length === 1 ? 'Spiel' : 'Spiele'} auf diesem Gerät.{' '}
            {settings.lastBackupAt
              ? `Letzte Sicherung: ${new Date(settings.lastBackupAt).toLocaleDateString('de-DE')}.`
              : 'Noch keine Sicherung erstellt.'}
          </p>
          <div className="row wrap">
            <button className="btn grow" onClick={exportBackup}>
              Sicherung erstellen
            </button>
            <button className="btn grow" onClick={() => fileInput.current?.click()}>
              Sicherung einspielen
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </section>

        <section className="card block">
          <div className="section-title">Datenschutz</div>
          <p className="small">
            Alle Spiele und Notizen liegen ausschließlich auf diesem Gerät. Die App sendet keine Daten an einen Server
            und lädt keine Inhalte von Dritten.
          </p>
          <p className="small">
            Wer die App vom Homescreen löscht oder die Website-Daten des Browsers leert, löscht damit alle Spiele –
            deshalb regelmäßig eine Sicherung erstellen.
          </p>
          <p className="small">
            Geteilte PDFs und Sicherungsdateien enthalten Namen und Einschätzungen. Für deren Weitergabe und Ablage
            bist du selbst verantwortlich.
          </p>
          <button className="btn danger" onClick={wipe}>
            Alle Daten löschen
          </button>
        </section>

        <p className="small muted" style={{ textAlign: 'center' }}>
          SR-Beobachter · Version {__APP_VERSION__}
        </p>
      </main>
    </div>
  );
}
