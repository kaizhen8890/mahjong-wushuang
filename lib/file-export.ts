import { Capacitor, registerPlugin } from '@capacitor/core';

const fileExport = registerPlugin<{
  shareJson(options: { fileName: string; text: string }): Promise<{ shared: boolean }>;
}>('FileExport');

/** Called only from an explicit export action. Never exports virtual Host checkpoints. */
export async function exportJsonBlob(fileName: string, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    if (!Capacitor.isPluginAvailable('FileExport')) throw new Error('此版本尚未启用文件导出');
    if (blob.size > 32 * 1024 * 1024) throw new Error('导出文件超过 32MB');
    await fileExport.shareJson({ fileName, text: await blob.text() });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start reading the download before revoking its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function exportJson(fileName: string, data: unknown): Promise<void> {
  return exportJsonBlob(fileName, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
}

