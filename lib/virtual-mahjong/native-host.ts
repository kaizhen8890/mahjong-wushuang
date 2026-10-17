import type { NativeHostInfo } from '../lan-native';
import { VirtualRoomHost, type RoomDelivery } from './room';
import { attachVirtualRoom, type VirtualHostPort } from './room-transport';

/** Implemented by the existing LanRoomNative plugin. Never mount beside the physical Host. */
export interface NativeVirtualHostPort extends VirtualHostPort {
  startHost(options: { preferredPort: number; serviceName: string }): Promise<NativeHostInfo>;
  stopHost(): Promise<void>;
}
export interface RoomScheduler { every(callback: () => void): () => void }
const scheduler: RoomScheduler = { every(callback) { const id = setInterval(callback, 250); return () => clearInterval(id); } };

/** The owning screen supplies a fresh room and exclusively owns this native Host instance. */
export async function startVirtualNativeHost(room: VirtualRoomHost, port: NativeVirtualHostPort,
  serviceName: string, changed: () => void, failed: (cause: unknown) => void, clock: RoomScheduler = scheduler,
  assetMessage?: (connectionId: string, text: string) => boolean, prepareDelivery?: (delivery: RoomDelivery) => Promise<void | boolean>) {
  const transport = await attachVirtualRoom(room, port, changed, failed, assetMessage, prepareDelivery);
  let info: NativeHostInfo;
  try {
    info = await port.startHost({ preferredPort: 8765, serviceName });
  } catch (cause) {
    await transport.dispose(); throw cause;
  }
  let stopTimer: () => void;
  let closed = false;
  try {
    stopTimer = clock.every(() => {
      if (closed) return;
      try { const messages = room.tick(); if (messages.length) transport.publish(messages); else changed(); }
      catch (cause) { failed(cause); }
    });
  } catch (cause) {
    await transport.dispose(); await port.stopHost(); throw cause;
  }
  return {
    info,
    // Keep state-changing methods synchronous, then publish their individual projections.
    command(operation: () => RoomDelivery[]) {
      if (closed) throw new Error('ROOM_CLOSED');
      transport.publish(operation());
    },
    async close() {
      if (closed) return;
      closed = true; stopTimer();
      // Do not wait for a slow peer before shutting down; native socket closure is authoritative.
      room.close();
      await transport.dispose();
      await port.stopHost();
    },
  };
}
