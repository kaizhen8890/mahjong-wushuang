import { createTiles, type PlayerCount, type Tile } from './tiles';

/** Private Host data. Never put this object into a network message. */
export interface Wall {
  live: Tile[];
  dead: Tile[];
  rinshanUsed: number;
  indicatorsRevealed: number;
}

export type RandomUint32 = () => number;
const secureUint32: RandomUint32 = () => {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random source unavailable');
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
};

function randomBelow(bound: number, random: RandomUint32): number {
  const limit = Math.floor(0x100000000 / bound) * bound;
  for (;;) {
    const value = random();
    if (!Number.isInteger(value) || value < 0 || value >= 0x100000000) throw new Error('Invalid random word');
    if (value < limit) return value % bound;
  }
}

/** RNG injection is for reproducible Host tests only, never client-supplied. */
export function createWall(players: PlayerCount, redFives: boolean, random: RandomUint32 = secureUint32): Wall {
  const tiles = createTiles(players, redFives);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, random);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return { live: tiles.slice(0, -14), dead: tiles.slice(-14), rinshanUsed: 0, indicatorsRevealed: 1 };
}

export function drawLive(wall: Wall): Tile {
  const tile = wall.live.shift();
  if (!tile) throw new Error('Live wall exhausted');
  return tile;
}

/** Slots 0..3: rinshan; 4/6/8/10/12: dora; 5/7/9/11/13: ura. */
export function drawRinshan(wall: Wall): Tile {
  if (wall.rinshanUsed >= 4 || wall.live.length === 0) throw new Error('No kan replacement available');
  const tile = wall.dead[wall.rinshanUsed];
  wall.dead[wall.rinshanUsed++] = wall.live.pop()!;
  return tile;
}

/** Sanma nuki draws from the dead wall without consuming a kan slot or revealing dora.
 * Refill from the live tail so the 14-tile dead wall and physical tile count stay intact. */
export function drawNukiReplacement(wall: Wall): Tile {
  if (wall.live.length === 0) throw new Error('No nuki replacement available');
  const tile = wall.dead[0];
  wall.dead[0] = wall.live.pop()!;
  return tile;
}

/** Engine decides timing (including robbing a kan); drawing does not reveal automatically. */
export function revealKanDora(wall: Wall): void {
  if (wall.indicatorsRevealed >= 5 || wall.indicatorsRevealed > wall.rinshanUsed) {
    throw new Error('No completed kan to reveal');
  }
  wall.indicatorsRevealed++;
}

export function doraIndicators(wall: Wall): Tile[] {
  return Array.from({ length: wall.indicatorsRevealed }, (_, i) => ({ ...wall.dead[4 + i * 2] }));
}

/** Host scoring only until a qualifying winning hand is publicly revealed. */
export function uraIndicators(wall: Wall): Tile[] {
  return Array.from({ length: wall.indicatorsRevealed }, (_, i) => ({ ...wall.dead[5 + i * 2] }));
}

export function dealHands(wall: Wall, players: PlayerCount, dealer: number): Tile[][] {
  if ((players !== 3 && players !== 4) || !Number.isInteger(dealer) || dealer < 0 || dealer >= players) {
    throw new Error('Invalid seats');
  }
  if (wall.live.length < players * 13 + 1) throw new Error('Insufficient tiles to deal');
  const hands = Array.from({ length: players }, () => [] as Tile[]);
  for (let packet = 0; packet < 3; packet++) {
    for (let relative = 0; relative < players; relative++) {
      for (let count = 0; count < 4; count++) hands[(dealer + relative) % players].push(drawLive(wall));
    }
  }
  for (let relative = 0; relative < players; relative++) hands[(dealer + relative) % players].push(drawLive(wall));
  hands[dealer].push(drawLive(wall));
  return hands;
}
