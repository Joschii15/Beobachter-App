/**
 * iOS misst Homescreen-Apps mit durchscheinender Statusleiste zu niedrig: Die Seite endet
 * um die Höhe der Statusleiste zu früh, unten bleibt ein leerer Streifen. In genau diesem
 * Fall (App vom Homescreen, Hochformat, Lücke in der Größe einer Statusleiste) wird die
 * App auf die volle Bildschirmhöhe gesetzt. In allen anderen Fällen bleibt es bei 100 %.
 */
function fit(): void {
  const root = document.documentElement;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerHeight >= window.innerWidth;
  const gap = window.screen.height - window.innerHeight;
  const keyboardOpen = !!window.visualViewport && window.visualViewport.height < window.innerHeight - 80;

  if (standalone && portrait && !keyboardOpen && gap >= 20 && gap <= 80) {
    root.style.setProperty('--app-h', `${window.screen.height}px`);
  } else if (!keyboardOpen) {
    root.style.removeProperty('--app-h');
  }
}

export function watchViewport(): void {
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  window.addEventListener('pageshow', fit);
}
