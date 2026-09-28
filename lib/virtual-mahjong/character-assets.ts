import { CharacterAssetReceiver, readAssetFrame, sendCharacterAsset, type AssetFrame } from '../character-transfer';
import { getCharacterMedia } from '../characters';
import { MAX_WIRE_BYTES } from '../lan-protocol';
import type { VirtualRoomHost } from './room';
import { VIRTUAL_ROOM_PROTOCOL } from './room-wire';

/** Image bytes travel in bounded side frames. Room snapshots contain only hashes. */
export class VirtualCharacterHostAssets {
  private receiver = new CharacterAssetReceiver();
  private asked = new Map<string, number>();
  private lastScan = 0;
  constructor(private room: VirtualRoomHost, private roomId: string,
    private sendTo: (connectionId: string, text: string) => Promise<void>, private failed: (cause: unknown) => void) {}
  private send(connectionId: string, frame: AssetFrame) {
    return this.sendTo(connectionId, JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId: this.roomId, ...frame }));
  }
  handle(connectionId: string, text: string): boolean {
    if (!text.includes('character.asset.')) return false;
    void this.process(connectionId, text).catch(this.failed);
    return true;
  }
  private async process(connectionId: string, text: string) {
    if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
    const value = JSON.parse(text) as Record<string, unknown>;
    const frame = readAssetFrame(value);
    if (!frame || value.protocol !== VIRTUAL_ROOM_PROTOCOL || value.roomId !== this.roomId || !this.room.characterAssetPeer(connectionId)) throw new Error('NOT_AUTHENTICATED');
    if (frame.type === 'character.asset.request') {
      if (!this.room.characterAssetKnown(frame.hash)) throw new Error('UNKNOWN_CHARACTER_ASSET');
      await sendCharacterAsset(frame.hash, part => this.send(connectionId, part));
    } else if (frame.type === 'character.asset.chunk') {
      if (!this.room.characterAssetOwner(connectionId, frame.hash)) throw new Error('INVALID_CHARACTER_ASSET_OWNER');
      if (await this.receiver.accept(`${connectionId}:${frame.hash}`, frame)) {
        await Promise.allSettled(this.room.characterAssetPeers().map(peer => this.send(peer, { type: 'character.asset.available', hash: frame.hash })));
      }
    } else throw new Error('NOT_ALLOWED');
  }
  async ensure() {
    if (Date.now() - this.lastScan < 1500) return;
    this.lastScan = Date.now();
    const hashes = new Set(this.room.localView().seats.flatMap(seat => [seat.character?.avatarHash, seat.character?.portraitHash]).filter((value): value is string => !!value));
    for (const hash of hashes) {
      if (await getCharacterMedia(hash)) continue;
      const connectionId = this.room.characterAssetConnection(hash);
      if (connectionId && Date.now() - (this.asked.get(hash) ?? 0) > 4000) {
        this.asked.set(hash, Date.now()); await this.send(connectionId, { type: 'character.asset.request', hash });
      }
    }
  }
  clear() { this.receiver.clear(); this.asked.clear(); }
}
