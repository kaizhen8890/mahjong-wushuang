export interface LyricCue {
  time: number;
  text: string;
}

/** Standard LRC, including repeated timestamps, bilingual lines and millisecond offsets. */
export function parseLrc(source: string): LyricCue[] {
  if (source.length > 200_000) throw new Error('歌词文件过大');
  const offset =
    Number(source.match(/\[offset:\s*(-?\d+)\]/i)?.[1] || 0) / 1000;
  const lines = new Map<number, string[]>();
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const tags = [
      ...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const tag of tags) {
      const time = Math.max(
        0,
        Number(tag[1]) * 60 +
          Number(tag[2]) +
          Number(`0.${tag[3] || 0}`) +
          offset,
      );
      const existing = lines.get(time) || [];
      if (text && !existing.includes(text)) existing.push(text);
      lines.set(time, existing);
    }
  }
  return [...lines]
    .sort(([a], [b]) => a - b)
    .map(([time, text]) => ({ time, text: text.join('\n') }));
}

export function lyricIndex(cues: readonly LyricCue[], seconds: number): number {
  let low = 0,
    high = cues.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cues[middle].time <= seconds) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function localLyricsSource(src: unknown): string | null {
  return typeof src === 'string' && /^\/audio\/nfc\/[a-z0-9_-]+\.lrc$/.test(src)
    ? src
    : null;
}

export function musicTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
