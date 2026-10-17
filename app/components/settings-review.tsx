'use client';
import { ArrowRight } from 'lucide-react';
import { WINDS, type GameSettings } from '@/lib/mahjong';
import type { CharacterChoice } from '@/lib/characters';
import { RIICHI_MUSIC } from '@/app/hooks/use-game-audio';
import { CharacterAvatar } from './character-picker';

type PlayerDraft = { name: string; team: string; character?: CharacterChoice };
const LABELS: Record<keyof GameSettings, string> = {
  playerCount: '参与人数', startingPoints: '开局点数', targetPoints: '返还点 / 目标点', wushuang: '麻将无双', bloodBattle: '血战到底', teamsEnabled: '阵营计分', oppositeTeams: '对家自动同队', flyingTiles: '飞牌使用', flowersEnabled: '花牌', flowerTileCount: '实体花牌数量', initialWallCount: '初始牌山', nukiEnabled: '三麻拔北', akaDora: '赤宝牌', openTanyao: '食断', kiriageMangan: '切上满贯', kazoeYakuman: '累计役满', sanmaTsumoLoss: '三麻自摸损', startingSkillCards: '开局技能卡', maxSkillsPerTurn: '每巡技能上限', drawSkillOnFlower: '拔花 / 拔北抽技能', drawSkillOnKan: '杠牌抽技能', turnTimerEnabled: '每巡计时', turnFixedSeconds: '默认固定时间（秒）', turnExtraSeconds: '默认额外时间（秒）', riichiMusicEnabled: '对局音乐', riichiMusicTrack: '立直曲目',
};
function describe(value: GameSettings[keyof GameSettings], key: keyof GameSettings) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (value === null) return '自动计算';
  if (key === 'riichiMusicTrack') return value === 'random' ? '随机播放' : RIICHI_MUSIC.find(track => track.id === value)?.label ?? String(value);
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : String(value);
}

export function SettingsReview({ settings, players, baseline }: { settings: GameSettings; players: PlayerDraft[]; baseline: string }) {
  const [before, oldPlayers] = JSON.parse(baseline) as [GameSettings, PlayerDraft[]];
  const changes = (Object.keys(LABELS) as (keyof GameSettings)[]).filter(key => settings[key] !== before[key]).map(key => ({ label: LABELS[key], from: describe(before[key], key), to: describe(settings[key], key) }));
  players.slice(0, settings.playerCount).forEach((player, index) => {
    const old = oldPlayers[index];
    if (!old) return;
    const name = player.name.trim() || `玩家${['一', '二', '三', '四'][index]}`;
    if (name !== old.name) changes.push({ label: `${WINDS[index]}家名称`, from: old.name, to: name });
    const team = player.team.trim() || (index % 2 === 0 ? '朱雀' : '玄武');
    if (settings.teamsEnabled && team !== old.team) changes.push({ label: `${WINDS[index]}家阵营`, from: old.team, to: team });
    if (JSON.stringify(player.character) !== JSON.stringify(old.character)) changes.push({ label: `${WINDS[index]}家角色`, from: old.character?.name ?? '默认角色', to: player.character?.name ?? '默认角色' });
  });
  return <section className="settings-review" aria-label="开局核对">
    <h3>确认这场新对局</h3>
    <p>每位玩家从 {settings.startingPoints.toLocaleString('zh-CN')} 点开始，本场和供托归零。当前对局可通过撤销恢复。</p>
    <div className="rules-player-preview">{players.slice(0, settings.playerCount).map((player, index) => <div key={index}><CharacterAvatar choice={player.character} /><span><strong>{WINDS[index]} · {player.name.trim() || `玩家${['一', '二', '三', '四'][index]}`}</strong><small>{settings.teamsEnabled ? player.team.trim() || (index % 2 === 0 ? '朱雀' : '玄武') : '个人'}</small></span></div>)}</div>
    <h4>本次改动 <span>{changes.length} 项</span></h4>
    {changes.length ? <dl className="rules-change-list">{changes.map((change, index) => <div key={index}><dt>{change.label}</dt><dd><span>{change.from}</span><ArrowRight aria-hidden="true" /><strong>{change.to}</strong></dd></div>)}</dl> : <p className="rules-no-changes">规则和玩家资料没有修改，将按现有配置重新开局。</p>}
  </section>;
}
