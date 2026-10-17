import { GAME_EMOTES, GAME_EMOTES_BY_ID } from './emotes';
import { getEmoteMedia, putEmoteMedia } from './emote-media';
import { CharacterAssetReceiver, readAssetFrame, sendCharacterAsset } from './character-transfer';
import { emoteMeta, readEmoteMeta, registerEmote, type EmoteMeta } from './emote-library';
const builtins = new Set(GAME_EMOTES.map(e => e.id));
export type EmoteFrame = { type: string; hash?: string; meta?: EmoteMeta; [key: string]: unknown };
type Send = (frame: EmoteFrame) => Promise<void>;
const defaultMedia = { read: getEmoteMedia, save: putEmoteMedia, register: registerEmote, meta: emoteMeta, has: (id: string) => GAME_EMOTES_BY_ID.has(id) };
export type EmoteMediaPort = typeof defaultMedia;
/** One authenticated connection. Media is offered only when the user sends that emote. */
export class EmotePeer {
  private receiver: CharacterAssetReceiver;
  private offered = new Map<string, EmoteMeta>();
  private remote = new Set<string>();
  private pending = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private tail = Promise.resolve();
  private queued = 0;
  private closed = false;
  constructor(private send: Send, private media: EmoteMediaPort = defaultMedia) { this.receiver = new CharacterAssetReceiver({ maxBytes: 262144, maxDimension: 512, save: media.save }); }
  allowed(id: string) { return builtins.has(id) || this.remote.has(id); }
  async ensure(id: string): Promise<void> {
    if (this.closed) throw new Error('表情连接已结束');
    if (this.allowed(id)) return;
    const meta = this.media.meta(id); if (!meta || !this.media.has(id)) throw new Error('表情图片尚未就绪');
    const existing = this.pending.get(meta.hash); if (existing) return existing.promise;
    if (this.pending.size >= 4) throw new Error('正在同步表情，请稍后');
    let resolve!: () => void, reject!: (e: Error) => void;
    const promise = new Promise<void>((ok, no) => { resolve = ok; reject = no; });
    const timer = setTimeout(() => { this.pending.delete(meta.hash); reject(new Error('表情同步超时，请重新发送')); }, 15000);
    this.pending.set(meta.hash, { promise, resolve, reject, timer });
    void this.send({ type: 'emote.asset.offer', meta }).catch(e => { clearTimeout(timer); this.pending.delete(meta.hash); reject(e); });
    return promise;
  }
  accept(value: unknown): Promise<void> {
    if (this.closed || this.queued >= 80) return Promise.reject(new Error('表情同步过于频繁'));
    this.queued++;
    const work = this.tail.then(() => this.process(value));
    this.tail = work.catch(() => undefined).finally(() => { this.queued--; }); return work;
  }
  private async process(value: unknown) {
    if (this.closed) return;
    if (!value || typeof value !== 'object') throw new Error('表情消息无效');
    const f = value as EmoteFrame;
    if (f.type === 'emote.asset.offer') {
      const meta = readEmoteMeta(f.meta);
      if (this.offered.size >= 100 && !this.offered.has(meta.hash)) throw new Error('单次连接最多同步 100 张表情');
      this.offered.set(meta.hash, meta);
      if (await this.media.read(meta.hash)) {
        await this.media.register(meta); this.remote.add(meta.id); await this.send({ type: 'emote.asset.ready', hash: meta.hash });
      } else await this.send({ type: 'emote.asset.request', hash: meta.hash });
      return;
    }
    if (typeof f.hash !== 'string' || !/^[a-f0-9]{64}$/.test(f.hash)) throw new Error('表情哈希无效');
    if (f.type === 'emote.asset.ready') {
      const p = this.pending.get(f.hash); if (!p) return;
      const id = `x-${f.hash.slice(0, 60)}`; this.remote.add(id); clearTimeout(p.timer); this.pending.delete(f.hash); p.resolve(); return;
    }
    if (f.type === 'emote.asset.request') {
      if (!this.pending.has(f.hash)) throw new Error('未授权的表情请求');
      if (!await sendCharacterAsset(f.hash, part => this.send({ ...part, type: part.type.replace('character.', 'emote.') }), this.media.read)) throw new Error('表情素材不可用'); return;
    }
    if (f.type !== 'emote.asset.chunk' || !this.offered.has(f.hash)) throw new Error('未声明的表情素材');
    const part = readAssetFrame({ ...f, type: 'character.asset.chunk' });
    if (!part || part.type !== 'character.asset.chunk' || part.total > 44) throw new Error('表情图片过大');
    if (await this.receiver.accept(f.hash, part)) {
      const meta = this.offered.get(f.hash)!; await this.media.register(meta); this.remote.add(meta.id);
      await this.send({ type: 'emote.asset.ready', hash: f.hash });
    }
  }
  clear() {
    this.closed = true; this.receiver.clear(); this.offered.clear(); this.remote.clear();
    this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('表情连接已结束')); }); this.pending.clear();
  }
}
/** Authentication and room/version checks happen before allocating receivers or accepting bytes. */
export class EmoteRoomAssets {
  private peers = new Map<string, EmotePeer>();
  constructor(private protocol: string | number, private roomId: () => string,
    private authorized: (peer: string) => boolean, private send: (peer: string, text: string) => Promise<void>, private failed: (e: unknown) => void) {}
  private peer(id: string) {
    if (!this.authorized(id)) throw new Error('表情连接尚未认证');
    for (const key of this.peers.keys()) if (!this.authorized(key)) this.disconnect(key);
    let peer = this.peers.get(id);
    if (!peer) { if (this.peers.size >= 8) throw new Error('表情连接过多'); peer = new EmotePeer(frame => this.send(id, JSON.stringify({ ...frame, protocol: this.protocol, roomId: this.roomId() }))); this.peers.set(id, peer); }
    return peer;
  }
  handle(id: string, text: string): boolean {
    if (!text.includes('emote.asset.')) return false;
    try {
      if (new TextEncoder().encode(text).length > 32768) throw new Error('表情消息过大');
      const value = JSON.parse(text);
      if (value.protocol !== this.protocol || value.roomId !== this.roomId()) throw new Error('表情房间不匹配');
      void this.peer(id).accept(value).catch(this.failed);
    } catch (e) { this.failed(e); }
    return true;
  }
  ensure(id: string, emoteId: string) { return this.peer(id).ensure(emoteId); }
  allowed(id: string, emoteId: string) { return this.authorized(id) && (builtins.has(emoteId) || Boolean(this.peers.get(id)?.allowed(emoteId))); }
  disconnect(id: string) { this.peers.get(id)?.clear(); this.peers.delete(id); }
  clear() { this.peers.forEach(p => p.clear()); this.peers.clear(); }
}
