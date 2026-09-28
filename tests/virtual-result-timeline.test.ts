import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resultTimeline, resultRanks, resultYaku } from '../lib/virtual-mahjong/result-timeline';
import { VIRTUAL_AUDIO } from '../lib/virtual-mahjong/audio';
import { createTableScenario } from './helpers/virtual-table-scenarios';
for (const name of ['ron', 'ankan'] as const) {
  const scenario = createTableScenario(name);
  if (name === 'ankan') scenario.act({ kind: 'KAN', optionId: scenario.view().availableActions.selfKanOptions[0].id });
  const before = scenario.view();
  scenario.act(name === 'ron' ? { kind: 'RESPOND', optionId: before.availableActions.callOptions.find(option => option.kind === 'ron')!.id } : { kind: 'TSUMO' });
  const view = scenario.view(), timeline = resultTimeline(view), win = timeline.wins[0];
  assert.equal(timeline.cues.some(cue => cue.sound === VIRTUAL_AUDIO.ron), name === 'ron');
  assert.ok(win.start < win.yakuAt[0] && win.yakuAt.at(-1)! < win.fu && win.fu < win.han && win.han < win.score && win.score < win.limit && win.end <= timeline.points);
  assert.equal(timeline.cues.some(cue => cue.at === win.han), false, 'Total han is silent');
  assert.equal(timeline.cues.filter(cue => cue.sound === VIRTUAL_AUDIO.yaku).length, win.rows.length + 1);
  assert.equal(timeline.cues.some(cue => cue.sound === VIRTUAL_AUDIO.limit), /满/.test(view.result!.wins[0].label));
  assert.ok(timeline.points < timeline.roll && timeline.roll < timeline.ranks && timeline.ranks < timeline.summary);
  assert.ok(win.end - (/满/.test(view.result!.wins[0].label) ? win.limit + 450 : win.score + 400) >= 3000);
  assert.ok(timeline.summary - (timeline.ranks + (view.players.length - 1) * timeline.rankStep + 450) >= 3000);
  assert.ok(timeline.end - (timeline.summary + (view.players.length - 1) * timeline.summaryStep + 450) >= 3000);
  assert.ok(timeline.rankStep >= 450 + 200 && timeline.summaryStep >= 450 + 200);
  assert.deepEqual(resultRanks(view, before).map(player => player.before).sort((a, b) => a - b), before.players.map(player => player.points).sort((a, b) => a - b));
  assert.equal(resultRanks(view, before).reduce((sum, player) => sum + player.delta, 0), Object.values(view.result!.deltas).reduce((a, b) => a + b, 0));
  for (const player of resultRanks(view)) {
    const sound = player.rank === 1 ? VIRTUAL_AUDIO.rank1 : VIRTUAL_AUDIO.rankOther;
    assert.equal(timeline.cues.find(cue => cue.id === `rank-${player.id}`)!.sound, sound);
    assert.equal(timeline.cues.find(cue => cue.id === `summary-${player.id}`)!.sound, sound);
  }
  const modified = structuredClone(view); modified.result!.wins[0].bonus.dora = 5;
  assert.equal(resultYaku(modified, modified.result!.wins[0])[0].name, '宝牌');
  const multi = structuredClone(view); multi.result!.wins.push({ ...multi.result!.wins[0], playerId: view.players[1].id });
  const multiTime = resultTimeline(multi);
  assert.equal(multiTime.wins.length, 2); assert.equal(multiTime.cues.filter(cue => cue.id === 'roll').length, 1);
  assert.ok(multiTime.wins[1].start >= multiTime.wins[0].end);
  const yakuman = structuredClone(view); Object.assign(yakuman.result!.wins[0], { yakuman: 2, han: 0, yaku: ['suuankou'], label: '两倍役满' });
  const yakumanTime = resultTimeline(yakuman);
  assert.ok(!yakumanTime.cues.some(cue => cue.id === 'fu-0'));
  assert.ok(yakumanTime.cues.some(cue => cue.sound === VIRTUAL_AUDIO.limit));
}
for (const asset of Object.values(VIRTUAL_AUDIO)) assert.ok(existsSync(`public${asset}`), `Missing ${asset}`);
console.log('PASS result timeline: yaku/fu/silent han/score/limit ordering, ron-only thunder, multi-win single settlement, ranks and audio assets');
