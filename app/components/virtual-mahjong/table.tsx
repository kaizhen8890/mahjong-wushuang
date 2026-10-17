'use client';
/* oxlint-disable next/no-img-element -- Original local SVG tile artwork works offline. */
import { Fragment, useState, useRef, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import type { RoundIntent } from '@/lib/virtual-mahjong/round-engine';
import { tileCode } from '@/lib/virtual-mahjong/tiles';
import { isVisibleDora } from '@/lib/virtual-mahjong/dora-display';
import { ownHand, relativeSeat, meldDisplay, choiceTiles, distinctCalls } from '@/lib/virtual-mahjong/table-view';
import { tenpaiGuide } from '@/lib/virtual-mahjong/tenpai-guide';
import { tileName } from '../mahjong-tile';
import { PresentationOverlay, WinParticles } from '../table-presentation';
import { CenterDial } from './center-dial';
import { useVirtualPresentation } from './use-presentation';
import { useRiichiMusic, useCountdownSound, setTableSoundGain } from '@/app/hooks/use-game-audio';
import { playGameSound } from '@/app/hooks/use-game-audio';
import { VIRTUAL_AUDIO } from '@/lib/virtual-mahjong/audio';
import { ResultPresentation } from './result-presentation';
import { TableEmotes } from './emotes';
import type { VirtualEmote } from '@/lib/virtual-mahjong/emotes';
import { TileFace } from './tile-face';
export { TileFace } from './tile-face';
import { TenpaiSeal } from './tenpai-seal';
import './table.css';
import { Table3D } from './table-3d';
import './table-3d.css';
import './theme.css';
import './safe-area.css';
import { tableClock } from '@/lib/virtual-mahjong/table-clock';
import { CharacterAvatar, CharacterPicker } from '../character-picker';
import type { CharacterChoice } from '@/lib/characters';
import { useTableOrientation } from './use-table-orientation';
import { useTableEffects } from './use-table-effects';
import { automaticIntent, DEFAULT_TABLE_ASSISTS, displayHandOrder, moveHandTile, type TableAssists } from './table-assists';
import './table-assists.css';
import './tenpai-guide.css';
import { TableSettingsPanel } from './settings-panel';
import { CallChoice } from './call-choice';

import { DEFAULT_QUALITY, QUALITY_STORAGE_KEY, isTableQuality, type TableQuality } from './three/quality';

const labels = { chi: '吃', pon: '碰', daiminkan: '杠', ankan: '暗杠', kakan: '加杠', ron: '荣' };

export function VirtualTable({ view, now, send, next, exit, emotes, sendEmote, botIds = [], characters = {}, onChooseCharacter, error = '', roomLabel = '单机试打', canAdvance = true, animateEntrance = false }: {
  view: PlayerVisibleGameState; now: number; send: (intent: RoundIntent) => void; next: () => void; exit: () => void; error?: string; roomLabel?: string; canAdvance?: boolean; animateEntrance?: boolean; emotes?: VirtualEmote[]; sendEmote?: (id: string) => void | boolean | Promise<void | boolean>; botIds?: string[];
  characters?: Record<string, CharacterChoice>; onChooseCharacter?: (value: CharacterChoice) => void;
}) {
  const [three, setThree] = useState(true);
  const root = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const entrance = animateEntrance && !entered;
  const [reduced, setReduced] = useState(false);
  useTableOrientation();
  useTableEffects(root, view, entrance, reduced);
  const [quality, setQuality] = useState<TableQuality>(() => { try { const saved = localStorage.getItem(QUALITY_STORAGE_KEY); if (isTableQuality(saved)) return saved; } catch { /* Storage is optional. */ } return DEFAULT_QUALITY; });
  const changeQuality = (value: TableQuality) => { setQuality(value); try { localStorage.setItem(QUALITY_STORAGE_KEY, value); } catch { /* Storage is optional. */ } };
  const [graphicsError, setGraphicsError] = useState('');
  const presentation = useVirtualPresentation(view);
  const own = view.players.find(player => player.id === view.viewerId)!;
  const context = `${view.gameId}:${view.roundId}:${view.turnId}:${view.phase.kind}`;
  const roundKey = `${view.gameId}:${view.roundId}:${view.viewerId}`;
  const [selection, setSelection] = useState<{ context: string; id: number } | null>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; id: number; context: string;
    held: boolean; reordering: boolean; initialOrder: number[]; timer: number | null } | null>(null);
  const suppressGestureClick = useRef(false);
  const [gestureActive, setGestureActive] = useState(false);
  const [heldTileId, setHeldTileId] = useState<number | null>(null);
  const [draggedTileId, setDraggedTileId] = useState<number | null>(null);
  const [assists, setAssists] = useState<TableAssists>(() => ({ ...DEFAULT_TABLE_ASSISTS }));
  const [handOrder, setHandOrder] = useState<{ roundKey: string; ids: number[] }>({ roundKey: '', ids: [] });
  const [riichiContext, setRiichiContext] = useState('');
  const [picker, setPicker] = useState<{ context: string; kind: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tenpaiOpen, setTenpaiOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [sound, setSound] = useState(1), [music, setMusic] = useState(.42), [track, setTrack] = useState('random');
  useEffect(() => { setTableSoundGain(sound); return () => setTableSoundGain(1); }, [sound]);
  const actions = view.availableActions;
  const riichi = riichiContext === context && actions.riichiDiscardTileIds.length > 0;
  const selected = gestureActive ? heldTileId : selection?.context === context ? selection.id : null;
  const legal = riichi ? actions.riichiDiscardTileIds : actions.discardableTileIds;
  const canSelected = selected !== null && legal.includes(selected);
  const sortedHand = ownHand(view);
  const hand = displayHandOrder(sortedHand, handOrder.roundKey === roundKey ? handOrder.ids : [], assists.sort);
  const guide = useMemo(() => (view.result || !own.hand ? null : tenpaiGuide(view, selected)), [view, selected, own.hand, view.result]);
  const guideOpen = tenpaiOpen && Boolean(guide?.tenpai);
  useEffect(() => { if (!guide?.tenpai) setTenpaiOpen(false); }, [guide?.tenpai]);
  const visibleCalls = distinctCalls(actions.callOptions, own.hand ?? []);
  const callKinds = [...new Set(visibleCalls.map(option => option.kind))];
  const choices = picker?.context === context ? (picker.kind === 'self'
    ? actions.selfKanOptions.map(option => ({ id: option.id, kind: option.kind, tiles: option.tileIds, self: true }))
    : visibleCalls.filter(option => option.kind === picker.kind).map(option => ({ id: option.id, kind: option.kind, tiles: option.consumeTileIds, self: false }))) : [];
  const timer = tableClock(view, now);
  const seconds = timer?.total ?? null;
  useRiichiMusic(!view.result && view.players.some(player => player.riichi !== 'none'), track, music);
  useCountdownSound(!view.result && (legal.length > 0 || actions.canPass), seconds ?? 0);
  const autoChoice = view.result || presentation.pending ? null : automaticIntent(actions, own.drawnTileId ?? null, assists, riichi);
  const autoKey = autoChoice ? `${context}:${view.viewerId}:${JSON.stringify(autoChoice)}` : '';
  const autoDelay = autoChoice?.kind === 'DISCARD' ? 450 : 180;
  const lastAutoKey = useRef('');
  const latestSend = useRef(send), latestAutoChoice = useRef(autoChoice);
  useEffect(() => { latestSend.current = send; latestAutoChoice.current = autoChoice; }, [send, autoChoice]);
  const sendIntent = (intent: RoundIntent) => { lastAutoKey.current = autoKey; send(intent); };
  useEffect(() => {
    if (!autoKey || lastAutoKey.current === autoKey) return;
    const timer = window.setTimeout(() => {
      if (lastAutoKey.current === autoKey) return;
      const intent = latestAutoChoice.current;
      if (!intent) return;
      lastAutoKey.current = autoKey;
      latestSend.current(intent);
    }, autoDelay);
    return () => window.clearTimeout(timer);
  }, [autoKey, autoDelay]);
  const toggleAssist = (key: keyof TableAssists) => {
    if (key === 'sort' && assists.sort) setHandOrder({ roundKey, ids: hand.map(tile => tile.id) });
    setAssists(current => ({ ...current, [key]: !current[key] }));
  };
  const discard = (id: number) => { setSelection(null); sendIntent({ kind: riichi ? 'RIICHI' : 'DISCARD', tileId: id }); };
  const actCall = (kind: typeof callKinds[number]) => {
    const options = visibleCalls.filter(option => option.kind === kind);
    if (options.length === 1) sendIntent({ kind: 'RESPOND', optionId: options[0].id });
    else setPicker({ context, kind });
  };
  const pickTile = (id: number) => {
    if (!legal.includes(id)) return;
    const tile = hand.find(item => item.id === id); if (!tile) return;
    setHover(tile.type); playGameSound(VIRTUAL_AUDIO.select, 0.5);
    if (selected === id && !confirmMode) discard(id); else setSelection({ context, id });
  };
  const tileUnderFinger = (x: number, y: number): number | null => {
    const button = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('.vm-hand button[data-tile-id]');
    const id = button ? Number(button.dataset.tileId) : null;
    return id !== null && legal.includes(id) ? id : null;
  };
  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.timer !== null) window.clearTimeout(current.timer);
    if (current.reordering) {
      if (event.type === 'pointercancel') setHandOrder({ roundKey, ids: current.initialOrder });
      setDraggedTileId(null);
      suppressGestureClick.current = true;
    } else if (current.held) {
      const id = event.type === 'pointercancel' ? null : tileUnderFinger(event.clientX, event.clientY);
      setSelection(id === null ? null : { context, id });
      suppressGestureClick.current = true;
    }
    gesture.current = null;
    setGestureActive(false);
    setHeldTileId(null);
  };
  return <main ref={root} data-reduced={reduced} className={`vm-shell ${three ? 'vm-is-three' : ''}`} onClickCapture={event => { const target = event.target as HTMLElement; if (target.closest('button') && !target.closest('.vm-hand')) playGameSound(VIRTUAL_AUDIO.button, 0.4); }}>
    <PresentationOverlay sequence={presentation} characters={characters} />
    <div className="vm-portrait"><span>麻将无双</span><strong>请横屏体验牌桌</strong><p>旋转设备后继续；若系统限制旋转，可以先返回。</p><button type="button" onClick={exit}>返回</button></div>
    <section className="vm-stage" aria-label="虚拟麻将牌桌">
      {!view.result && <TableEmotes key={`${view.gameId}:${view.roundId}`} view={view} events={emotes} send={sendEmote} />}
      {three && <Table3D entrance={entrance} reduced={reduced} view={view} selection={{ selected, legal, riichi, highlight: hover }} quality={quality} pick={pickTile} fail={message => { setGraphicsError(message); setThree(false); }} />}
      <header className="vm-toolbar"><button aria-label="牌桌设置" onClick={() => setSettingsOpen(!settingsOpen)}>⚙</button><button aria-label="退出牌桌" onClick={exit}>退出</button></header>
      {settingsOpen && <TableSettingsPanel close={() => setSettingsOpen(false)} three={three} toggleThree={() => { setGraphicsError(''); setEntered(true); setThree(!three); }} quality={quality} changeQuality={changeQuality} graphicsError={graphicsError} reduced={reduced} setReduced={setReduced} sound={sound} setSound={setSound} music={music} setMusic={setMusic} track={track} setTrack={setTrack} confirmMode={confirmMode} setConfirmMode={setConfirmMode} chooseCharacter={onChooseCharacter ? () => setCharacterOpen(true) : undefined} />}
      {characterOpen && onChooseCharacter && <CharacterPicker value={view.viewerId ? characters[view.viewerId] : undefined} onSelect={onChooseCharacter} onClose={() => setCharacterOpen(false)} />}
      <nav className="vm-auto-controls" aria-label="自动操作开关">{([['sort', '理', '自动理牌'], ['win', '和', '自动和牌'], ['call', '鸣', '自动鸣牌'], ['cut', '切', '自动摸切']] as const).map(([key, glyph, label]) => <button key={key} type="button" aria-label={label} title={label} aria-pressed={assists[key]} onClick={() => toggleAssist(key)}>{glyph}</button>)}</nav>
      <aside className="vm-dora-panel"><div className="vm-dora" aria-label="宝牌指示牌">{Array.from({ length: 5 }, (_, index) => <span key={view.doraIndicators[index]?.id ?? `back-${index}`}><TileFace tile={view.doraIndicators[index]} /></span>)}</div><div>{view.honba} 本场 <span>供托 {view.riichiSticks}</span></div><small>麻将无双 · {roomLabel}</small></aside>
      <CenterDial view={view} presentation={presentation} />
      {view.players.map(player => {
        const relative = relativeSeat(player.seat, own.seat, view.players.length);
        const active = view.phase.playerId === player.id;
        return <Fragment key={player.id}>
          <div data-player-id={player.id} className={`vm-player vm-player-${relative} ${active ? 'vm-active' : ''} ${player.riichi !== 'none' ? 'vm-player-riichi' : ''}`}><span className={`vm-avatar wind-seal ${player.wind === 'east' ? 'is-east' : ''}`}><CharacterAvatar choice={characters[player.id]} /></span><strong>{player.name}</strong>{botIds.includes(player.id) && <small className="vm-bot">人机</small>}{(!player.connected || player.riichi !== 'none') && <small>{!player.connected ? '断线' : '立直'}</small>}<WinParticles active={presentation.event?.kind === 'win' && presentation.event.playerId === player.id && presentation.phase === 'impact'} /></div>
          {player.nuki.length > 0 && <div hidden={three} className={`vm-nuki-row vm-nuki-${relative}`} aria-label={`${player.name}拔北${player.nuki.length}张`}>{player.nuki.map(tile => <span key={tile.id}><TileFace tile={tile} shine={isVisibleDora(tile, view.doraIndicators, view.rules.players)} /></span>)}</div>}
          <div hidden={three} className={`vm-outer vm-outer-${relative}`}>
          {relative !== 0 && <div className="vm-concealed" aria-label={`${player.name}暗牌${player.handCount}张`}>{Array.from({ length: player.handCount }, (_, i) => <TileFace key={i} back />)}</div>}
          <div className="vm-melds">{player.melds.map(meld => <div className="vm-meld" key={meld.id} aria-label={labels[meld.kind]}>{meldDisplay(meld, player.seat, view.players).map(item => <span key={item.tile.id} className={`${item.sideways ? 'vm-sideways' : ''} ${item.added ? 'vm-added' : ''}`}><TileFace tile={item.tile} back={item.back} shine={!item.back && isVisibleDora(item.tile, view.doraIndicators, view.rules.players)} /></span>)}</div>)}</div>
        </div><div hidden={three} className={`vm-seat vm-seat-${relative}`}>
          <div className={`vm-river ${player.river.filter(item => !item.calledBy).length > 18 ? 'vm-long-river' : ''}`} aria-label={`${player.name}牌河`}>{Array.from({ length: Math.ceil(player.river.filter(item => !item.calledBy).length / 6) }, (_, row) => <div className="vm-river-row" key={row}>{player.river.filter(item => !item.calledBy).slice(row * 6, row * 6 + 6).map(discarded => <span key={discarded.tile.id} className={`${discarded.riichi ? 'vm-sideways' : ''} ${view.phase.call?.tile.id === discarded.tile.id ? 'vm-call-target' : ''} ${hover === discarded.tile.type ? 'vm-highlight' : ''}`} onPointerEnter={() => setHover(discarded.tile.type)} onPointerLeave={() => setHover(null)}><TileFace tile={discarded.tile} shine={isVisibleDora(discarded.tile, view.doraIndicators, view.rules.players)} /></span>)}</div>)}</div>
        </div></Fragment>;
      })}
      <div className="vm-actions" aria-label="合法操作">
        {timer && <span className={`vm-time ${timer.total <= 5 ? 'vm-urgent' : ''}`} aria-label={timer.fixed === null ? `剩余${timer.total}秒` : `基本时间${timer.fixed}秒，额外时间${timer.extra}秒`}>{timer.fixed === null ? timer.total : <>{timer.fixed}<small> + </small><b>{timer.extra}</b></>}<small>秒</small></span>}
        {actions.canTsumo && <button className="vm-win" onClick={() => sendIntent({ kind: 'TSUMO' })}>自摸</button>}
        {actions.riichiDiscardTileIds.length > 0 && <button className={`vm-riichi ${riichi ? 'vm-chosen' : ''}`} aria-pressed={riichi} onClick={() => { setRiichiContext(riichi ? '' : context); setSelection(null); }}>{riichi ? '取消立直' : '立直'}</button>}
        {actions.selfKanOptions.length > 0 && <button onClick={() => setPicker({ context, kind: 'self' })}>杠</button>}
        {actions.nukiTileIds.length > 0 && <button onClick={() => sendIntent({ kind: 'NUKI', tileId: actions.nukiTileIds[0] })}>拔北</button>}
        {callKinds.map(kind => <button className={kind === 'ron' ? 'vm-win' : ''} key={kind} onClick={() => actCall(kind)}>{labels[kind]}</button>)}
        {actions.canPass && <button className="vm-pass" onClick={() => sendIntent({ kind: 'RESPOND', optionId: 'pass' })}>过</button>}
        {actions.canAbortNineTerminals && <button className="vm-pass" onClick={() => sendIntent({ kind: 'ABORT_NINE_TERMINALS' })}>九种九牌</button>}
        {confirmMode && canSelected && <button onClick={() => discard(selected!)}>确认出牌</button>}
      </div>
      <div className={`vm-hand${assists.sort ? '' : ' vm-hand-manual'}${guideOpen ? ' vm-tenpai-open' : ''}`} aria-label="我的手牌" onContextMenu={event => event.preventDefault()}
        onDragStart={event => event.preventDefault()} onPointerDown={event => {
        suppressGestureClick.current = false;
        if (event.button !== 0 || (assists.sort && event.pointerType === 'mouse')) return;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-tile-id]');
        const id = button ? Number(button.dataset.tileId) : null;
        if (id === null || (assists.sort && !legal.includes(id))) return;
        const current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, id, context,
          held: false, reordering: false, initialOrder: hand.map(tile => tile.id), timer: null as number | null };
        gesture.current = current;
        if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId);
        if (event.pointerType !== 'mouse' && legal.includes(id)) current.timer = window.setTimeout(() => {
            if (gesture.current !== current) return;
            current.held = true; setGestureActive(true); setHeldTileId(id);
            playGameSound(VIRTUAL_AUDIO.select, 0.35);
          }, 330);
      }} onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (current.context !== context) { if (current.timer !== null) window.clearTimeout(current.timer); gesture.current = null; setDraggedTileId(null); return; }
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.held && !current.reordering && Math.hypot(dx, dy) > 10) {
          if (current.timer !== null) window.clearTimeout(current.timer);
          current.timer = null;
          if (!assists.sort && Math.abs(dx) >= Math.abs(dy) * .8) {
            current.reordering = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelection(null); setDraggedTileId(current.id);
          }
        }
        if (current.reordering) {
          const button = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('.vm-hand button[data-tile-id]');
          if (!button) return;
          const targetId = Number(button.dataset.tileId);
          const after = event.clientX > button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2;
          setHandOrder(previous => {
            const ids = displayHandOrder(sortedHand, previous.roundKey === roundKey ? previous.ids : [], false).map(tile => tile.id);
            const next = moveHandTile(ids, current.id, targetId, after);
            return next.every((id, index) => ids[index] === id) ? previous : { roundKey, ids: next };
          });
          return;
        }
        if (current.held) {
          const id = tileUnderFinger(event.clientX, event.clientY);
          setHeldTileId(id);
          const tile = hand.find(item => item.id === id);
          setHover(tile?.type ?? null);
        }
      }} onPointerUp={endGesture} onPointerCancel={endGesture}>{hand.map(tile => <button key={tile.id} data-tile-id={tile.id} aria-label={`${tileName(tileCode(tile))}${tile.id === own.drawnTileId ? '，摸牌' : ''}`} aria-pressed={selected === tile.id}
        disabled={assists.sort && !legal.includes(tile.id)} aria-disabled={!legal.includes(tile.id)} className={`${tile.id === own.drawnTileId ? 'vm-drawn' : ''} ${selected === tile.id ? 'vm-selected' : ''} ${draggedTileId === tile.id ? 'vm-moving' : ''} ${hover === tile.type || view.phase.call?.tile.type === tile.type ? 'vm-highlight' : ''} ${riichi && legal.includes(tile.id) ? 'vm-riichi-option' : ''}`}
        onPointerEnter={() => setHover(tile.type)} onPointerLeave={() => setHover(null)} onClick={() => {
          if (suppressGestureClick.current) { suppressGestureClick.current = false; return; }
          if (!legal.includes(tile.id)) return;
          setHover(tile.type); playGameSound(VIRTUAL_AUDIO.select, 0.5);
          if (selected === tile.id && !confirmMode) discard(tile.id); else setSelection({ context, id: tile.id });
        }}><TileFace tile={tile} shine={isVisibleDora(tile, view.doraIndicators, view.rules.players)} /></button>)}{guide?.tenpai && <TenpaiSeal guide={guide} open={guideOpen} onOpenChange={setTenpaiOpen} />}</div>
      {own.furiten && !view.result && <output className="vm-furiten" aria-label="振听，不能荣和，仍可合法自摸"><strong>振听</strong><small>不能荣和</small></output>}
      {(error || graphicsError) && <footer className="vm-hint" aria-live="polite">{error || graphicsError}</footer>}
      {choices.length > 0 && <CallChoice choices={choices.map(option => ({ id: option.id, self: option.self, label: labels[option.kind], tiles: choiceTiles(own.hand!, option.tiles, option.self ? undefined : view.phase.call?.tile) }))} close={() => setPicker(null)} choose={option => { setPicker(null); sendIntent({ kind: option.self ? 'KAN' : 'RESPOND', optionId: option.id }); }} />}
      {view.result && !presentation.pending && <ResultPresentation key={view.roundId} view={view} before={presentation.resultBefore} next={next} exit={exit} canAdvance={canAdvance} characters={characters} />}
    </section>
  </main>;
}

