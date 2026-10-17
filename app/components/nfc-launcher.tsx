'use client';
import { useEffect, useState } from 'react';
import {
  nativeNfc,
  takeNfcLaunch,
  type NfcEvent,
  type NfcTransport,
} from '@/lib/nfc-native';
import { NfcCardScanner } from './nfc-card-scanner';
import catalog from '@/data/skill-cards.json';

const deliveredLaunchIds = new Set<string>();

/** Cold launch and warm NFC intents share one queue; no automatic game commands. */
export function NfcLauncher({
  transport = nativeNfc,
  takeLaunch = takeNfcLaunch,
}: { transport?: NfcTransport; takeLaunch?: typeof takeNfcLaunch } = {}) {
  const [request, setRequest] = useState<{ uri: string; key: string; external: boolean }>();
  useEffect(() => {
    let alive = true;
    let remove: (() => Promise<void>) | undefined;
    const seen = deliveredLaunchIds;
    function receive(event?: NfcEvent) {
      if (
        !alive ||
        event?.sessionId !== 'launch' ||
        !event.uri ||
        !event.eventId ||
        seen.has(event.eventId)
      )
        return;
      seen.add(event.eventId);
      if (seen.size > 64) seen.delete(seen.values().next().value!);
      setRequest(undefined);
      const unhandled = window.dispatchEvent(
        new CustomEvent('mahjong:nfc-open', {
          detail: { uri: event.uri, origin: event.origin },
          cancelable: true,
        }),
      );
      if (unhandled) setRequest({ uri: event.uri, key: event.eventId, external: event.origin === 'external' });
    }
    async function listen() {
      try {
        const status = await transport.status();
        if (!alive || !status.supported) return;
        const handle = await transport.addListener('scan', receive);
        remove = () => handle.remove();
        if (!alive) {
          await remove();
          return;
        }
        receive((await takeLaunch()).event);
        if (alive) await transport.watch?.({ enabled: true });
      } catch {
        /* Older APKs and browsers retain manual card controls. */
      }
    }
    void listen();
    return () => {
      alive = false;
      void transport.watch?.({ enabled: false }).catch(() => {});
      void remove?.();
    };
  }, [transport, takeLaunch]);
  return request ? (
    <NfcCardScanner
      key={request.key}
      initialUri={request.uri}
      cards={catalog.cards}
      canPrepare={false}
      onPrepare={() => {}}
      allowMusic={
        request.external || (typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/virtual'))
      }
      close={() => setRequest(undefined)}
    />
  ) : null;
}
