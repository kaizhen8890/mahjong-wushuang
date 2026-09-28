import type { PlayerVisibleGameState } from '@/lib/virtual-mahjong/projection';
/** Only animate one contiguous live update; never replay history after restore/reconnect. */
export function canAnimateTable(previous: PlayerVisibleGameState, next: PlayerVisibleGameState, visible: boolean, reducedMotion: boolean) {
  return visible && !reducedMotion && previous.gameId === next.gameId && previous.roundId === next.roundId
    && previous.viewerId === next.viewerId && !previous.result && !next.result
    && next.revision === previous.revision + 1 && next.turnId >= previous.turnId && next.turnId <= previous.turnId + 1;
}
export const MOTION_MS = { draw: 160, discard: 200, meld: 240, nuki: 420, deal: 280 } as const;
export function motionProgress(elapsed: number, duration: number) { const t=Math.max(0,Math.min(1,elapsed/duration));return 1-(1-t)**3; }
