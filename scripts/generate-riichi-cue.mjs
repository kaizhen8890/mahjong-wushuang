// Original low-passed noise sweep: no pitched notes or high-frequency chime.
import { writeFileSync } from 'node:fs';
const rate = 22050, duration = 0.85, count = Math.floor(rate * duration);
const pcm = Buffer.alloc(count * 2);
let seed = 73;
let low = 0;
for (let i = 0; i < count; i++) {
  const t = i / rate;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 4294967296 * 2 - 1;
  low += 0.08 * (noise - low);
  let sample = low * 1.4 * Math.sin(Math.PI * t / duration) ** 2;
  sample *= Math.min(1, (duration - t) / 0.08);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync('public/audio/riichi-cue.wav', Buffer.concat([header, pcm]));
