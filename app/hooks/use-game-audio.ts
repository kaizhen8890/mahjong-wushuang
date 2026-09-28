'use client';

import { useEffect, useRef } from 'react';
import riichiMusic from '@/data/riichi-music.json';
import { VIRTUAL_AUDIO } from '@/lib/virtual-mahjong/audio';
export const RIICHI_MUSIC = riichiMusic;

export const GAME_AUDIO = {
  emote: '/audio/emote-pop.mp3',
  draw: '/audio/draw-confirm.mp3',
  countdown: '/audio/countdown5.mp3',
  riichiCue: '/audio/riichi-cue.wav',
  win: '/audio/win-reveal.mp3',
  thunder: '/audio/win-thunder.mp3',
  skillShatter: '/audio/skill-card-shatter.mp3',
  skillAbsorb: '/audio/skill-particle-absorb.mp3',
  skillAttackAbsorb: '/audio/skill-attack-absorb.mp3',
} as const;

const soundPlayers = new Map<string, HTMLAudioElement>();
const loopingPlayers = new Set<{ sync: () => void }>();
type GaplessClip = { buffer: AudioBuffer; loopStart: number; loopEnd: number };
let loopContext: AudioContext | undefined;
const decodedLoops = new Map<string, Promise<GaplessClip>>();
let soundGain = 1;
const allowedSound = (src: string) => [...Object.values(GAME_AUDIO), ...Object.values(VIRTUAL_AUDIO)].some(allowed => allowed === src);
/** Optional mounted-table preference; callers restore the default on leaving. */
export function setTableSoundGain(gain: number) {
  soundGain = Math.max(0, Math.min(1, gain));
  if (!soundGain) soundPlayers.forEach(audio => audio.pause());
  loopingPlayers.forEach(player => player.sync());
}

export function playGameSound(src: string, volume = 0.8) {
  if (typeof window === 'undefined' || document.hidden) return;
  // One voice per bundled effect prevents rapid messages from accumulating players.
  if (!allowedSound(src)) return;
  const audio = soundPlayers.get(src) ?? new Audio(src);
  soundPlayers.set(src, audio);
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume * soundGain;
  void audio.play().catch(() => undefined);
}

export function stopGameSound(src: string) {
  const audio = soundPlayers.get(src);
  if (audio) { audio.pause(); audio.currentTime = 0; }
}

/** Fallback for browsers without Web Audio. */
function startElementSoundLoop(src: string, volume: number, playbackRate: number): () => void {
  const audio = new Audio(src);
  audio.loop = true;
  audio.playbackRate = playbackRate;
  audio.preload = 'auto';
  let active = true;
  const player = { sync: () => {
    if (!active || document.hidden || !soundGain) { audio.pause(); return; }
    audio.volume = volume * soundGain;
    if (audio.paused) void audio.play().catch(() => undefined);
  } };
  loopingPlayers.add(player);
  document.addEventListener('visibilitychange', player.sync);
  player.sync();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', player.sync);
    loopingPlayers.delete(player);
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute('src');
    audio.load();
  };
}

function getLoopContext(): AudioContext {
  loopContext ??= new AudioContext();
  return loopContext;
}

/** MP3 encoder padding is silent; trim it so the decoded loop has no dead interval. */
function audibleRange(buffer: AudioBuffer): { loopStart: number; loopEnd: number } {
  const samples = buffer.getChannelData(0);
  const block = Math.max(1, Math.round(buffer.sampleRate * 0.005));
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const threshold = Math.max(0.003, peak * 0.01);
  let first = -1, last = -1;
  for (let i = 0; i < samples.length; i += block) {
    let energy = 0;
    const count = Math.min(block, samples.length - i);
    for (let j = i; j < i + count; j++) energy += samples[j] * samples[j];
    if (Math.sqrt(energy / count) >= threshold) {
      if (first < 0) first = i;
      last = i + count;
    }
  }
  if (first < 0 || last - first < buffer.sampleRate * 0.03) return { loopStart: 0, loopEnd: buffer.duration };
  return {
    loopStart: first / buffer.sampleRate,
    loopEnd: last / buffer.sampleRate,
  };
}

function getGaplessClip(src: string): Promise<GaplessClip> {
  let pending = decodedLoops.get(src);
  if (!pending) {
    const context = getLoopContext();
    pending = fetch(src).then(response => {
      if (!response.ok) throw new Error(`Audio load failed: ${response.status}`);
      return response.arrayBuffer();
    }).then(bytes => context.decodeAudioData(bytes)).then(buffer => ({ buffer, ...audibleRange(buffer) }));
    decodedLoops.set(src, pending);
  }
  return pending;
}

export function preloadGameSoundLoop(src: string) {
  if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined' && allowedSound(src)) {
    void getGaplessClip(src).catch(() => undefined);
  }
}

/** Decode once, then loop sample-accurately until the animation phase ends. */
export function startGameSoundLoop(src: string, volume = 0.8, playbackRate = 1): () => void {
  if (typeof window === 'undefined' || document.hidden || !allowedSound(src)) return () => undefined;
  if (typeof AudioContext === 'undefined') return startElementSoundLoop(src, volume, playbackRate);
  const context = getLoopContext();
  let stopped = false;
  let source: AudioBufferSourceNode | undefined;
  let gain: GainNode | undefined;
  let stopFallback: (() => void) | undefined;
  const player = { sync: () => {
    if (document.hidden) { stop(); return; }
    if (gain) gain.gain.setTargetAtTime(volume * soundGain, context.currentTime, 0.005);
  } };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', player.sync);
    loopingPlayers.delete(player);
    stopFallback?.();
    if (source && gain) {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.025);
      source.stop(now + 0.03);
    }
  };
  loopingPlayers.add(player);
  document.addEventListener('visibilitychange', player.sync);
  void (async () => {
    try {
      const clip = await getGaplessClip(src);
      await context.resume();
      if (stopped) return;
      gain = context.createGain();
      gain.gain.value = volume * soundGain;
      gain.connect(context.destination);
      source = context.createBufferSource();
      source.buffer = clip.buffer;
      source.loop = true;
      source.loopStart = clip.loopStart;
      source.loopEnd = clip.loopEnd;
      source.playbackRate.value = playbackRate;
      source.connect(gain);
      source.onended = () => { source?.disconnect(); gain?.disconnect(); };
      source.start(0, clip.loopStart);
    } catch {
      if (!stopped) stopFallback = startElementSoundLoop(src, volume, playbackRate);
    }
  })();
  return stop;
}

export function useCountdownSound(active: boolean, remainingSeconds: number) {
  const lastSecond = useRef<number | null>(null);
  useEffect(() => {
    if (!active || remainingSeconds < 1 || remainingSeconds > 5) {
      lastSecond.current = null;
      return;
    }
    if (lastSecond.current === remainingSeconds) return;
    lastSecond.current = remainingSeconds;
    playGameSound(GAME_AUDIO.countdown, 0.82);
  }, [active, remainingSeconds]);
}

export function useRiichiMusic(active: boolean, selection = 'random', volume = 0.42) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (!active) return;
    const selected = RIICHI_MUSIC.find((track) => track.id === selection);
    const track = selected ?? RIICHI_MUSIC[Math.floor(Math.random() * RIICHI_MUSIC.length)];
    const audio = new Audio(track.src);
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = volumeRef.current;
    audioRef.current = audio;
    const syncVisibility = () => {
      if (document.hidden) audio.pause();
      else void audio.play().catch(() => undefined);
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [active, selection]);
}

export function useRealtimeSound(event: { eventId: string; kind: 'emote' | 'draw' } | null | undefined) {
  const playedEvent = useRef('');
  useEffect(() => {
    if (!event || playedEvent.current === event.eventId) return;
    playedEvent.current = event.eventId;
    playGameSound(event.kind === 'emote' ? GAME_AUDIO.emote : GAME_AUDIO.draw, event.kind === 'emote' ? 0.78 : 0.7);
  }, [event]);
}
