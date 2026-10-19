'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import type { TablePresentation } from '@/lib/presentation';
import { resultRanks, resultTimeline } from '@/lib/virtual-mahjong/result-timeline';
import { VIRTUAL_AUDIO } from '@/lib/virtual-mahjong/audio';
import { playGameSound, stopGameSound } from '@/app/hooks/use-game-audio';
import { RollingScore } from '../table-presentation';
import { TileFace } from './tile-face';
import { relativeSeat } from '@/lib/virtual-mahjong/table-view';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import { CharacterAvatar, CharacterPortrait } from '../character-picker';
import type { CharacterChoice } from '@/lib/characters';
import './result.css';
const reasons = { ron: '荣和', tsumo: '自摸', exhaustive: '荒牌流局', nagashi: '流局满贯', 'triple-ron': '三家和了', 'nine-terminals': '九种九牌', 'four-winds': '四风连打', 'four-riichi': '四家立直', 'four-kans': '四杠散了' };
const winds = { east: '东', south: '南', west: '西', north: '北' };

export function ResultPresentation({ view: initialView, before: initialBefore, next, exit, canAdvance, characters = {} }: {
  view: PlayerVisibleGameState; before: PlayerVisibleGameState | null;
  next: () => void; exit: () => void; canAdvance: boolean; characters?: Record<string, CharacterChoice>;
}) {
  // Terminal round data is immutable; room heartbeat snapshots must not restart score animation.
  const [view] = useState(initialView);
  const [before] = useState(initialBefore);
  const timeline = useMemo(() => resultTimeline(view), [view]);
  const [elapsed, setElapsed] = useState(() => before ? 0 : Number.POSITIVE_INFINITY);
  const [review, setReview] = useState<number | null>(null);
  const played = useRef(new Set<string>());
  const done = elapsed >= timeline.end;
  const strike = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDialogElement>(null);
  const striking = elapsed < (timeline.wins[0]?.start ?? 0);
  useLayoutEffect(() => {
    if (!striking) return;
    const payer = before?.phase.call?.sourcePlayerId ?? Object.keys(view.result!.wins[0]?.payments ?? {})[0];
    const place = () => {
      const avatar = Array.from(document.querySelectorAll<HTMLElement>('[data-player-id]')).find(node => node.dataset.playerId === payer)?.querySelector('.vm-avatar');
      const target = avatar ?? document.querySelector('.vm-hand');
      const box = target?.getBoundingClientRect();
      if (box && strike.current) { strike.current.style.left = `${box.left + box.width / 2}px`; strike.current.style.top = `${box.top + box.height / 2}px`; }
    };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [striking, before, view]);
  useEffect(() => {
    if (!before || done) return;
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(value => Math.max(value, performance.now() - started)), 40);
    const hide = () => { if (document.hidden) { setElapsed(Number.POSITIVE_INFINITY); Object.values(VIRTUAL_AUDIO).forEach(stopGameSound); } };
    document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); Object.values(VIRTUAL_AUDIO).forEach(stopGameSound); };
  }, [before, done]);
  useEffect(() => {
    if (done) return;
    for (const cue of timeline.cues) if (elapsed >= cue.at && !played.current.has(cue.id)) {
      played.current.add(cue.id);
      if (elapsed - cue.at < 250) playGameSound(cue.sound, 0.75);
    }
  }, [elapsed, timeline, done]);
  const ranks = useMemo(() => resultRanks(view, before), [view, before]);
  const active = review ?? timeline.wins.findIndex(win => elapsed >= win.start && elapsed < win.end);
  const win = active >= 0 ? view.result!.wins[active] : null;
  const step = active >= 0 ? timeline.wins[active] : null;
  const revealTime = review !== null ? Infinity : elapsed;
  const winner = win && view.players.find(player => player.id === win.playerId)!;
  const event: TablePresentation = useMemo(() => ({ id: `${view.roundId}-score`, createdAt: 0, kind: 'win', playerId: '', playerName: '',
    han: 0, fu: 0, yakuman: 0, limit: '', points: 0, yaku: [], tiles: [],
    scores: ranks.map(player => ({ playerId: player.id, before: player.before, after: player.points })) }), [ranks, view.roundId]);
  const sequence = { event, phase: elapsed < timeline.roll ? 'intro' as const : 'impact' as const };
  const viewer = view.players.find(player => player.id === view.viewerId)!;
  const skip = () => { setElapsed(Infinity); Object.values(VIRTUAL_AUDIO).forEach(stopGameSound); };
  const back = () => { if (review !== null) setReview(null); else skip(); };
  useNativeBackLayer(() => root.current, back);
  return <dialog data-review={review !== null} className={`vr-result ${striking ? 'vr-striking' : ''}`} ref={element => { root.current = element; if (element && !element.open) element.showModal(); }} onCancel={event => { event.preventDefault(); back(); }} aria-label="对局结果">
    <header>{!done && <button onClick={skip}>跳过演出</button>}</header>
    {striking && <div ref={strike} className="vr-ron-strike" aria-label="放铳位置落雷"><i /><strong>荣</strong></div>}
    {!view.result!.wins.length && (review === -1 || elapsed < timeline.points) && <section className="vr-draw-panel" aria-label="流局说明">
      <h2>{reasons[view.result!.reason]}</h2>
      {(review === -1 || elapsed >= timeline.drawDetails) && <div className="vr-draw-details">
        <p>{view.result!.reason === 'exhaustive' ? '听牌与未听罚符' : view.result!.reason === 'nagashi' ? '幺九牌未被鸣取 · 满贯自摸支付 · 不计未听罚符' : '途中流局，不进行未听罚符结算'}</p>
        <div className="vr-draw-players">{view.players.map(player => <article key={player.id}><CharacterAvatar choice={characters[player.id]} /><strong>{player.name}</strong>{view.result!.reason === 'exhaustive' && <b>{view.result!.tenpaiPlayerIds.includes(player.id) ? '听牌' : '未听'}</b>}{view.result!.nagashiPlayerIds?.includes(player.id) && <b>流局满贯</b>}<output>{view.result!.deltas[player.id] > 0 ? '+' : ''}{view.result!.deltas[player.id] ?? 0}</output></article>)}</div>
        <p>{view.matchResult ? '对局结束' : view.roundContinuation ? <>{view.roundContinuation.dealerId === view.dealerId ? '庄家连庄' : '轮换庄家'} · 下一局：{winds[view.roundContinuation.roundWind]}{view.roundContinuation.handNumber}局 · {view.roundContinuation.honba}本场 · 供托{view.roundContinuation.riichiSticks}</> : '等待房主确认下一局'}</p>
      </div>}
    </section>}
    {win && step && winner && <section className="vr-win-scene" key={win.playerId}>
      <h2 className="vr-winner-name">{winner.name}</h2>
      <div className="vr-win-panel">
      <aside className="vr-result-brand"><CharacterPortrait choice={characters[winner.id]} className="vr-result-character" /></aside>
      <div className="vr-win-content">
        <strong className="vr-win-type">{view.result!.reason === 'ron' ? '荣和' : '自摸'}</strong>
        <div className="vr-winning-hand" aria-label="和牌手牌">{win.concealed.filter(tile => tile.id !== win.winningTile.id).sort((a, b) => a.type - b.type || a.id - b.id).map(tile => <TileFace key={tile.id} tile={tile} />)}<span className="vr-winning-last"><TileFace tile={win.winningTile} /></span>{winner.melds.map(meld => <span className="vr-winning-meld" key={meld.id}>{meld.tiles.map(tile => <TileFace tile={tile} key={tile.id} />)}</span>)}</div>
        <div className="vr-indicators">{([['宝牌指示牌', view.doraIndicators], ['里宝牌指示牌', win.uraIndicators]] as const).map(([label, tiles]) => <div key={label} aria-label={label}><b>{label}</b>{Array.from({ length: 5 }, (_, index) => <TileFace key={index} tile={tiles[index]} />)}</div>)}</div>
        {review !== null && <small className="vr-yaku-heading">役种 · {step.rows.length} 项{step.rows.length > 6 ? " · 上下滑动查看" : ""}</small>}<div className="vr-yaku-list">{step.rows.map((row, index) => revealTime >= step.yakuAt[index] && <div className="vr-yaku-row" key={row.id}><span>{row.name}</span><b>{row.value}<small>{row.unit}</small></b></div>)}</div>
        <div className="vr-fan-medallion">{revealTime >= step.fu && !win.yakuman && <small className="vr-fade">{win.fu} 符</small>}{revealTime >= step.han && <strong className="vr-fade">{win.yakuman || win.han}<small>{win.yakuman ? '倍役满' : '番'}</small></strong>}</div>
        {revealTime >= step.score && <output className="vr-point-drop">{win.winnerGain.toLocaleString()}<small>点</small></output>}
      </div>
      </div>
      {revealTime >= step.limit && /满/.test(win.label) && <strong className="vr-limit-drop">{win.label}</strong>}
    </section>}
    {review === null && elapsed >= timeline.points && elapsed < timeline.summary && <section className="vr-score-stage" aria-label="点数变化"><h2>点数变化</h2>{ranks.map((player, index) => {
      const newRank = elapsed >= timeline.ranks + index * timeline.rankStep;
      return <article className={`vr-score-card vr-score-seat-${relativeSeat(player.seat, viewer.seat, ranks.length)}`} key={player.id}><h3>{player.name}{player.id === view.viewerId && <small>自家</small>}</h3><strong key={newRank ? 'new' : 'old'} className={newRank ? 'vr-rank-reveal' : ''}>{newRank ? player.rank : player.oldRank}<small>位</small></strong><div><span className={player.delta >= 0 ? 'vr-positive' : 'vr-negative'}>{player.delta > 0 ? '+' : ''}{player.delta}</span><RollingScore value={player.points} playerId={player.id} sequence={sequence} /></div></article>;
    })}</section>}
    {review === null && elapsed >= timeline.summary && <section className="vr-summary" aria-label="排名总览"><aside><h2>{view.matchResult ? '终局' : '本局结算'}</h2></aside><div>{ranks.map((player, index) => elapsed >= timeline.summary + index * timeline.summaryStep && <article className={`vr-summary-row ${player.rank === 1 ? 'vr-first' : ''}`} key={player.id}><strong>{player.rank}<small>位</small></strong><CharacterAvatar choice={characters[player.id]} /><div><h3>{player.name}{player.id === view.viewerId && <small>自家</small>}</h3><output>{player.points.toLocaleString()}</output></div><span className={player.delta >= 0 ? 'vr-positive' : 'vr-negative'}>{player.delta > 0 ? '+' : ''}{player.delta}</span>{view.matchResult && <small>最终成绩 {view.matchResult.rankings.find(rank => rank.playerId === player.id)!.score}</small>}</article>)}</div></section>}
    {done && <footer>{review === null ? <>{!view.result!.wins.length && <button onClick={() => setReview(-1)}>查看流局说明</button>}{view.result!.wins.map((winner, index) => <button title={`查看${view.players.find(player => player.id === winner.playerId)!.name}牌型`} key={winner.playerId} onClick={() => setReview(index)}>查看{view.players.find(player => player.id === winner.playerId)!.name}牌型</button>)}<button disabled={!view.matchResult && !canAdvance} onClick={view.matchResult ? exit : next}>{view.matchResult ? '返回' : canAdvance ? '下一局' : '等待房主开始下一局'}</button></> : <button onClick={() => setReview(null)}>返回结算</button>}</footer>}
  </dialog>;
}
