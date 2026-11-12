import { download } from '../data/exportImport';
import { reportError } from './errors';
import { isIos } from './push';

/**
 * Whether this browser can hand a file to the phone's share menu. On the iPhone that menu
 * is also where "Salvar imagem" and "Salvar em Arquivos" are: a plain download does nothing
 * there, above all in the installed app. Without a file, it asks about a PNG.
 */
export function canShareFiles(file?: File): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file ?? new File([''], 'x.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
}

/** What to tell the person after saving a spreadsheet, or null when nothing needs saying. */
export function savedMessage(r: SaveResult): string | null {
  if (r === 'opened') return 'Planilha aberta: toque em Compartilhar para salvar em Arquivos';
  if (r === 'downloaded') return 'Planilha baixada';
  return null;
}

/** shared: went to the share menu; opened: shown in the system preview; downloaded; cancelled. */
export type SaveResult = 'shared' | 'opened' | 'downloaded' | 'cancelled';

/**
 * Saves a file the way the device can. On the iPhone: the share menu, trying the file's own
 * type and then generic ones (the menu took a PNG but turned a spreadsheet down); failing
 * that, the file opens in the system preview, which has its own share button. Elsewhere, a
 * download. Everything up to the menu runs inside the tap: the iPhone opens it only from one.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveResult> {
  const ext = filename.split('.').pop() ?? '';
  if (isIos()) {
    const types = [...new Set([blob.type, 'application/octet-stream', ''])];
    const file = types
      .map((type) => new File([blob], filename, { type }))
      .find((f) => canShareFiles(f));
    if (file) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (err) {
        if ((err as Error).name === 'AbortError') return 'cancelled';
        reportError(
          new Error(
            `Salvar .${ext} no iPhone: o menu falhou (${(err as Error).name}: ${(err as Error).message})`,
          ),
        );
      }
    } else {
      reportError(
        new Error(`Salvar .${ext} no iPhone: o menu de compartilhar recusou ${types.join(', ')}`),
      );
    }
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (win) return 'opened';
  }
  download(blob, filename);
  return 'downloaded';
}
