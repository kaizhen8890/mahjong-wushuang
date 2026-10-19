import { defaultRules, validateRules } from './rules';
import type { Rules } from './model';

export type LocalBotMode = 'cooperative' | 'normal';
export interface LocalSettings {
  players: 3 | 4;
  startingPoints: number;
  bankruptcy: boolean;
  botMode: LocalBotMode;
  zenithHand: boolean;
}
export const LOCAL_SETTINGS_KEY = 'mahjong-wushuang:local-table:v1';
export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  players: 4, startingPoints: 25000, bankruptcy: true, botMode: 'cooperative', zenithHand: false,
};

export function localRules(settings: LocalSettings): Rules {
  if (!settings || !['cooperative', 'normal'].includes(settings.botMode)
    || typeof settings.bankruptcy !== 'boolean' || typeof settings.zenithHand !== 'boolean') throw new Error('INVALID_LOCAL_SETTINGS');
  const rules = defaultRules(settings.players);
  rules.startingPoints = settings.startingPoints;
  rules.match.bankruptcy = settings.bankruptcy;
  validateRules(rules);
  return rules;
}

export function readLocalSettings(raw: string | null): LocalSettings {
  try {
    const parsed = JSON.parse(raw ?? 'null');
    const saved = { ...parsed, zenithHand: parsed?.zenithHand === true };
    localRules(saved);
    return { players: saved.players, startingPoints: saved.startingPoints,
      bankruptcy: saved.bankruptcy, botMode: saved.botMode, zenithHand: saved.zenithHand };
  } catch { return { ...DEFAULT_LOCAL_SETTINGS }; }
}

export function changeLocalPlayers(settings: LocalSettings, players: 3 | 4): LocalSettings {
  return { ...settings, players, startingPoints: settings.startingPoints === defaultRules(settings.players).startingPoints
    ? defaultRules(players).startingPoints : settings.startingPoints };
}
