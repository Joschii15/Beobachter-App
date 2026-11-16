/**
 * Ab iOS 26.1 zeigt das System Homescreen-Apps mit durchscheinender Statusleiste fehlerhaft an
 * (WebKit-Fehler 301994): Die Seite beginnt zwar ganz oben, endet aber um die Höhe der
 * Statusleiste zu früh, und über dem oberen Bereich liegt ein Weichzeichner des Systems.
 *
 * Erkennbar ist der Zustand daran, dass die Seite niedriger ist als der Bildschirm, obwohl
 * sie einen oberen Sicherheitsabstand meldet. Dann rückt die App ihren Inhalt unter den
 * weichgezeichneten Bereich und verzichtet unten auf den Abstand zum Home-Balken, weil
 * die Seite ohnehin darüber endet. In allen anderen Fällen ändert sich nichts.
 */
function safeAreaTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return value;
}

/** Vom Nutzer eingestellter Abstand oben in Pixeln; null = automatisch */
let override: number | null = null;

/** Automatischer Abstand im Fehlerfall: etwas weniger als die Lücke, damit oben kein Platz verschenkt wird. */
export function autoTopExtra(gap: number): number {
  return Math.max(0, Math.round(gap) - 14);
}

/** Aktuell wirksamer Zusatzabstand – Ausgangswert für die Feineinstellung. */
export function currentTopExtra(): number {
  return parseFloat(document.documentElement.style.getPropertyValue('--top-extra')) || 0;
}

export function setTopOverride(value: number | null): void {
  override = value;
  fit();
}

function fit(): void {
  const root = document.documentElement;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerHeight >= window.innerWidth;
  const keyboardOpen = !!window.visualViewport && window.visualViewport.height < window.innerHeight - 80;
  if (keyboardOpen) return;

  const gap = window.screen.height - window.innerHeight;
  const affected = standalone && portrait && gap >= 20 && gap <= 80 && safeAreaTop() > 0;
  if (affected) root.style.setProperty('--safe-bottom', '0px');
  else root.style.removeProperty('--safe-bottom');

  const extra = override ?? (affected ? autoTopExtra(gap) : 0);
  if (extra > 0) root.style.setProperty('--top-extra', `${extra}px`);
  else root.style.removeProperty('--top-extra');
}

export function watchViewport(): void {
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  window.addEventListener('pageshow', fit);
}
