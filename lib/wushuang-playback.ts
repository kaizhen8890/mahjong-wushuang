export type CinematicEnd = 'ended' | 'interrupted' | 'failed';
/** Two preloaded players; only the active player may own sound. No game mutation. */
export function startWushuangPlayback({ players, sound, stage, reveal, fallback, complete, revealTimes = [11.25, 5.3], timeoutMs = 27000, tailMs = 700 }: {
  players: readonly HTMLVideoElement[]; sound: (player: HTMLVideoElement) => () => void;
  stage: (index: number) => void; reveal: () => void; fallback: () => void; complete: (reason: CinematicEnd) => void;
  revealTimes?: readonly number[]; timeoutMs?: number; tailMs?: number;
}) {
  let index = 0, disposed = false, stopped = false, revealed = false, failed = false;
  let unbind: (() => void) | undefined, closeTimer: ReturnType<typeof setTimeout> | undefined;
  let time = -1, progressed = performance.now();
  const pause = () => { players.forEach(p => p.pause()); unbind?.(); unbind = undefined; };
  const finish = (reason: CinematicEnd = 'interrupted') => { if (disposed || stopped) return; stopped = true; pause(); complete(reason); };
  const fail = () => {
    if (disposed || stopped || failed) return;
    failed = true; pause(); fallback(); closeTimer = setTimeout(() => finish('failed'), 2000);
  };
  const play = () => {
    const current = players[index];
    void current.play().catch(() => {
      if (disposed || stopped || failed || current !== players[index]) return;
      current.muted = true; void current.play().catch(fail);
    });
  };
  const listeners = players.map((p, n) => {
    const playing = () => { if (!disposed && !stopped && !failed && n === index) unbind ??= sound(p); };
    const ended = () => {
      if (disposed || stopped || failed || n !== index) return;
      pause();
      if (index < players.length - 1) { index += 1; revealed = false; time = -1; progressed = performance.now(); stage(index); play(); }
      else { if (!revealed) { revealed = true; reveal(); } closeTimer = setTimeout(() => finish('ended'), tailMs); }
    };
    const error = () => { if (n === index) fail(); };
    p.addEventListener('playing', playing); p.addEventListener('ended', ended); p.addEventListener('error', error);
    return () => { p.removeEventListener('playing', playing); p.removeEventListener('ended', ended); p.removeEventListener('error', error); };
  });
  const tick = setInterval(() => {
    if (disposed || stopped || failed) return;
    const p = players[index];
    if (p.error) { fail(); return; }
    if (p.currentTime !== time) { time = p.currentTime; progressed = performance.now(); }
    if (!revealed && time >= revealTimes[index]) { revealed = true; reveal(); }
    if (!p.ended && performance.now() - progressed > 5000) fail();
  }, 80);
  const watchdog = setTimeout(fail, timeoutMs);
  const hide = () => { if (document.hidden) finish(); };
  document.addEventListener('visibilitychange', hide);
  if (document.hidden) finish(); else play();
  return () => {
    disposed = true; clearInterval(tick); clearTimeout(watchdog); clearTimeout(closeTimer);
    document.removeEventListener('visibilitychange', hide); listeners.forEach(remove => remove()); pause();
    players.forEach(p => { p.removeAttribute('src'); p.load(); });
  };
}
