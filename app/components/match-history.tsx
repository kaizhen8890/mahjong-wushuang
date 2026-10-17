'use client';
import type { GameState } from '@/lib/mahjong';
import { CharacterAvatar } from './character-picker';

export function MatchHistory({ game }: { game: GameState }) {
  return <div className="match-history-body"><p className="match-history-count">共 {game.history.length} 条 · 从新到旧</p><div className="match-history-list">
    {game.history.length === 0 && <p className="match-history-empty">还没有对局记录，后续操作会显示在这里。</p>}
    {[...game.history].reverse().map(event => <article key={event.id}>
      <header><strong>{event.title}</strong><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></header>
      <p>{event.detail}</p>
      {event.deltas && <div className="match-history-deltas">{Object.entries(event.deltas).map(([id, delta]) => { const player = game.players.find(item => item.id === id); return <div key={id}>{player && <CharacterAvatar choice={player.character} />}<span>{player?.wind && <small>{player.wind}家</small>}{player?.name ?? id}</span><b data-sign={delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'zero'}>{delta > 0 ? '+' : ''}{delta.toLocaleString('zh-CN')}<small> 点</small></b></div>; })}</div>}
    </article>)}
  </div></div>;
}
