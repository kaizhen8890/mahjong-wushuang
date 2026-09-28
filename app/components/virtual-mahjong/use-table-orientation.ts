'use client';
import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
const display = registerPlugin<{ setActive(options: { active: boolean }): Promise<void> }>('VirtualTableDisplay');
// Serialize enter/leave, including StrictMode and fast transitions between tables.
let pending: Promise<void> = Promise.resolve();
export function useTableOrientation() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('VirtualTableDisplay')) return;
    const set = (active: boolean) => { pending = pending.then(() => display.setActive({ active })).catch(() => undefined); };
    set(true);
    return () => set(false);
  }, []);
}
