/** One foreground skill song, resumable riichi loops, and an explicit-player suspension. */
type MusicEntry = { audio: HTMLAudioElement; volume: () => number };
export function createMusicDirector({ create, hidden, duck = () => 1 }: {
  create: (src: string) => HTMLAudioElement; hidden: () => boolean; duck?: () => number;
}) {
  const riichi = new Set<MusicEntry>(), pending = new Set<HTMLAudioElement>(), holds = new Set<symbol>();
  const seen = new Set<string>();
  let skill: (MusicEntry & { owner: string; key: string; remove: () => void }) | undefined;
  const release = (audio: HTMLAudioElement) => { audio.pause(); audio.removeAttribute('src'); audio.load(); };
  const permitted = (audio: HTMLAudioElement) => !hidden() && !holds.size &&
    (skill ? audio === skill.audio : [...riichi].some(entry => entry.audio === audio));
  const play = (entry: MusicEntry, fail?: () => void) => {
    const audio = entry.audio;
    audio.volume = Math.max(0, Math.min(1, entry.volume() * duck()));
    if (!permitted(audio)) { audio.pause(); return; }
    if (!audio.paused || pending.has(audio)) return;
    pending.add(audio);
    let retry = false;
    void audio.play().then(() => {
      if (!permitted(audio)) audio.pause();
      else retry = audio.paused;
    }).catch(() => {
      // A visibility/suspension race is resumable, a real decode/autoplay failure releases the priority.
      if (permitted(audio)) fail?.();
    }).finally(() => { pending.delete(audio); if (retry) play(entry, fail); });
  };
  const sync = () => {
    for (const entry of riichi) play(entry);
    const current = skill;
    if (current) play(current, () => stopSkill(current.owner, current.key));
  };
  const stopSkill = (owner?: string, key?: string) => {
    const current = skill;
    if (!current || (owner && owner !== current.owner) || (key && key !== current.key)) return;
    skill = undefined; current.remove(); release(current.audio); sync();
  };
  return {
    sync, stopSkill,
    addRiichi(audio: HTMLAudioElement, volume: () => number) {
      const entry = { audio, volume }; riichi.add(entry); sync();
      return () => { riichi.delete(entry); release(audio); };
    },
    startSkill(owner: string, key: string, src: string, volume = .55) {
      if (hidden() || seen.has(key) || !/^\/audio\/nfc\/[a-z0-9_-]+\.(mp3|m4a|mp4|ogg|wav)$/.test(src)) return false;
      const audio = create(src); audio.preload = 'auto'; audio.loop = false;
      const finish = () => stopSkill(owner, key);
      audio.addEventListener('ended', finish); audio.addEventListener('error', finish);
      const previous = skill;
      skill = { audio, owner, key, volume: () => volume, remove: () => {
        audio.removeEventListener('ended', finish); audio.removeEventListener('error', finish);
      } };
      seen.add(key); if (seen.size > 128) seen.delete(seen.values().next().value!);
      // Replace atomically: an old song ending must not resume riichi over its replacement.
      if (previous) { previous.remove(); release(previous.audio); }
      sync(); return true;
    },
    hold() {
      const token = Symbol(); holds.add(token); sync();
      return () => { holds.delete(token); sync(); };
    },
  };
}
