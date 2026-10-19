import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalSetup } from '../app/components/virtual-mahjong/local-setup';
import { LocalSupplyPanel } from '../app/components/virtual-mahjong/local-supply-panel';
import { VirtualTable } from '../app/components/virtual-mahjong/table';
import { LocalVirtualSession } from '../lib/virtual-mahjong/local-session';
import { DEFAULT_LOCAL_SETTINGS, changeLocalPlayers } from '../lib/virtual-mahjong/local-settings';

const setup = renderToStaticMarkup(<LocalSetup initial={DEFAULT_LOCAL_SETTINGS} start={() => {}} close={() => {}} />);
assert.match(setup, /aria-pressed="true"><strong>配合做牌/);
assert.match(setup, /普通人机/); assert.match(setup, /起始点数/); assert.match(setup, /击飞/);
assert.match(setup, /天顶星手牌/); assert.match(setup, /12%/);
assert.doesNotMatch(setup, /无限|牌例|胜率/);
for (const players of [3, 4] as const) {
  const session = new LocalVirtualSession(changeLocalPlayers(DEFAULT_LOCAL_SETTINGS, players), { random: () => 0 });
  const controls = session.controls();
  const panel = renderToStaticMarkup(<LocalSupplyPanel controls={controls} players={players}
    seats={session.view().players.slice(1)} supply={() => ''} keep={() => ''} cancel={() => {}} clear={() => {}} close={() => {}} />);
  assert.match(panel, /对局已暂停/); assert.match(panel, /指定下一张/); assert.match(panel, /保留牌/);
  assert.equal((panel.match(/grid-column-start:/g) ?? []).length, players === 3 ? 27 : 34);
  const table = renderToStaticMarkup(<VirtualTable view={session.view()} now={0} send={() => {}} next={() => {}} exit={() => {}}
    botIds={session.botIds} local={{ paused: true, status: '配合做牌', setPaused: () => {}, openSetup: () => {}, openSupply: () => {} }} />);
  assert.match(table, /vm-supply-open/); assert.match(table, /已暂停/);
  assert.equal((table.match(/class="vm-player vm-player-/g) ?? []).length, players);
}
console.log('PASS local interface: defaults, focused controls, sanma tile palette, actual seat count and paused table');
