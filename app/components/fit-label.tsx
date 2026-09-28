'use client';

import { useLayoutEffect, useRef } from 'react';

export function FitLabel({ children, maxSize = 26 }: { children: string; maxSize?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let disposed = false;
    const context = document.createElement('canvas').getContext('2d');
    const fit = () => {
      if (disposed || !context || !element.clientWidth) return;
      const style = getComputedStyle(element);
      context.font = `${style.fontStyle} ${style.fontWeight} ${maxSize}px ${style.fontFamily}`;
      const spacing = parseFloat(style.letterSpacing) || 0;
      // oxlint-disable-next-line typescript/no-misused-spread -- Conservative spacing estimate only; canvas measures the intact text, including emoji.
      const width = context.measureText(children).width + Math.max(0, [...children].length - 1) * spacing;
      const size = Math.max(9, Math.floor(maxSize * Math.min(1, (element.clientWidth - 3) / Math.max(1, width))));
      const next = `${size}px`;
      // No write-then-layout loop: only change the style when the fitted size changes.
      if (element.style.fontSize !== next) element.style.fontSize = next;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    void document.fonts.ready.then(fit);
    fit();
    return () => { disposed = true; observer.disconnect(); };
  }, [children, maxSize]);
  return <span className="table-fit-label" ref={ref} title={children}>{children}</span>;
}
