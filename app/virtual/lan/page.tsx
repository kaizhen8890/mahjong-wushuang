'use client';
/* eslint-disable nextjs/no-html-link-for-pages */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LanRoomNative, hasNativeLanRoom, type DiscoveredLanRoom } from '@/lib/lan-native';
import { createRoomCode } from '@/lib/lan-protocol';
import { VirtualRoomHost, type RoomDelivery, type RoomCheckpoint } from '@/lib/virtual-mahjong/room';
import { VirtualRoomClient } from '@/lib/virtual-mahjong/room-client';
import { saveRoom, loadRoom, clearRoom, matchingClientSave, type RoomSave } from '@/lib/virtual-mahjong/room-storage';
import { startVirtualNativeHost } from '@/lib/virtual-mahjong/native-host';
import { defaultRules } from '@/lib/virtual-mahjong/rules';
import { ReconnectController, type ReconnectStatus } from '@/lib/virtual-mahjong/reconnect-policy';
import { VirtualCharacterHostAssets } from '@/lib/virtual-mahjong/character-assets';
import { CharacterAssetReceiver, readAssetFrame, sendCharacterAsset, type AssetFrame } from '@/lib/character-transfer';
import { getCharacterMedia } from '@/lib/characters';
import { MAX_WIRE_BYTES } from '@/lib/lan-protocol';
import { VIRTUAL_ROOM_PROTOCOL, type RoomSnapshot } from '@/lib/virtual-mahjong/room-wire';
import type { VirtualEmote } from '@/lib/virtual-mahjong/emotes';
import { VirtualTable } from '@/app/components/virtual-mahjong/table';
import { CharacterAvatar, CharacterPicker, preferredCharacter, savedPreferredCharacter, savePreferredCharacter } from '@/app/components/character-picker';
import { DEFAULT_CHARACTER, defaultSeatCharacter, type CharacterChoice } from '@/lib/characters';
import { RoomRuleEditor, RoomRuleSummary } from '@/app/components/virtual-mahjong/room-rules';
import './room.css';
const prefix = '麻将无双·虚拟·';
const terminalErrors = new Set(['CLOSED', 'KICKED', 'SESSION_REPLACED', 'AUTH_FAILED', 'ROOM_CHANGED', 'ROOM_FULL', 'MATCH_STARTED', 'ROOM_CLOSED', 'WRONG_PROTOCOL']);
const roomErrorText: Record<string, string> = {
  CLOSED: '房间已关闭，请重新加入', KICKED: '你已被移出房间', SESSION_REPLACED: '此身份已在另一台设备连接',
  AUTH_FAILED: '房间码或恢复身份无效', ROOM_CHANGED: '该地址已不是保存的房间', ROOM_FULL: '房间已满',
  MATCH_STARTED: '对局已经开始，不能以新身份加入', ROOM_CLOSED: '房间已关闭', WRONG_PROTOCOL: '房间版本不兼容',
};
const readableError = (cause: unknown) => { const message = cause instanceof Error ? cause.message : String(cause); return roomErrorText[message] ?? message; };
type SavedSummary = { role: 'host' | 'client'; title: string; detail: string };
const summarizeSave = (saved: RoomSave | null): SavedSummary | null => saved?.role === 'host'
  ? { role: 'host', title: '房主存档', detail: `房间码 ${saved.checkpoint.options.code} · ${saved.checkpoint.options.hostName}` }
  : saved ? { role: 'client', title: '玩家身份', detail: `${saved.name} · ${saved.host}:${saved.port} · 房间码 ${saved.code}` } : null;
export default function VirtualLanPage({ onBack }: { onBack?: () => void } = {}) {
  const supported = useSyncExternalStore(() => () => {}, hasNativeLanRoom, () => false);
  const [busy, setBusy] = useState(false), [linked, setLinked] = useState(false);
  const [role, setRole] = useState<'none' | 'host' | 'client'>('none'), [mine, setMine] = useState('');
  const [name, setName] = useState('玩家'), [ip, setIp] = useState(''), [code, setCode] = useState(''), [error, setError] = useState(''), [address, setAddress] = useState('');
  const [port, setPort] = useState(8765), [now, setNow] = useState(0);
  const [rules, setRules] = useState(defaultRules()), [view, setView] = useState<RoomSnapshot | null>(null);
  const [rooms, setRooms] = useState<DiscoveredLanRoom[]>([]);
  const [formTab, setFormTab] = useState<'create' | 'join'>('create');
  const [savedRoom, setSavedRoom] = useState<SavedSummary | null>(null);
  const [reconnectStatus, setReconnectStatus] = useState<ReconnectStatus>({ kind: 'idle', attempt: 0 });
  const [terminal, setTerminal] = useState(false), [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [swapFrom, setSwapFrom] = useState(0), [swapTo, setSwapTo] = useState(1);
  const alive = useRef(false), clock = useRef({ server: 0, received: 0 });
  const room = useRef<VirtualRoomHost | null>(null), client = useRef<VirtualRoomClient | null>(null);
  const host = useRef<Awaited<ReturnType<typeof startVirtualNativeHost>> | null>(null);
  const hostAssets = useRef<VirtualCharacterHostAssets | null>(null);
  const clientAssetReceiver = useRef(new CharacterAssetReceiver());
  const clientAssetRequests = useRef(new Map<string, number>());
  const handles = useRef<{ remove(): Promise<void> }[]>([]);
  const discovery = useRef(false);
  const connectionBusy = useRef(false);
  const leaving = useRef(false), retryAllowed = useRef(true);
  const reconnect = useRef<ReconnectController | null>(null);
  const lastSave = useRef({ revision: -1, at: 0 });
  const endpoint = useRef({ host: '', port: 8765 });
  const observed = useRef<RoomSnapshot | null>(null);
  const [dealRound, setDealRound] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterChoice>(DEFAULT_CHARACTER);
  const selectedCharacterRef = useRef<CharacterChoice>(DEFAULT_CHARACTER);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [emotes, setEmotes] = useState<VirtualEmote[]>([]);
  const showEmotes = (events: VirtualEmote[]) => { if (alive.current && !document.hidden && events.length) setEmotes(old => [...old, ...events].slice(-16)); };
  const show = useCallback((snapshot: RoomSnapshot | null) => { if (alive.current) {
    if (snapshot?.game && observed.current && !observed.current.game && !document.hidden) setDealRound(snapshot.game.roundId);
    if (!snapshot) setDealRound('');
    observed.current = snapshot;
    if (snapshot && snapshot.serverNow !== clock.current.server) clock.current = { server: snapshot.serverNow, received: Date.now() };
    setView(snapshot);
  } }, []);
  const fail = (cause: unknown) => { if (alive.current) setError(readableError(cause)); };
  useEffect(() => {
    alive.current = true;
    selectedCharacterRef.current = preferredCharacter('virtual'); setSelectedCharacter(selectedCharacterRef.current);
    const savedTimer = window.setTimeout(() => {
      try { setSavedRoom(summarizeSave(loadRoom(localStorage))); } catch (cause) { setError(readableError(cause)); }
    }, 0);
    reconnect.current = new ReconnectController(() => LanRoomNative.connect(endpoint.current), status => {
      if (!alive.current) return;
      setReconnectStatus(status);
      if (status.kind === 'exhausted') retryAllowed.current = false;
    });
    const visibility = () => {
      if (document.hidden) reconnect.current?.pause();
      else if (reconnect.current?.enabled) reconnect.current.resume();
      else if (client.current && !client.current.active && retryAllowed.current && !leaving.current) reconnect.current?.start();
    };
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(() => setNow(clock.current.server + Date.now() - clock.current.received), 250);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- These are async resources, not DOM refs; cleanup must use the latest owners.
    return () => { alive.current = false; clearTimeout(savedTimer); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); reconnect.current?.cancel(); void host.current?.close(); void Promise.allSettled(handles.current.map(item => item.remove())); if (client.current) void LanRoomNative.disconnect(); if (hasNativeLanRoom()) void LanRoomNative.stopDiscovery(); };
  }, []);
  const command = (operation: () => RoomDelivery[]) => { try { setError(''); host.current!.command(operation); return true; } catch (cause) { fail(cause); return false; } };
  const send = (text: string) => { void LanRoomNative.send({ text }).catch(fail); };
  const clientAssetWire = (roomId: string, frame: AssetFrame) => LanRoomNative.send({ text: JSON.stringify({ protocol: VIRTUAL_ROOM_PROTOCOL, roomId, ...frame }) });
  const ensureClientAssets = (snapshot: RoomSnapshot) => {
    const hashes = new Set(snapshot.seats.flatMap(seat => [seat.character?.avatarHash, seat.character?.portraitHash]).filter((value): value is string => !!value));
    for (const hash of hashes) void getCharacterMedia(hash).then(blob => {
      if (blob || Date.now() - (clientAssetRequests.current.get(hash) ?? 0) < 4000) return;
      clientAssetRequests.current.set(hash, Date.now());
      return clientAssetWire(client.current!.savedCredentials()!.roomId, { type: 'character.asset.request', hash });
    }).catch(fail);
  };
  const handleClientAsset = (text: string, session: VirtualRoomClient): boolean => {
    if (!text.includes('character.asset.')) return false;
    void (async () => {
      if (new TextEncoder().encode(text).length > MAX_WIRE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
      const value = JSON.parse(text) as Record<string, unknown>, frame = readAssetFrame(value);
      const credentials = session.savedCredentials();
      if (!session.active || !credentials) return;
      if (!frame || value.protocol !== VIRTUAL_ROOM_PROTOCOL || value.roomId !== credentials.roomId) throw new Error('INVALID_CHARACTER_ASSET');
      const live = session.view();
      if (frame.type === 'character.asset.request') {
        const own = live?.seats.find(seat => seat.playerId === credentials.playerId)?.character ?? selectedCharacterRef.current;
        if (![own.avatarHash, own.portraitHash].includes(frame.hash)) throw new Error('INVALID_CHARACTER_ASSET_REQUEST');
        await sendCharacterAsset(frame.hash, part => clientAssetWire(credentials.roomId, part));
      } else if (frame.type === 'character.asset.available') {
        clientAssetRequests.current.delete(frame.hash);
        if (live) ensureClientAssets(live);
      } else {
        if (!live?.seats.some(seat => [seat.character?.avatarHash, seat.character?.portraitHash].includes(frame.hash))) throw new Error('UNKNOWN_CHARACTER_ASSET');
        await clientAssetReceiver.current.accept(frame.hash, frame);
      }
    })().catch(fail);
    return true;
  };
  const queueReconnect = () => {
    if (!client.current || !retryAllowed.current || leaving.current) return;
    if (reconnect.current?.enabled) reconnect.current.disconnected(); else reconnect.current?.start();
    if (document.hidden) reconnect.current?.pause();
  };
  const cancelReconnect = () => { retryAllowed.current = false; reconnect.current?.cancel(); };
  const create = async (checkpoint?: RoomCheckpoint) => {
    if (connectionBusy.current || room.current || client.current) return;
    connectionBusy.current = true;
    setBusy(true); setError('');
    try {
      const authority = checkpoint ? VirtualRoomHost.restoreCheckpoint(checkpoint, { now: () => Date.now() })
        : new VirtualRoomHost({ roomId: crypto.randomUUID(), code: createRoomCode(), hostName: name, rules }, { now: () => Date.now() });
      if (!checkpoint) authority.setHostCharacter(selectedCharacterRef.current);
      const roomCode = authority.exportCheckpoint().options.code; room.current = authority;
      const assets = new VirtualCharacterHostAssets(authority, authority.exportCheckpoint().options.roomId,
        (connectionId, text) => LanRoomNative.sendTo({ connectionId, text }), fail);
      hostAssets.current = assets;
      lastSave.current = { revision: -1, at: 0 };
      const changed = () => {
        const snapshot = authority.localView(); show(snapshot);
        void assets.ensure().catch(fail);
        showEmotes(authority.takeEmotes());
        if (!alive.current) return;
        if (snapshot.revision !== lastSave.current.revision || Date.now() - lastSave.current.at >= 1000) {
          try { const saved: RoomSave = { format: 'musou.local.room', version: 1, role: 'host', checkpoint: authority.exportCheckpoint() };
            saveRoom(localStorage, saved); setSavedRoom(summarizeSave(saved));
            lastSave.current = { revision: snapshot.revision, at: Date.now() }; } catch (cause) { fail(cause); }
        }
      };
      const hosting = await startVirtualNativeHost(authority, LanRoomNative, prefix + roomCode, changed, fail, undefined, (connectionId, text) => assets.handle(connectionId, text));
      if (!alive.current) { await hosting.close(); return; }
      host.current = hosting; setRole('host'); setMine(authority.hostPlayerId); setAddress(`${hosting.info.host}:${hosting.info.port}`); setCode(roomCode); setRules(authority.localView().rules); changed(); setLinked(true);
    } catch (cause) { room.current = null; fail(cause); } finally { connectionBusy.current = false; if (alive.current) setBusy(false); }
  };
  const join = async (saved?: Extract<RoomSave, { role: 'client' }>) => {
    if (connectionBusy.current || room.current || terminal) return;
    const target = saved ?? { host: ip.trim(), port, name: name.trim(), code: code.trim().toUpperCase() };
    if (!target.host || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535 || !target.name || !target.code) { setError('请填写玩家名、IP、端口和房间码'); return; }
    if (client.current && (target.host !== endpoint.current.host || target.port !== endpoint.current.port)) { setError('请先取消当前连接，再加入其他房间'); return; }
    retryAllowed.current = true; reconnect.current?.cancel(); setTerminal(false);
    connectionBusy.current = true; setBusy(true); setError('');
    endpoint.current = { host: target.host, port: target.port };
    let installed = Boolean(client.current);
    try {
      if (!client.current) {
        const identity = saved ?? matchingClientSave(localStorage, target);
        const session = new VirtualRoomClient(target.name, target.code, identity?.credentials); client.current = session; setRole('client');
        let seededCharacter = Boolean(identity);
        const savedChoice = savedPreferredCharacter('virtual');
        setIp(target.host); setPort(target.port); setName(target.name); setCode(target.code);
        const first = await LanRoomNative.addListener('clientMessage', event => {
          if (!alive.current) return;
          try {
            if (handleClientAsset(event.text, session)) return;
            session.receive(event.text).forEach(send); show(session.view());
            const live = session.view(), myId = session.savedCredentials()?.playerId;
            if (live) ensureClientAssets(live);
            if (live && myId && !seededCharacter) {
              seededCharacter = true;
              if (savedChoice) send(session.character(savedChoice));
              else {
                const assigned = live.seats.find(seat => seat.playerId === myId)?.character;
                if (assigned) { selectedCharacterRef.current = assigned; setSelectedCharacter(assigned); }
              }
            }
            showEmotes(session.takeEmotes());
            const credentials = session.savedCredentials(); setMine(credentials?.playerId ?? ''); setLinked(session.active); setError(session.error ? readableError(session.error) : '');
            if (session.active) { reconnect.current?.success(); retryAllowed.current = true; setTerminal(false); }
            if (terminalErrors.has(session.error)) { cancelReconnect(); setTerminal(true); show(null); setLinked(false); }
            if (credentials) { const next: RoomSave = { format: 'musou.local.room', version: 1, role: 'client', name: target.name, ...endpoint.current, code: target.code, credentials };
              saveRoom(localStorage, next); setSavedRoom(summarizeSave(next)); }
            else if (['CLOSED', 'KICKED', 'SESSION_REPLACED'].includes(session.error)) { clearRoom(localStorage); setSavedRoom(null); }
          } catch (cause) { fail(cause); if (cause instanceof Error && terminalErrors.has(cause.message)) { cancelReconnect(); setTerminal(true); show(null); setLinked(false); } }
        });
        if (!alive.current) { await first.remove(); return; } handles.current.push(first);
        const second = await LanRoomNative.addListener('clientState', event => {
          if (!alive.current) return;
          try { if (event.state === 'connected') { if (retryAllowed.current) reconnect.current?.connected(); send(session.connected()); } else if (['disconnected', 'error'].includes(event.state)) {
            setDealRound(''); observed.current = null; session.disconnected(); setLinked(false);
            if (!leaving.current && retryAllowed.current) { setError('连接已断开'); queueReconnect(); }
          } } catch (cause) { fail(cause); }
        });
        if (!alive.current) { await second.remove(); return; } handles.current.push(second);
        installed = true;
      }
      await LanRoomNative.connect({ host: target.host, port: target.port }); if (!alive.current) await LanRoomNative.disconnect();
      else if (!client.current?.active && retryAllowed.current) reconnect.current?.awaitSnapshot();
    } catch (cause) {
      if (!installed) { await Promise.allSettled(handles.current.splice(0).map(item => item.remove())); client.current = null; discovery.current = false; if (alive.current) setRole('none'); }
      fail(cause); if (installed) queueReconnect();
    } finally { connectionBusy.current = false; if (alive.current) setBusy(false); }
  };
  const leave = async () => {
    setEmotes([]);
    leaving.current = true; cancelReconnect();
    if (connectionBusy.current) { leaving.current = false; setError('连接操作尚未结束，请稍后再退出'); return; }
    connectionBusy.current = true;
    setBusy(true);
    try {
      // Save before close marks the in-memory Host closed. Leaving keeps recoverable seats.
      if (room.current) saveRoom(localStorage, { format: 'musou.local.room', version: 1, role: 'host', checkpoint: room.current.exportCheckpoint() });
      await host.current?.close(); host.current = null; room.current = null;
      hostAssets.current?.clear(); hostAssets.current = null; clientAssetReceiver.current.clear(); clientAssetRequests.current.clear();
      await Promise.allSettled(handles.current.splice(0).map(item => item.remove()));
      if (client.current) await LanRoomNative.disconnect(); client.current = null;
      await LanRoomNative.stopDiscovery(); discovery.current = false; show(null); setRole('none'); setMine(''); setLinked(false); setAddress(''); setError(''); setTerminal(false); setRuleEditorOpen(false);
      // The explicit “放弃旧存档” action is the only local reset.
    } catch (cause) { fail(cause); } finally { connectionBusy.current = false; leaving.current = false; if (alive.current) setBusy(false); }
  };
  const restore = async () => {
    if (!supported || connectionBusy.current || room.current || client.current) return;
    try { const saved = loadRoom(localStorage); if (!saved) { setError('没有可恢复的虚拟房间'); return; }
      if (saved.role === 'host') await create(saved.checkpoint); else await join(saved);
    } catch (cause) { fail(cause); }
  };
  const discover = async () => {
    try {
      if (!discovery.current) {
        discovery.current = true;
        const listener = await LanRoomNative.addListener('roomsChanged', event => { if (alive.current) setRooms(event.rooms.filter(item => item.serviceName.startsWith(prefix))); }).catch(cause => { discovery.current = false; throw cause; });
        if (!alive.current) { await listener.remove(); return; } handles.current.push(listener);
      }
      const found = await LanRoomNative.discoverRooms();
      if (alive.current) setRooms(found.rooms.filter(item => item.serviceName.startsWith(prefix)));
    } catch (cause) { fail(cause); }
  };
  const chooseCharacter = (choice: CharacterChoice) => { selectedCharacterRef.current = choice; setSelectedCharacter(choice); savePreferredCharacter(choice, 'virtual');
    if (room.current) command(() => room.current!.setHostCharacter(choice));
    else if (client.current?.active) try { send(client.current.character(choice)); } catch (cause) { fail(cause); }
  };
  if (view?.game && linked) return <VirtualTable characters={Object.fromEntries(view.seats.map((seat, index) => [seat.playerId, seat.character ?? defaultSeatCharacter(index)]))} onChooseCharacter={chooseCharacter} botIds={view.seats.filter(seat => seat.bot).map(seat => seat.playerId)} emotes={emotes} sendEmote={id => { if (room.current) command(() => room.current!.hostEmote(id)); else try { send(client.current!.emote(id)); } catch (cause) { fail(cause); } }} animateEntrance={dealRound === view.game.roundId} view={view.game} now={now} error={error} roomLabel="LAN 对局" canAdvance={role === 'host'} exit={() => { void leave(); }} next={() => command(() => room.current!.nextRound(view.game!.roundId))} send={intent => {
    if (room.current) command(() => room.current!.hostAction({ ...intent, actionId: crypto.randomUUID(), gameId: view.game!.gameId, roundId: view.game!.roundId, turnId: view.game!.turnId }));
    else try { send(client.current!.action(intent)); } catch (cause) { fail(cause); }
  }} />;
  return <main className="vr-room vr-virtual-room"><header className="vr-room-header"><button className="vr-room-back" disabled={busy} aria-label="返回对局模式" onClick={() => { void (async () => { if (room.current || client.current) await leave(); if (onBack) onBack(); else window.location.href = '/virtual'; })(); }}>‹</button><div><small>麻将无双 · 虚拟麻将</small><h1>{view ? '房间席位' : '好友局域网对局'}</h1></div></header>
    <button className="vr-character-choice" type="button" onClick={() => setCharacterOpen(true)}><CharacterAvatar choice={view?.seats.find(seat => seat.playerId === mine)?.character ?? selectedCharacter} />选择角色</button>
    {characterOpen && <CharacterPicker value={view?.seats.find(seat => seat.playerId === mine)?.character ?? selectedCharacter} onSelect={chooseCharacter} onClose={() => setCharacterOpen(false)} />}
    {!supported && <output>LAN 房间需要 Android App。浏览器可返回单机试打。</output>}{error && <p role="alert">{error}</p>}
    {!view ? <div className="vr-room-layout"><div className="vr-room-profile">
      <section><h2>继续上次房间</h2><p>退出保留身份和存档。房主恢复房间后，玩家可用原身份重连。</p>
        {savedRoom ? <p className="vr-saved-summary"><strong>{savedRoom.title}</strong><span>{savedRoom.detail}</span></p> : <p>暂无可恢复的房间</p>}
        <button disabled={!supported || busy || role !== 'none' || !savedRoom} onClick={() => { void restore(); }}>{savedRoom?.role === 'client' ? '按原身份重连' : '恢复上次房间'}</button>
        <button disabled={!supported || busy || role !== 'none' || !savedRoom} onClick={() => { try { clearRoom(localStorage); setSavedRoom(null); setError('存档已清除'); } catch (cause) { fail(cause); } }}>放弃旧存档</button>
      </section>
      <label>玩家名<input maxLength={24} disabled={role === 'client'} value={name} onChange={event => setName(event.target.value)} /></label>
      {role === 'client' && <output className="vr-reconnect">{terminal ? '当前连接不可恢复，请返回后重新加入。' : reconnectStatus.kind === 'waiting' ? `连接中断，第 ${reconnectStatus.attempt} 次重试将在 ${reconnectStatus.delayMs! / 1000} 秒后进行` : reconnectStatus.kind === 'trying' ? '正在连接并等待房间同步…' : reconnectStatus.kind === 'paused' ? '应用在后台，重试已暂停' : reconnectStatus.kind === 'exhausted' ? '自动重连次数已用完，可手动重试' : reconnectStatus.kind === 'cancelled' ? '自动重连已取消' : '等待房间响应'}
        {['waiting', 'trying', 'paused'].includes(reconnectStatus.kind) && <button onClick={cancelReconnect}>取消自动重连</button>}
        {!terminal && <button disabled={busy} onClick={() => { void join(); }}>手动重连</button>}
        <button disabled={busy} onClick={() => { void leave(); }}>退出连接</button></output>}
      </div><div className="vr-room-forms"><nav aria-label="房间操作"><button aria-current={formTab === 'create'} onClick={() => setFormTab('create')}>创建房间</button><button aria-current={formTab === 'join'} onClick={() => setFormTab('join')}>加入房间</button></nav>
      {formTab === 'create' ? <><section aria-label="创建房间规则"><RoomRuleEditor rules={rules} change={setRules} basics />
      </section><button className="vr-form-submit" disabled={!supported || busy || role === 'client'} onClick={() => { void create(); }}>创建房间</button></> : <section><h2>加入房间</h2><label>IP<input disabled={role === 'client'} value={ip} onChange={event => setIp(event.target.value)} /></label><label>端口<input disabled={role === 'client'} type="number" value={port} onChange={event => setPort(Number(event.target.value))} /></label><label>房间码<input disabled={role === 'client'} maxLength={32} value={code} onChange={event => setCode(event.target.value.toUpperCase())} /></label>
        <button disabled={!supported || busy || role === 'client'} onClick={() => { void join(); }}>加入房间</button>
        <button disabled={!supported || busy} onClick={() => { void discover(); }}>查找附近房间</button>
        {rooms.map(item => <button key={`${item.host}:${item.port}`} onClick={() => { setIp(item.host); setPort(item.port); setCode(item.serviceName.slice(prefix.length).split(' ')[0]); }}>{item.serviceName} · {item.host}</button>)}
      </section>}</div></div> : <div className="vr-room-active"><div><p className="vr-room-meta">{address && <span>{address}</span>}<span>房间码 {code}</span><span>{view.rules.players}人</span></p>
        <section className="vr-seats">{Array.from({ length: view.rules.players }, (_, index) => { const seat = view.seats[index]; return <article key={index}><h2>{['东', '南', '西', '北'][index]}</h2>{seat && <CharacterAvatar choice={seat.character} className="vr-seat-character" />}<strong className={!seat ? 'vr-seat-empty' : undefined}>{seat?.name ?? '等待加入'}</strong>{seat?.bot && <span className="vr-bot-badge">人机</span>}<p className="vr-seat-status">{seat ? <><span>{seat.connected ? '在线' : '断线'} ·</span><span>{seat.ready ? '已准备' : '未准备'}</span></> : '空席'}</p>
          {role === 'host' && seat && seat.playerId !== mine && <button onClick={() => command(() => room.current!.kick(seat.playerId))}>{seat.bot ? '移除人机' : '移出'}</button>}
        </article>; })}</section>
        {role === 'host' && !view.game && <div className="vr-swap"><label>从<select aria-label="换位起始席" value={swapFrom} onChange={event => setSwapFrom(Number(event.target.value))}>{view.seats.map(seat => <option key={seat.playerId} value={seat.seat}>{['东', '南', '西', '北'][seat.seat]} · {seat.name}</option>)}</select></label><label>到<select aria-label="换位目标席" value={swapTo} onChange={event => setSwapTo(Number(event.target.value))}>{view.seats.map(seat => <option key={seat.playerId} value={seat.seat}>{['东', '南', '西', '北'][seat.seat]} · {seat.name}</option>)}</select></label><button disabled={swapFrom === swapTo || swapFrom >= view.seats.length || swapTo >= view.seats.length} onClick={() => command(() => room.current!.swapSeats(swapFrom, swapTo))}>交换两席</button></div>}
        <div className="vr-room-actions">{linked ? <button disabled={Boolean(view.game)} onClick={() => { const ready = !view.seats.find(seat => seat.playerId === mine)?.ready; if (room.current) command(() => room.current!.setHostReady(ready)); else try { send(client.current!.ready(ready)); } catch (cause) { fail(cause); } }}>{view.seats.find(seat => seat.playerId === mine)?.ready ? '取消准备' : '准备'}</button> : <><button disabled={busy || terminal} onClick={() => { void join(); }}>手动重连</button>{['waiting', 'trying', 'paused'].includes(reconnectStatus.kind) && <button onClick={cancelReconnect}>取消自动重连</button>}</>}
          {role === 'host' && !view.game && <button disabled={view.seats.length >= view.rules.players} onClick={() => command(() => room.current!.addBot())}>添加人机</button>}
          {role === 'host' && <button disabled={view.seats.length !== view.rules.players || view.seats.some(seat => !seat.ready || !seat.connected)} onClick={() => command(() => room.current!.start())}>开始对局</button>}
          <button disabled={busy} onClick={() => { void leave(); }}>{role === 'host' ? '暂停并退出房间' : '暂时离开房间'}</button></div>
      </div><aside><RoomRuleSummary rules={view.rules} />{role === 'host' && !view.game && <button onClick={() => setRuleEditorOpen(true)}>调整规则</button>}</aside></div>}
    {ruleEditorOpen && role === 'host' && view && !view.game && <dialog open className="vr-rule-modal" aria-modal="true" aria-label="调整房间规则"><div><header><h2>调整房间规则</h2><p>应用后所有玩家需重新准备。</p>{error && <p role="alert">{error}</p>}</header><div className="vr-rule-modal-scroll"><RoomRuleEditor rules={rules} change={setRules} basics /></div><div className="vr-rule-modal-actions"><button onClick={() => { if (command(() => room.current!.changeRules(rules))) setRuleEditorOpen(false); }}>应用并取消准备</button><button onClick={() => { setRules(view.rules); setRuleEditorOpen(false); }}>取消</button></div></div></dialog>}
  </main>;
}
