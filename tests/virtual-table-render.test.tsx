import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { VirtualTable } from '../app/components/virtual-mahjong/table';
import { ResultPresentation } from '../app/components/virtual-mahjong/result-presentation';
import { createTableScenario } from './helpers/virtual-table-scenarios';
import { denseTableLayout } from './helpers/virtual-table-layout';
import type { PlayerVisibleGameState } from '../lib/virtual-mahjong/projection';
const render = (view: PlayerVisibleGameState) => renderToStaticMarkup(<VirtualTable view={view} now={1_000_000} send={() => {}} exit={() => {}} next={() => {}} />);
{
  const view = createTableScenario('riichi').view();
  const bot = view.players.find(player => player.id !== view.viewerId)!;
  const markup = renderToStaticMarkup(<VirtualTable view={view} now={1_000_000} botIds={[bot.id]}
    send={() => {}} exit={() => {}} next={() => {}} />);
  assert.match(markup, /class="vm-bot">人机<\/small>/);
  assert.doesNotMatch(render(view), /class="vm-bot"/);
}
for (const hand of ['123456789m123p5s1z', '1122m3344p5566s7z1z', '19m19p19s1234567z2m', '123m456p789s22p46m']) {
  const h = createTableScenario('riichi', hand);
  assert.ok(h.view().availableActions.riichiDiscardTileIds.length, `Host missed ${hand}`);
  assert.match(render(h.view()), />立直<\/button>/, `UI missed ${hand}`);
  assert.doesNotMatch(render(h.view()), /class="vm-hint"/);
  const opponent = h.engine.view({ role: 'player', playerId: 'b' });
  assert.doesNotMatch(render(opponent), />立直<\/button>/);
  h.act({ kind: 'RIICHI', tileId: h.view().availableActions.riichiDiscardTileIds[0] });
  assert.doesNotMatch(render(h.view()), />立直<\/button>/);
}
const notReady = createTableScenario('riichi', '147m147p147s12345z');
assert.equal(notReady.view().availableActions.riichiDiscardTileIds.length, 0);
assert.doesNotMatch(render(notReady.view()), />立直<\/button>/);
for (const points of [1000]) {
  const h = createTableScenario('riichi', undefined, rules => { rules.startingPoints = points; });
  assert.equal(h.view().availableActions.riichiDiscardTileIds.length > 0, points === 1000);
  assert.equal(/>立直<\/button>/.test(render(h.view())), points === 1000);
}
for (const name of ['chi', 'pon', 'ankan', 'kakan', 'ron', 'draw'] as const) {
  const h = createTableScenario(name);
  const label = { chi: '吃', pon: '碰', ankan: '杠', kakan: '杠', ron: '荣', draw: '九种九牌' }[name];
  assert.ok(render(h.view()).includes(`>${label}</button>`));
  if (name === 'ron') h.act({ kind: 'RESPOND', optionId: h.view().availableActions.callOptions.find(option => option.kind === 'ron')!.id });
  if (name === 'draw') h.act({ kind: 'ABORT_NINE_TERMINALS' });
  if (name === 'ankan') {
    h.act({ kind: 'KAN', optionId: h.view().availableActions.selfKanOptions[0].id });
    assert.ok(h.view().availableActions.riichiDiscardTileIds.length, 'Ankan remains closed');
    assert.match(render(h.view()), />立直<\/button>/);
    assert.match(render(h.view()), />自摸<\/button>/);
    h.act({ kind: 'TSUMO' });
  }
  if (h.view().result) {
    const html = render(h.view());
    assert.match(html, /aria-label="对局结果"/); assert.match(html, />下一局<\/button>/);
    const clientHtml = renderToStaticMarkup(<VirtualTable view={h.view()} now={1_000_000} roomLabel="LAN 对局" canAdvance={false} send={() => {}} exit={() => {}} next={() => { throw new Error('Client cannot advance'); }} />);
    assert.match(clientHtml, /<button[^>]*disabled=""[^>]*>等待房主开始下一局<\/button>/);
    if (name !== 'draw') { assert.match(html, /aria-label="排名总览"/); assert.match(html, /查看玩家/); assert.doesNotMatch(html, /跳过演出/); }
  }
}
console.log('Table server render: closed standard/seven-pairs/kokushi/no-yaku riichi prompts, non-turn suppression, call buttons and result markup passed. Browser interaction is not covered.');
const tsumoScene = createTableScenario('ankan');
tsumoScene.act({ kind: 'KAN', optionId: tsumoScene.view().availableActions.selfKanOptions[0].id });
const tsumoBefore = tsumoScene.view(); tsumoScene.act({ kind: 'TSUMO' });
const reveal = renderToStaticMarkup(<ResultPresentation view={tsumoScene.view()} before={tsumoBefore} next={() => {}} exit={() => {}} canAdvance
  characters={{ [tsumoScene.view().result!.wins[0].playerId]: { id: 'claude', name: 'Claude' } }} />);
assert.match(reveal, /和牌手牌/); assert.match(reveal, /自摸/);
assert.match(reveal, /里宝牌指示牌/); assert.match(reveal, /aria-label="暗牌"/);
assert.match(reveal, /vr-result-character/);
assert.doesNotMatch(reveal, /vr-result-logo|麻将无双 · |<span>东<\/span>/);
assert.doesNotMatch(reveal, /荣和落雷/); assert.doesNotMatch(reveal, /vr-point-drop/);
console.log('Result initial render: tsumo immediately shows hand/indicators with concealed slots, no thunder or premature score.');

// Image-backed tiles must remain available offline, and calls highlight only the offered tile.
const chiLayout = createTableScenario('chi');
const chiMarkup = render(chiLayout.view());
assert.equal((chiMarkup.match(/vm-call-target/g) ?? []).length, 1);
assert.match(chiMarkup, /class="vm-dora-panel"/);
assert.match(chiMarkup, /href="\/virtual-tiles\/tile-sheet.png"/);
assert.doesNotMatch(chiMarkup, /src="\/virtual-tiles\/1m.svg"/);
chiLayout.act({ kind: 'RESPOND', optionId: chiLayout.view().availableActions.callOptions.find(option => option.kind === 'chi')!.id });
assert.doesNotMatch(render(chiLayout.view()), /vm-call-target/);
assert.match(render(chiLayout.view()), /vm-outer vm-outer-0/);
console.log('Image tile rendering and exact call-target highlighting passed.');
assert.match(render(chiLayout.view()), /aria-label="玩家 A牌河"><\/div>/);
assert.doesNotMatch(render(chiLayout.view()), /vm-tsumogiri|vm-called/);
const furitenView=createTableScenario('riichi').view();
furitenView.players.find(p=>p.id===furitenView.viewerId)!.furiten=true;
assert.match(render(furitenView),/class="vm-furiten"/);
furitenView.players.find(p=>p.id===furitenView.viewerId)!.furiten=false;
assert.doesNotMatch(render(furitenView),/class="vm-furiten"/);
assert.match(render(createTableScenario('chi').view()),/基本时间5秒，额外时间30秒/);
console.log('PASS checkpoint17: own furiten badge and basic + extra response display');
const hybridHtml=render(createTableScenario('riichi').view());
assert.match(hybridHtml,/<div class="vm-hand"/);
assert.match(hybridHtml,/class="vm-player vm-player-0/);
assert.equal((hybridHtml.match(/class="vm-player vm-player-/g)||[]).length,4);
console.log('PASS hybrid table: visible 2D hand and four character avatars');

// Tenpai guidance: the seal and its hold panel exist only for a structurally tenpai hand.
const tenpaiHtml = render(createTableScenario('riichi', '123456789m123p4s5s').view());
assert.match(tenpaiHtml, /class="vm-tenpai-stamp"/);
assert.match(tenpaiHtml, /aria-label="听牌指导[^"]*"/);
assert.match(tenpaiHtml, /aria-controls="vm-tenpai-pop"/);
assert.match(tenpaiHtml, /data-open="false"/);
assert.match(tenpaiHtml, /切5索后/);
assert.match(tenpaiHtml, /余3张/);
assert.match(tenpaiHtml, /仅结构听牌，未计役种/);
assert.equal((tenpaiHtml.match(/class="vm-tenpai-wait"/g) ?? []).length, 1);
assert.equal((tenpaiHtml.match(/class="vm-tile-face"/g) ?? []).length > 0, true);
assert.ok(tenpaiHtml.lastIndexOf('class="vm-tenpai-stamp"') > tenpaiHtml.lastIndexOf('data-tile-id='));
assert.doesNotMatch(tenpaiHtml, /class="vm-hand vm-tenpai-open"/);
const idleHtml = render(createTableScenario('riichi', '147m147p147s12345z').view());
assert.match(idleHtml, /class="vm-hand"/);
assert.doesNotMatch(idleHtml, /vm-tenpai-stamp/);
console.log('PASS tenpai guide render: seal, wait faces and remaining counts appear only when the hand waits');

// The light band belongs to each actual SVG tile face, so hand/river/meld scaling and sideways rotation carry it along.
const shineView = denseTableLayout();
shineView.doraIndicators = [{ id: 9999, type: 6, red: false }];
const shineOwn = shineView.players.find(player => player.id === shineView.viewerId)!;
shineOwn.hand![0] = { ...shineOwn.hand![0], type: 7, red: false };
shineView.players[0].river[0].tile = { ...shineView.players[0].river[0].tile, type: 7, red: false };
const openMeld = shineView.players.flatMap(player => player.melds).find(meld => meld.kind !== 'ankan')!;
openMeld.tiles[0] = { ...openMeld.tiles[0], type: 7, red: false };
const shineHtml = render(shineView);
assert.ok((shineHtml.match(/class="vm-tile-sheen"/g) ?? []).length >= 3);
assert.match(shineHtml, /class="vm-tile-sheen"[^>]*fill="#fff"[^>]*><animate attributeName="y"/);
assert.doesNotMatch(shineHtml.match(/<aside class="vm-dora-panel"[\s\S]*?<\/aside>/)?.[0] ?? '', /vm-tile-sheen/);
console.log('PASS dora sweep render: actual hand, river and meld faces shine, indicators do not');
