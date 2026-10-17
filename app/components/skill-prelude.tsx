'use client';
import { useEffect, useRef } from 'react';
import catalog from '@/data/skill-cards.json';
import { skillCardArt } from '@/lib/skill-art';
import { cardFacets, clamp01, easeOut, interval, mix, noise, preludeDuration, smooth, type PreludeTheme } from '@/lib/cinematic-motion';
import { bindCinematicSound, GAME_AUDIO } from '@/app/hooks/use-game-audio';
import './skill-prelude.css';

const PALETTE = {
  environment: ['#d7c5ff', '#90bcca'], wushuang: ['#ffe2a3', '#cb9c59'],
  discord: ['#91efff', '#bf91ef'], astral: ['#f3e5ff', '#c090ec'], sword: ['#ffe1ac', '#e98156'],
} as const;
const FACETS = cardFacets();

/** Textured facets and deterministic velocity trails. No outcome-bearing props enter this component. */
export function SkillPrelude({ theme, cardName, actorId, actorName, phone, done, skip }: {
  theme: PreludeTheme; cardName: string; actorId: string; actorName: string; phone: boolean; done: () => void; skip: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d');
    if (!node || !ctx) { done(); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = preludeDuration(theme, phone, reduced), environment = theme === 'environment';
    const [bright, accent] = PALETTE[theme];
    const card = catalog.cards.find(c => c.name === cardName), art = new Image();
    const src = card && (skillCardArt(card.id) || card.artwork);
    if (src) art.src = src;
    let w = 0, h = 0, cw = 0, ch = 0, frame = 0, disposed = false, started = 0, last = 0, slow = 0, quality = 1;
    let origin = { x: 0, y: 0 }, center = { x: 0, y: 0 };
    let shattered = false, absorbed = false;
    const sounds: { audio: HTMLAudioElement; unbind: () => void }[] = [];
    const sound = (src: string, volume: number) => {
      if (phone || reduced || document.hidden) return;
      const audio = new Audio(src), unbind = bindCinematicSound(audio, volume);
      sounds.push({ audio, unbind }); void audio.play().catch(() => {});
    };
    const measure = () => {
      w = innerWidth; h = innerHeight; const dpr = Math.min(devicePixelRatio || 1, 1.5);
      node.width = Math.round(w * dpr); node.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cw = Math.min(238, w * .32, h * .40); ch = cw * 1.40;
      center = { x: w * .5, y: h * .43 };
      const plate = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(p => p.dataset.playerId === actorId);
      const box = plate?.getBoundingClientRect();
      origin = box && box.width && box.height && box.right > 0 && box.left < w && box.bottom > 0 && box.top < h
        ? { x: Math.max(cw * .28, Math.min(w - cw * .28, box.left + box.width / 2)), y: Math.max(ch * .28, Math.min(h - ch * .28, box.top + box.height / 2)) }
        : { x: w * .5, y: h * .69 };
    };
    measure(); window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure); document.querySelectorAll('.tablet-player-card').forEach(p => observer.observe(p));
    const line = (x: number, y: number, tx: number, ty: number, alpha: number, width = 1, color: string = bright) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = clamp01(alpha); ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    };
    const ring = (x: number, y: number, rx: number, ry: number, alpha: number, width = 1) => {
      if (rx < 1 || ry < 1 || alpha <= 0) return;
      ctx.globalAlpha = clamp01(alpha); ctx.strokeStyle = bright; ctx.lineWidth = width;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    };
    const glow = (x: number, y: number, radius: number, alpha: number) => {
      if (alpha <= 0) return;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, bright + 'b0'); gradient.addColorStop(.13, accent + '55'); gradient.addColorStop(1, accent + '00');
      ctx.globalAlpha = clamp01(alpha); ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    const imageReady = () => art.complete && art.naturalWidth > 0;
    const face = (x: number, y: number, scale: number, angle: number, alpha: number) => {
      ctx.save(); ctx.globalAlpha = clamp01(alpha); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
      ctx.shadowColor = '#000b'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 13;
      if (imageReady()) ctx.drawImage(art, -cw / 2, -ch / 2, cw, ch);
      else {
        ctx.fillStyle = '#272136'; ctx.fillRect(-cw / 2, -ch / 2, cw, ch); ctx.fillStyle = bright;
        ctx.font = `400 ${Math.max(14, cw * .13)}px serif`; ctx.textAlign = 'center'; ctx.fillText(cardName, 0, 5, cw * .86);
      }
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = bright; ctx.lineWidth = 1; ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
      ctx.restore();
    };
    const tick = (now: number) => {
      if (disposed) return;
      if (!started) started = now;
      if (last && now - last > 26 && ++slow > 7) quality = .65;
      last = now;
      const progress = clamp01((now - started) / duration), t = progress * (environment ? 1.75 : 2.10);
      node.dataset.progress = progress.toFixed(3);
      node.dataset.phase = progress < .25 ? 'gather' : progress < .39 ? 'fracture' : progress < .80 ? 'release' : 'transition';
      ctx.clearRect(0, 0, w, h);
      if (reduced || phone) {
        const a = reduced ? 1 : Math.min(interval(progress, 0, .16), 1 - interval(progress, .78, 1));
        face(center.x, center.y, phone ? .80 : 1, 0, a);
        if (!reduced) ring(center.x, center.y, cw * (.55 + easeOut(progress) * .12), ch * (.53 + easeOut(progress) * .10), a * .35);
      } else {
        const enter = easeOut(interval(t, 0, .31)), breakAt = environment ? .48 : .62;
        const x = mix(origin.x, center.x, enter), y = mix(origin.y, center.y, enter) - Math.sin(enter * Math.PI) * h * .08;
        const tension = interval(t, .30, breakAt), scale = mix(.36, 1, enter) * (1 - (environment ? .012 : .045) * tension);
        glow(x, y, cw * 1.4, .22 * enter);
        if (t < breakAt) {
          face(x, y, scale, -.08 * (1 - enter), interval(t, 0, .07));
          // The same mesh used for the fracture becomes visible through the original face.
          if (t > .31) {
            ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
            FACETS.forEach((points, i) => { const alpha = interval(t, .31 + noise(i) * .07, breakAt) * .42;
              points.forEach((p, j) => { const next = points[(j + 1) % points.length]; line(p.x * cw, p.y * ch, mix(p.x, next.x, tension) * cw, mix(p.y, next.y, tension) * ch, alpha, .7); });
            }); ctx.restore();
            const sheen = ctx.createLinearGradient(x - cw / 2, y - ch / 2, x + cw / 2, y + ch / 2);
            sheen.addColorStop(0, bright + '00'); sheen.addColorStop(clamp01(tension * .75), bright + '00'); sheen.addColorStop(Math.min(.98, tension * .75 + .07), bright + '40'); sheen.addColorStop(1, bright + '00');
            ctx.globalAlpha = .65; ctx.fillStyle = sheen; ctx.fillRect(x - cw / 2, y - ch / 2, cw, ch);
          }
        }
        if (t >= breakAt) {
          if (!shattered) { shattered = true; sound(GAME_AUDIO.skillShatter, environment ? .35 : .58); }
          const elapsed = Math.max(0, t - breakAt - (environment ? 0 : .05));
          FACETS.forEach((points, i) => {
            const cx = points.reduce((sum, p) => sum + p.x, 0) / 3, cy = points.reduce((sum, p) => sum + p.y, 0) / 3;
            const delay = noise(i + 9) * .035, u = Math.max(0, elapsed - delay), a = Math.atan2(cy, cx) + (noise(i + 51) - .5) * .35;
            const burst = (1 - Math.exp(-u * (environment ? 7 : 10))) / (environment ? 7 : 10);
            const collapse = smooth(interval(t, environment ? 1.25 : 1.37, environment ? 1.72 : 2.02));
            let dx = cx * cw + Math.cos(a) * burst * w * (environment ? 1.45 : 1.18);
            let dy = cy * ch + Math.sin(a) * burst * h * (environment ? .63 : .93);
            if (theme === 'discord') { dx += Math.sign(cy || 1) * Math.sin(u * 7) * 36; dy += Math.sin(i) * u * 12; }
            if (theme === 'sword') { dx *= .72; dy *= 1.3; }
            if (theme === 'astral' || theme === 'wushuang') {
              const turn = u * (theme === 'astral' ? .45 : .8), bx = dx; dx = dx * Math.cos(turn) - dy * Math.sin(turn); dy = bx * Math.sin(turn) + dy * Math.cos(turn);
            }
            const px = center.x + dx * (1 - collapse), py = center.y + dy * (1 - collapse) + (environment ? u * u * 13 : 0);
            const fade = 1 - interval(t, environment ? 1.36 : 1.68, environment ? 1.73 : 2.04);
            const spin = u * (noise(i + 8) - .5) * 3.2, shrink = (1 - collapse * .93) * .965;
            ctx.save(); ctx.translate(px, py); ctx.rotate(spin); ctx.scale(shrink * Math.max(.30, Math.abs(Math.cos(u * (1 + noise(i))))), shrink);
            ctx.beginPath(); points.forEach((p, j) => { if (j) ctx.lineTo((p.x - cx) * cw, (p.y - cy) * ch); else ctx.moveTo((p.x - cx) * cw, (p.y - cy) * ch); }); ctx.closePath();
            ctx.globalAlpha = fade; ctx.save(); ctx.clip();
            if (imageReady()) ctx.drawImage(art, (-.5 - cx) * cw, (-.5 - cy) * ch, cw, ch);
            else { ctx.fillStyle = accent; ctx.fillRect(-cw, -ch, cw * 2, ch * 2); }
            ctx.restore(); ctx.strokeStyle = i % 3 ? bright : accent; ctx.lineWidth = .75; ctx.stroke(); ctx.restore();
          });
          const particleCount = Math.round((environment ? 110 : 140) * quality);
          for (let i = 0; i < particleCount; i++) {
            const u = Math.max(0, elapsed - noise(i + 50) * .11); if (!u) continue;
            const a = i * 2.399963, speed = (.65 + noise(i + 90)) * Math.min(w, h) * 1.05;
            const position = (dt: number) => {
              const drag = (1 - Math.exp(-dt * 5.2)) / 5.2, gather = smooth(interval(t - (u - dt), environment ? 1.27 : 1.3, environment ? 1.74 : 2.02));
              return { x: center.x + Math.cos(a + dt * .65) * speed * drag * (1 - gather), y: center.y + Math.sin(a + dt * .65) * speed * drag * (environment ? .50 : .85) * (1 - gather) };
            };
            const p = position(u), old = position(Math.max(0, u - .024));
            const fade = Math.min(interval(u, 0, .055), 1 - interval(t, environment ? 1.43 : 1.77, environment ? 1.73 : 2.04));
            line(old.x, old.y, p.x, p.y, fade * .65, i % 8 === 0 ? 1.6 : .8, i % 4 ? bright : accent);
          }
          if (environment) { const spread = easeOut(interval(t, .62, 1.44)), fade = 1 - interval(t, 1.16, 1.70);
            ring(center.x, center.y, spread * w * .43, spread * h * .30, fade * .45, 1.6);
            ring(center.x, center.y, spread * w * .43 - 5, spread * h * .30 - 3, fade * .12, 5);
          } else {
            const impact = interval(t, .64, .85); glow(center.x, center.y, cw * (1 + impact * 2), (1 - impact) * .48);
            if (theme === 'sword') line(center.x - cw * .7, center.y + ch, center.x + cw * .7, center.y - ch, (1 - interval(t, .68, .95)) * .85, 2.2);
            if (theme === 'discord') for (let i = 0; i < 3; i++) line(center.x - cw, center.y + (i - 1) * ch * .25, center.x + cw, center.y + (i - 1) * ch * .25 - cw * .25, 1 - interval(t, .68 + i * .04, 1 + i * .04), 1.5, i === 1 ? accent : bright);
          }
        }
        const ending = interval(progress, .78, 1);
        if (ending) {
          if (!absorbed) { absorbed = true; sound(GAME_AUDIO.skillAbsorb, .20); }
          glow(center.x, center.y, cw * (1.6 - ending * .8), Math.sin(ending * Math.PI) * .58);
          ring(center.x, center.y, cw * (.56 - ending * .43), ch * (.36 - ending * .27), Math.sin(ending * Math.PI) * .85, 1.8);
          ctx.globalAlpha = smooth(interval(ending, .55, 1)); ctx.fillStyle = '#090812'; ctx.fillRect(0, 0, w, h);
        }
      }
      ctx.globalAlpha = 1;
      if (progress < 1) frame = requestAnimationFrame(tick); else done();
    };
    frame = requestAnimationFrame(tick);
    const watchdog = setTimeout(done, duration + 400);
    return () => {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(watchdog); observer.disconnect(); window.removeEventListener('resize', measure);
      sounds.forEach(({ audio, unbind }) => { unbind(); audio.pause(); audio.removeAttribute('src'); audio.load(); });
    };
  }, [theme, cardName, actorId, phone, done]);
  return <section className={`skill-prelude prelude-${theme}`} data-prelude-theme={theme} role="dialog" aria-modal="true" aria-label={`${cardName}发动前奏`}>
    <canvas ref={canvas} aria-hidden="true" />
    <div className="skill-prelude-caption"><small>{actorName} · 发动</small><h2>{cardName}</h2></div>
    <button autoFocus type="button" className="skill-prelude-skip" onClick={skip}>跳过演出</button>
  </section>;
}
