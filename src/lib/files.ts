/** Öffnet das Teilen-Menü des Geräts (AirDrop, Mail, Dateien). Gibt false zurück, wenn Teilen nicht möglich ist. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    // Abbruch durch den Nutzer ist kein Fehler
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openFile(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<void> {
  if (!(await shareFile(blob, filename, title))) downloadFile(blob, filename);
}
