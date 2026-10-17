'use client';
import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
const display = registerPlugin<{ setNight(options: { active: boolean }): Promise<void> }>('VirtualTableDisplay');
export function useNightBrightness(active: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('night-mode', active);
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VirtualTableDisplay')) void display.setNight({ active }).catch(() => undefined);
    return () => {
      document.documentElement.classList.remove('night-mode');
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VirtualTableDisplay')) void display.setNight({ active: false }).catch(() => undefined);
    };
  }, [active]);
}
export function useSilenceMode(active: boolean) {
  useEffect(() => { document.documentElement.classList.toggle('silence-mode', active); return () => document.documentElement.classList.remove('silence-mode'); }, [active]);
}
