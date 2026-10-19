'use client';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { VirtualTable } from '@/app/components/virtual-mahjong/table';
import { LocalSetup } from '@/app/components/virtual-mahjong/local-setup';
import { LocalSupplyPanel } from '@/app/components/virtual-mahjong/local-supply-panel';
import { LocalVirtualSession, localControlMessage } from '@/lib/virtual-mahjong/local-session';
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY, readLocalSettings, type LocalSettings } from '@/lib/virtual-mahjong/local-settings';
import { DEFAULT_CHARACTER, defaultSeatCharacter, type CharacterChoice } from '@/lib/characters';
import { preferredCharacter, savePreferredCharacter } from '@/app/components/character-picker';
import { tileCode } from '@/lib/virtual-mahjong/tiles';
import { tileName } from '@/app/components/mahjong-tile';
const ScenarioLab = process.env.NODE_ENV === 'development' ? lazy(() => import('@/app/components/virtual-mahjong/scenario-lab')) : null;

function snapshot(session: LocalVirtualSession) {
  return { view: session.view(), controls: session.controls(), now: session.clock.now() };
}

/** One local Host. Components receive only the human projection and control summaries. */
export default function VirtualPractice({ onBack }: { onBack?: () => void } = {}) {
  const [session, setSession] = useState<LocalVirtualSession | null>(null);
  const [frame, setFrame] = useState<ReturnType<typeof snapshot> | null>(null);
  const [settings, setSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS });
  const [ready, setReady] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [lab, setLab] = useState(false);
  const [character, setCharacter] = useState<CharacterChoice>(DEFAULT_CHARACTER);
  const active = useRef<LocalVirtualSession | null>(null);
  const refresh = useCallback(() => { if (session && active.current === session) setFrame(snapshot(session)); }, [session]);
  const setPaused = useCallback((reason: string, paused: boolean) => {
    if (!session) return;
    if (paused) session.pause(reason); else session.resume(reason);
    if (active.current === session) setFrame(snapshot(session));
  }, [session]);
  useEffect(() => {
    const launch = window.setTimeout(() => {
      setCharacter(preferredCharacter('virtual'));
      try { setSettings(readLocalSettings(localStorage.getItem(LOCAL_SETTINGS_KEY))); } catch { /* Preferences are optional. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(launch);
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => { session.tick(); refresh(); }, 250);
    return () => window.clearInterval(timer);
  }, [session, refresh]);
  const exit = () => { active.current = null; if (onBack) onBack(); else window.location.href = '/'; };
  const start = (choice: LocalSettings) => {
    const next = new LocalVirtualSession(choice);
    active.current = next; setSession(next); setFrame(snapshot(next));
    setSettings({ ...choice }); setSetupOpen(false); setSupplyOpen(false);
    try { localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(choice)); } catch { /* Preferences are optional. */ }
  };
  const openSetup = () => { session?.pause('setup'); setSetupOpen(true); refresh(); };
  const closeSetup = () => {
    if (!session) { exit(); return; }
    setSetupOpen(false); session.resume('setup'); refresh();
  };
  const openSupply = () => { session?.pause('supply'); setSupplyOpen(true); refresh(); };
  const closeSupply = () => { setSupplyOpen(false); session?.resume('supply'); refresh(); };
  if (!ready) return <main className="vm-local-lobby"><output>正在准备单机牌桌…</output></main>;
  if (lab && ScenarioLab) return <Suspense fallback={<p>加载牌例…</p>}><ScenarioLab exit={() => { session?.resume('lab'); setLab(false); refresh(); }} /></Suspense>;
  if (!session || !frame) return <LocalSetup initial={settings} key={JSON.stringify(settings)} start={start} close={exit} />;
  const { view, controls, now } = frame;
  const supplyName = controls.supply ? tileName(tileCode({ type: controls.supply.type, red: false })) : '';
  return <>
    <VirtualTable key={view.gameId} animateEntrance view={view} now={now} error={controls.error}
      roomLabel={controls.mode === 'cooperative' ? '配合做牌' : '普通人机'} botIds={session.botIds}
      local={{ paused: controls.paused, setPaused, openSetup,
        ...(controls.mode === 'cooperative' ? { openSupply } : {}),
        status: controls.supply ? '待供 ' + supplyName + ' · ' + (controls.supply.target === 'next' ? '下一位人机'
          : view.players.find(player => player.id === controls.supply!.target)?.name ?? '') : controls.mode === 'cooperative' ? '配合做牌' : '普通人机' }}
      characters={Object.fromEntries(view.players.map((player, index) => [player.id, index === 0 ? character : defaultSeatCharacter(index)]))}
      onChooseCharacter={choice => { setCharacter(choice); savePreferredCharacter(choice, 'virtual'); }}
      send={intent => { session.send(intent); refresh(); }} exit={exit} next={() => { session.advance(); refresh(); }} />
    {setupOpen && <LocalSetup initial={settings} modal start={start} close={closeSetup} />}
    {supplyOpen && <LocalSupplyPanel controls={controls} players={view.rules.players}
      seats={view.players.filter(player => session.botIds.includes(player.id)).map(player => ({ id: player.id, name: player.name }))}
      supply={(type, target) => { const response = session.requestSupply(type, target); refresh(); return response.ok ? '' : localControlMessage(response.error); }}
      keep={types => { const response = session.setKeepTypes(types); refresh(); return response.ok ? '' : localControlMessage(response.error); }}
      cancel={() => { session.cancelSupply(); refresh(); }} clear={() => { session.clearControls(); refresh(); }} close={closeSupply} />}
    {ScenarioLab && <button style={{ position: 'fixed', left: 10, bottom: 2, zIndex: 60, background: '#172139', color: '#ffe4b9' }}
      onClick={() => { session.pause('lab'); setLab(true); }}>开发牌例</button>}
  </>;
}
