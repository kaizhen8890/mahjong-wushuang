import type { CSSProperties } from 'react';
import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
import { relativeSeat } from '@/lib/virtual-mahjong/table-view';
import { RollingScore } from '../table-presentation';
import type { useVirtualPresentation } from './use-presentation';
import './center-dial.css';

const winds = { east: '东', south: '南', west: '西', north: '北' };
export function CenterDial({ view, presentation }: {
  view: PlayerVisibleGameState; presentation: ReturnType<typeof useVirtualPresentation>;
}) {
  const own = view.players.find(player => player.id === view.viewerId)!;
  // A response window keeps the source highlighted, rather than guessing who will win its arbitration.
  const activeId = view.result ? undefined : view.phase.playerId ?? view.phase.call?.sourcePlayerId;
  return <div className="vm-dial" aria-label="中央风盘">
    <div className="vm-dial-core"><strong>{winds[view.roundWind]}{['', '一', '二', '三', '四'][view.handNumber]}局</strong><div><span>余牌</span><b>{view.wallRemaining}</b></div></div>
    {view.players.map(player => {
      const seat = relativeSeat(player.seat, own.seat, view.players.length);
      const active = player.id === activeId;
      return <div key={player.id} className={`vm-dial-seat ${active ? 'is-active' : ''} ${player.wind === 'east' ? 'is-east' : ''}`}
        style={{ '--dial-turn': `${-seat * 90}deg` } as CSSProperties}
        aria-label={`${winds[player.wind]}位，${player.points}点${active ? '，当前回合' : ''}`}>
        <div className="vm-dial-wind"><span>{winds[player.wind]}</span>{player.wind === 'east' && <small>庄</small>}</div>
        <div className={`vm-dial-score ${Math.abs(player.points) >= 100000 ? 'is-long' : ''}`}><RollingScore value={player.points} playerId={player.id} sequence={presentation} /></div>
        <div className="vm-dial-lamp" aria-hidden="true"><i /><b /></div>
      </div>;
    })}
  </div>;
}
