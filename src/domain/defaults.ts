import type { Category, Settings } from './types';

/** Feste ID: Bei dieser SR-Kategorie erscheint die Kartenauswahl. Umbenennen erlaubt, Löschen nicht. */
export const DISCIPLINE_ID = 'disziplin';

const cat = (id: string, name: string): Category => ({ id, name });

export const DEFAULT_CATEGORIES_SR: Category[] = [
  cat('zweikampf', 'Zweikampfbewertung'),
  cat(DISCIPLINE_ID, 'Disziplinarkontrolle'),
  cat('vorteil', 'Vorteil / VzP'),
  cat('spielverstaendnis', 'Spielverständnis'),
  cat('laufen', 'Lauf- und Stellungsspiel'),
  cat('auftreten', 'Auftreten / Kommunikation'),
  cat('fortsetzung', 'Spielfortsetzungen'),
  cat('team', 'Teamarbeit'),
];

export const DEFAULT_CATEGORIES_SRA: Category[] = [
  cat('abseits', 'Abseits'),
  cat('u-foul', 'Unterstützung Foul/Hand'),
  cat('u-disziplin', 'Unterstützung Disziplin'),
  cat('a-fortsetzung', 'Spielfortsetzungen'),
  cat('a-stellung', 'Stellungsspiel / Fahnentechnik'),
  cat('a-sonstiges', 'Sonstiges'),
];

export const DEFAULT_SETTINGS: Settings = {
  categoriesSR: DEFAULT_CATEGORIES_SR,
  categoriesSRA: DEFAULT_CATEGORIES_SRA,
  defaultHalfLength: 45,
  theme: 'auto',
  lastBackupAt: null,
};
