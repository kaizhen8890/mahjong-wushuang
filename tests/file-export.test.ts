import assert from 'node:assert/strict';
import { Capacitor } from '@capacitor/core';

const original = { native: Capacitor.isNativePlatform, platform: Capacitor.getPlatform, available: Capacitor.isPluginAvailable };
const nativeCap = Capacitor as typeof Capacitor & { PluginHeaders?: unknown[]; nativePromise?: (...args: unknown[]) => Promise<unknown> };
const oldHeaders = nativeCap.PluginHeaders, oldPromise = nativeCap.nativePromise;
const calls: unknown[][] = [];
nativeCap.PluginHeaders = [...(oldHeaders ?? []), { name: 'FileExport', methods: [{ name: 'shareJson', rtype: 'promise' }] }];
nativeCap.nativePromise = async (...args: unknown[]) => { calls.push(args); return { shared: false }; };
const { exportJson, exportJsonBlob } = await import('../lib/file-export');
try {
  Capacitor.isNativePlatform = () => true;
  Capacitor.getPlatform = () => 'ios';
  Capacitor.isPluginAvailable = () => true;
  await exportJson('麻将.json', { score: 25000 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), ['FileExport', 'shareJson']);
  assert.deepEqual(JSON.parse((calls[0][2] as { text: string }).text), { score: 25000 });
  // Cancelling the share sheet is a normal completion; native errors still reach the UI.
  nativeCap.nativePromise = async () => { throw new Error('EXPORT_BUSY'); };
  await assert.rejects(exportJson('test.json', {}), /EXPORT_BUSY/);
  Capacitor.isPluginAvailable = () => false;
  await assert.rejects(exportJson('test.json', {}), /尚未启用文件导出/);
  Capacitor.isPluginAvailable = () => true;
  await assert.rejects(exportJsonBlob('large.json', new Blob([new Uint8Array(32 * 1024 * 1024 + 1)])), /超过 32MB/);
} finally {
  Capacitor.isNativePlatform = original.native;
  Capacitor.getPlatform = original.platform;
  Capacitor.isPluginAvailable = original.available;
  nativeCap.PluginHeaders = oldHeaders;
  nativeCap.nativePromise = oldPromise;
}
console.log('PASS iOS JSON export: bridge payload, cancel, busy failure, missing capability and size bound');

