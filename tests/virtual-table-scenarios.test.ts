import assert from 'node:assert/strict';
import { createTableScenario, scenarioNames, type ScenarioName } from './helpers/virtual-table-scenarios';
for (const name of Object.keys(scenarioNames) as ScenarioName[]) {
  const h = createTableScenario(name);
  const actions = h.view().availableActions;
  for (const player of h.view().players) if (player.id !== h.viewerId) assert.equal(player.hand, undefined);
  if (name === 'riichi') {
    assert.ok(actions.riichiDiscardTileIds.length);
    h.act({ kind: 'RIICHI', tileId: actions.riichiDiscardTileIds[0] });
    assert.equal(h.view().riichiSticks, 1);
  } else if (name === 'chi' || name === 'pon' || name === 'ron') {
    const options = actions.callOptions.filter(option => option.kind === name);
    assert.ok(options.length >= (name === 'chi' ? 2 : 1));
    h.act({ kind: 'RESPOND', optionId: options[0].id });
    if (name === 'ron') assert.equal(h.view().result?.reason, 'ron');
    else assert.equal(h.view().players.find(player => player.id === h.viewerId)!.melds[0].kind, name);
  } else if (name === 'ankan' || name === 'kakan') {
    h.act({ kind: 'KAN', optionId: actions.selfKanOptions.find(option => option.kind === name)!.id });
    assert.equal(h.view().doraIndicators.length, 2);
    if (name === 'ankan') { assert.ok(h.view().availableActions.canTsumo); h.act({ kind: 'TSUMO' }); assert.equal(h.view().result?.reason, 'tsumo'); }
  } else if (name === 'nuki') {
    for (let index = 0; index < 4; index++) {
      const tileId = h.view().availableActions.nukiTileIds[0];
      assert.ok(Number.isInteger(tileId));
      h.act({ kind: 'NUKI', tileId });
      assert.equal(h.view().players.find(player => player.id === h.viewerId)!.nuki.length, index + 1);
    }
    assert.equal(h.view().availableActions.nukiTileIds.length, 0);
  } else {
    h.act({ kind: 'ABORT_NINE_TERMINALS' }); assert.equal(h.view().result?.reason, 'nine-terminals');
  }
  if (h.view().result) {
    const before = h.view();
    assert.ok(h.engine.advanceRound({ gameId: before.gameId, roundId: before.roundId }).ok);
    assert.notEqual(h.view().roundId, before.roundId);
    assert.equal(h.view().result, undefined);
  }
  console.log(`PASS table scenario: ${name}`);
}
