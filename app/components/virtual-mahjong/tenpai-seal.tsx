'use client';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { tileCode, type Tile } from '@/lib/virtual-mahjong/tiles';
import type { TenpaiGuide } from '@/lib/virtual-mahjong/tenpai-guide';
import { tileName } from '../mahjong-tile';
import { TileFace } from './tile-face';

const face = (type: number): Tile => ({ id: -1, type, red: false });

/** Tenpai seal for the right end of the hand. Holding it, or focusing it from the keyboard, floats the wait panel. */
export function TenpaiSeal({ guide, open, onOpenChange }: {
  guide: TenpaiGuide; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const pressed = useRef(false);
  const releasedAt = useRef(0);
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pressed.current) return;
    pressed.current = false;
    releasedAt.current = Date.now();
    onOpenChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const discard = guide.discardType === null ? '' : tileName(tileCode(face(guide.discardType)));
  return <>
    <button type="button" className="vm-tenpai-stamp" aria-expanded={open} aria-controls="vm-tenpai-pop"
      aria-label="听牌指导，按住查看和牌张与剩余张数"
      onPointerDown={event => {
        pressed.current = true;
        onOpenChange(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={release} onPointerCancel={release}
      onPointerLeave={release}
      onFocus={() => { if (!pressed.current && Date.now() - releasedAt.current > 400) onOpenChange(true); }}
      onBlur={() => onOpenChange(false)}><span>听</span><small aria-hidden="true">按住</small></button>
    <div className="vm-tenpai-pop" id="vm-tenpai-pop" data-open={open ? 'true' : 'false'} aria-hidden={!open}>
      <strong>听牌</strong>{discard && <small>切{discard}后</small>}
      <div className="vm-tenpai-waits">{guide.waits.map(wait => <span className="vm-tenpai-wait" key={wait.type}>
        <TileFace tile={face(wait.type)} /><b>余{wait.remaining}张</b>
      </span>)}</div>
      <small className="vm-tenpai-note">仅结构听牌，未计役种</small>
    </div>
  </>;
}
