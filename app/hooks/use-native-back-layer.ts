'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

type Layer = { element: () => HTMLElement | null; back: () => void };
const layers = new Set<Layer>();
const visible = (element: HTMLElement) => element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden], [data-closed], [data-ending-style]');

function stack(element: HTMLElement) {
  const values: number[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const z = getComputedStyle(node).zIndex;
    if (z !== 'auto') values.unshift(Number(z) || 0);
  }
  // Native showModal dialogs sit above CSS stacking contexts.
  return [element.matches(':modal') ? 1 : 0, ...values];
}

function onBack(event: Event) {
  if (event.defaultPrevented) return;
  const modals = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog[open]')].filter(visible);
  const top = modals.sort((a, b) => {
    const x = stack(a), y = stack(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }).at(-1);
  const layer = [...layers].reverse().find(item => item.element() === top);
  // Dedicated cinematics/workbenches keep their existing Back behavior.
  if (!top || !layer) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const list = [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].find(visible);
  if (list) {
    (document.activeElement ?? list).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    return;
  }
  layer.back();
}

/** Register only while the corresponding surface is mounted/open. */
export function useNativeBackLayer(element: () => HTMLElement | null, back: () => void) {
  const current = useRef({ element, back });
  useLayoutEffect(() => { current.current = { element, back }; });
  useEffect(() => {
    const layer: Layer = { element: () => current.current.element(), back: () => current.current.back() };
    if (!layers.size) window.addEventListener('mahjong:native-back', onBack, true);
    layers.add(layer);
    return () => {
      layers.delete(layer);
      if (!layers.size) window.removeEventListener('mahjong:native-back', onBack, true);
    };
  }, []);
}
