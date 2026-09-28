import type { PeerMessageEvent, PeerEvent } from '../lan-native';
import type { RoomDelivery, VirtualRoomHost } from './room';

interface Handle { remove(): Promise<void> }
/** Structural subset of LanRoomNative; existing native plugin can be passed directly. */
export interface VirtualHostPort {
  sendTo(options: { connectionId: string; text: string }): Promise<void>;
  addListener(name: 'peerMessage', callback: (event: PeerMessageEvent) => void): Promise<Handle>;
  addListener(name: 'peerClosed', callback: (event: PeerEvent) => void): Promise<Handle>;
}

/** Install before startHost. No broadcast API is available to this adapter. */
export async function attachVirtualRoom(room: VirtualRoomHost, port: VirtualHostPort,
  changed: () => void, failed: (cause: unknown) => void, assetMessage?: (connectionId: string, text: string) => boolean) {
  let disposed = false;
  const handles: Handle[] = [];
  const tails = new Map<string, Promise<void>>();
  const pending = new Map<string, number>();
  const queuedSnapshots = new Map<string, RoomDelivery>();
  function publish(deliveries: RoomDelivery[]) {
    if (disposed) return;
    for (const delivery of deliveries) {
      const id = delivery.connectionId;
      const snapshot = JSON.parse(delivery.text).type === 'SNAPSHOT';
      const previous = queuedSnapshots.get(id);
      if (snapshot && previous) { previous.text = delivery.text; continue; }
      // A stalled peer must not accumulate unlimited private snapshots in memory.
      if ((pending.get(id) ?? 0) >= 32) { failed(new Error('SLOW_PEER')); continue; }
      pending.set(id, (pending.get(id) ?? 0) + 1);
      if (snapshot) queuedSnapshots.set(id, delivery);
      const tail = (tails.get(id) ?? Promise.resolve()).then(async () => {
        if (queuedSnapshots.get(id) === delivery) queuedSnapshots.delete(id);
        if (!disposed) await port.sendTo(delivery);
      }).catch(failed).finally(() => {
        pending.set(id, (pending.get(id) ?? 1) - 1);
        if (tails.get(id) === tail) { tails.delete(id); pending.delete(id); }
      });
      tails.set(id, tail);
    }
    changed();
  }
  try {
    handles.push(await port.addListener('peerMessage', event => {
      if (!disposed && !assetMessage?.(event.connectionId, event.text)) publish(room.receive(event.connectionId, event.text));
    }));
    handles.push(await port.addListener('peerClosed', event => {
      if (!disposed) publish(room.disconnect(event.connectionId));
    }));
  } catch (cause) {
    disposed = true; await Promise.allSettled(handles.map(handle => handle.remove())); throw cause;
  }
  return {
    publish,
    async flush() { await Promise.all(tails.values()); },
    async dispose() {
      disposed = true;
      await Promise.allSettled(handles.map(handle => handle.remove()));
      // Native Host lifecycle is owned by the screen that started it.
    },
  };
}
