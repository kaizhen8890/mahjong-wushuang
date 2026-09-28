'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
// A full document navigation leaves the isolated practice Host behind.
// next/link currently resolves a second React runtime in the local Vinext preview.
/* eslint-disable nextjs/no-html-link-for-pages */
import { VirtualTable } from '@/app/components/virtual-mahjong/table';
import { MahjongMatchEngine } from '@/lib/virtual-mahjong/match-engine';
import { defaultRules } from '@/lib/virtual-mahjong/rules';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import type { RoundIntent } from '@/lib/virtual-mahjong/round-engine';
import { DEFAULT_CHARACTER, defaultSeatCharacter, type CharacterChoice } from '@/lib/characters';
import { preferredCharacter, savePreferredCharacter } from '@/app/components/character-picker';
const ScenarioLab = process.env.NODE_ENV === 'development' ? lazy(() => import('@/app/components/virtual-mahjong/scenario-lab')) : null;

/** Local practice adapter. React receives only player A's projection; the engine stays in a Host ref. */
export default function VirtualPractice({ onBack }: { onBack?: () => void } = {}) {
  const host = useRef<MahjongMatchEngine | null>(null);
  const sequence = useRef(0);
  const [view, setView] = useState<PlayerVisibleGameState | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [lab, setLab] = useState(false);
  const [character, setCharacter] = useState<CharacterChoice>(DEFAULT_CHARACTER);
  const refresh = () => { if (host.current) setView(host.current.view({ role: 'player', playerId: 'a' })); setNow(Date.now()); };
  const start = () => {
    host.current = new MahjongMatchEngine({ gameId: crypto.randomUUID(), rules: defaultRules(), dealerSeat: 0,
      players: [{ id: 'a', name: '我' }, { id: 'b', name: '下家' }, { id: 'c', name: '对家' }, { id: 'd', name: '上家' }] }, { now: () => Date.now() });
    setError(''); refresh();
  };
  const send = (intent: RoundIntent) => {
    const engine = host.current; if (!engine || !view) return;
    const response = engine.dispatch('a', { ...intent, gameId: view.gameId, roundId: view.roundId, turnId: view.turnId,
      actionId: `local:${++sequence.current}` });
    setError(response.ok ? '' : '操作状态已更新，请重新选择。'); refresh();
  };
  useEffect(() => {
    const launch = window.setTimeout(() => { setCharacter(preferredCharacter('virtual')); start(); }, 0);
    const timer = setInterval(() => {
      const engine = host.current; if (!engine) return;
      engine.tick();
      // Deliberately simple practice seats: no AI rule decisions, just Host-authorized pass/discard.
      for (const playerId of ['b', 'c', 'd']) {
        const state = engine.view({ role: 'player', playerId });
        const envelope = { gameId: state.gameId, roundId: state.roundId, turnId: state.turnId, actionId: `practice:${++sequence.current}` };
        if (state.availableActions.canPass) engine.dispatch(playerId, { ...envelope, kind: 'RESPOND', optionId: 'pass' });
        else if (state.phase.playerId === playerId && state.availableActions.discardableTileIds.length && state.clock && Date.now() - state.clock.startedAt >= 1000) {
          const player = state.players.find(item => item.id === playerId)!;
          const choices = state.availableActions.discardableTileIds;
          engine.dispatch(playerId, { ...envelope, kind: 'DISCARD', tileId: choices.includes(player.drawnTileId ?? -1) ? player.drawnTileId : choices[0] });
        }
      }
      setView(engine.view({ role: 'player', playerId: 'a' })); setNow(Date.now());
    }, 250);
    return () => { clearTimeout(launch); clearInterval(timer); };
  }, []);
  if (lab && ScenarioLab) return <Suspense fallback={<p>加载牌例…</p>}><ScenarioLab exit={() => { setLab(false); start(); }} /></Suspense>;
  if (!view) return <main className="vm-lobby" aria-label="正在准备单机牌桌">正在准备单机牌桌…</main>;
  return <><VirtualTable animateEntrance view={view} now={now} error={error} send={send} characters={{ a: character, b: defaultSeatCharacter(1), c: defaultSeatCharacter(2), d: defaultSeatCharacter(3) }} onChooseCharacter={choice => { setCharacter(choice); savePreferredCharacter(choice, 'virtual'); }} exit={() => { host.current = null; if (onBack) onBack(); else window.location.href = '/'; }} next={() => {
    const result = host.current!.advanceRound({ gameId: view.gameId, roundId: view.roundId });
    setError(result.ok ? '' : '暂时无法进入下一局，请重试。'); refresh();
  }} />{ScenarioLab && <button style={{ position: 'fixed', left: 10, bottom: 2, zIndex: 60, background: '#172139', color: '#ffe4b9' }} onClick={() => { host.current = null; setLab(true); }}>开发牌例</button>}</>;
}
