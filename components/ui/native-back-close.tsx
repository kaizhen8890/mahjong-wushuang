'use client';

import { useRef, type ElementType } from 'react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';

/** Use the primitive's close action so controlled/busy guards and focus restoration still apply. */
export function NativeBackClose({ close: Close }: { close: ElementType }) {
  const button = useRef<HTMLButtonElement>(null);
  useNativeBackLayer(
    () => button.current?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? null,
    () => button.current?.click(),
  );
  return <Close ref={button} hidden tabIndex={-1} aria-hidden="true" data-native-back-close />;
}
