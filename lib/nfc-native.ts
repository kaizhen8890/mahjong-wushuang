import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';
import type { NfcTagRead } from './nfc-cards';
export interface NfcEvent extends Partial<NfcTagRead> {
  sessionId: string;
  kind: 'tag' | 'stopped' | 'error';
  message?: string;
  uri?: string;
  eventId?: string;
  origin?: 'external' | 'foreground';
}
export interface NfcOpenRequest {
  uri: string;
  origin?: NfcEvent['origin'];
}
export interface NfcTransport {
  watch?(options: { enabled: boolean }): Promise<void>;
  status(): Promise<{ supported: boolean; enabled: boolean }>;
  start(options: { sessionId: string }): Promise<void>;
  stop(options: { sessionId: string }): Promise<void>;
  settings(): Promise<void>;
  addListener(
    name: 'scan',
    listener: (event: NfcEvent) => void,
  ): Promise<PluginListenerHandle>;
}
const plugin = registerPlugin<
  NfcTransport & { takeLaunch(): Promise<{ event?: NfcEvent }> }
>('SkillNfc');
export const takeNfcLaunch = () => plugin.takeLaunch();
export const nativeNfc: NfcTransport = {
  watch: (options) => plugin.watch!(options),
  status: async () =>
    Capacitor.getPlatform() === 'android'
      ? plugin.status()
      : { supported: false, enabled: false },
  start: (options) => plugin.start(options),
  stop: (options) =>
    Capacitor.getPlatform() === 'android'
      ? plugin.stop(options)
      : Promise.resolve(),
  settings: () => plugin.settings(),
  addListener: (name, listener) => plugin.addListener(name, listener),
};
