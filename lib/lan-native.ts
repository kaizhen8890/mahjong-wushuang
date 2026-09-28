import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface DiscoveredLanRoom {
  serviceName: string;
  host: string;
  port: number;
}

export interface NativeHostInfo {
  host: string;
  port: number;
  serviceName: string;
}

export interface PeerEvent {
  connectionId: string;
  remoteAddress?: string;
}

export interface PeerMessageEvent extends PeerEvent {
  text: string;
}

export interface ClientStateEvent {
  state: 'connecting' | 'connected' | 'disconnected' | 'error';
  message?: string;
}

export interface ClientMessageEvent {
  text: string;
}

interface LanRoomNativePlugin {
  startHost(options: { preferredPort: number; serviceName: string }): Promise<NativeHostInfo>;
  stopHost(): Promise<void>;
  discoverRooms(): Promise<{ rooms: DiscoveredLanRoom[] }>;
  stopDiscovery(): Promise<void>;
  connect(options: { host: string; port: number }): Promise<void>;
  disconnect(): Promise<void>;
  send(options: { text: string }): Promise<void>;
  sendTo(options: { connectionId: string; text: string }): Promise<void>;
  broadcast(options: { text: string }): Promise<void>;
  addListener(eventName: 'peerOpened', listener: (event: PeerEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'peerMessage', listener: (event: PeerMessageEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'peerClosed', listener: (event: PeerEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'roomsChanged', listener: (event: { rooms: DiscoveredLanRoom[] }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'clientState', listener: (event: ClientStateEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'clientMessage', listener: (event: ClientMessageEvent) => void): Promise<PluginListenerHandle>;
}

export const LanRoomNative = registerPlugin<LanRoomNativePlugin>('LanRoom');

export function hasNativeLanRoom() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

