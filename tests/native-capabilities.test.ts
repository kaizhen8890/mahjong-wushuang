import assert from 'node:assert/strict';
import { Capacitor } from '@capacitor/core';
import { hasNativeLanRoom } from '../lib/lan-native';

const original = { native: Capacitor.isNativePlatform, available: Capacitor.isPluginAvailable, platform: Capacitor.getPlatform };
try {
  for (const platform of ['ios', 'android', 'web']) {
    Capacitor.getPlatform = () => platform;
    Capacitor.isNativePlatform = () => platform !== 'web';
    Capacitor.isPluginAvailable = name => name === 'LanRoom';
    assert.equal(hasNativeLanRoom(), platform !== 'web');
    Capacitor.isPluginAvailable = () => false;
    assert.equal(hasNativeLanRoom(), false, 'A native shell without the plugin must not expose LAN');
  }
} finally {
  Capacitor.isNativePlatform = original.native;
  Capacitor.isPluginAvailable = original.available;
  Capacitor.getPlatform = original.platform;
}
console.log('PASS native LAN capability: registered iOS/Android plugins, missing bridge and browser fallback');

