'use client';
import { useEffect, useRef } from 'react';
import { bezier, clamp01, easeOut, interval, noise, smooth, type MotionPoint } from '@/lib/cinematic-motion';
import './cinematic-return-particles.css';

type ReturnTheme = 'environment' | 'witch' | 'discord' | 'astral' | 'sword-heads' | 'sword-tails' | 'wushuang-heads' | 'wushuang-tails';
const COLORS: Record<ReturnTheme, readonly [string, string]> = {
  environment: ['#d5d8f2', '#8d91c7'], witch: ['#f8e2cd', '#ad89d6'], discord: ['#a2ecff', '#b788ef'],
  astral: ['#faeaff', '#b28bdd'], 'sword-heads': ['#ffe7b0', '#ef9c68'], 'sword-tails': ['#ffe7b0', '#ef9c68'],
  'wushuang-heads': ['#ffe6a7', '#ce9950'], 'wushuang-tails': ['#e8f6ff', '#89b4ff'],
};
const EMPTY: readonly string[] = [];

/** Screen-space paths: rings remain circular and endpoints track actual table plates on rotation. */
export function CinematicReturnParticles({ theme, targetIds = EMPTY }: { theme: ReturnTheme; targetIds?: readonly string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ids = targetIds.join('\u0000');
  useEffect(() => {
    const node = canvas.current, ctx = node?.getContext('2d');
    if (!node || !ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const environment = theme === 'environment', striking = theme === 'witch' || theme === 'wushuang-tails';
    const duration = environment ? 780 : theme === 'witch' ? 1350 : 2200;
    const [bright, accent] = COLORS[theme];
    let w = 0, h = 0, raf = 0, start = 0, disposed = false;
    let points: MotionPoint[] = [];
    const measure = () => {
      w = innerWidth; h = innerHeight; const dpr = Math.min(devicePixelRatio || 1, 1.5);
      node.width = Math.round(w * dpr); node.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wanted = ids.split('\u0000');
      const elements = environment ? [...document.querySelectorAll<HTMLElement>('.experience-environment, .tablet-center-console, .table-control-island')]
        : [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].filter(p => wanted.includes(p.dataset.playerId ?? ''));
      points = elements.map(p => p.getBoundingClientRect()).filter(b => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < h && b.right > 0 && b.left < w)
        .map(b => ({ x: Math.max(12, Math.min(w - 12, b.left + b.width / 2)), y: Math.max(12, Math.min(h - 12, b.top + b.height / 2)) }));
      if (environment) points = points.slice(0, 1);
      // No fabricated player target when the table isn't present (e.g. library previews).
      node.dataset.anchors = JSON.stringify(points);
    };
    measure(); window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('.tablet-player-card, .tablet-center-console, .table-control-island').forEach(p => observer.observe(p));
    const stroke = (a: MotionPoint, b: MotionPoint, alpha: number, width: number, color: string) => {
      ctx.globalAlpha = clamp01(alpha); ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    const ring = (p: MotionPoint, radius: number, alpha: number, width = 1) => {
      ctx.globalAlpha = clamp01(alpha); ctx.strokeStyle = bright; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, radius), 0, Math.PI * 2); ctx.stroke();
    };
    const tick = (now: number) => {
      if (disposed) return;
      if (!start) start = now;
      const t = clamp01((now - start) / duration), unit = Math.min(w, h);
      ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
      const destinations = points.length ? points : [{ x: w * .5, y: h * .46 }];
      const count = environment ? 42 : striking ? 72 : 96;
      for (let i = 0; i < count; i++) {
        const target = destinations[i % destinations.length], angle = i * 2.399963;
        const delay = noise(i + 20) * .15, u = interval(t, delay, .70 + delay);
        if (!u || u === 1) continue;
        const radius = unit * (.15 + noise(i + 4) * .25);
        const source = striking ? { x: target.x + Math.cos(angle) * unit * .16, y: -unit * .18 }
          : { x: w * .5 + Math.cos(angle) * radius, y: h * .44 + Math.sin(angle) * radius * .70 };
        const a = { x: source.x + Math.sin(angle) * unit * .16, y: source.y - unit * .10 };
        const b = { x: target.x + Math.cos(angle + 1.5) * unit * .14, y: target.y - unit * .15 };
        // Acceleration into the destination followed by a soft landing, not a linear particle lerp.
        const travel = (v: number) => bezier(source, a, b, target, smooth(v));
        const p = travel(u), old = travel(Math.max(0, u - (striking ? .027 : .018)));
        const opacity = Math.min(interval(u, 0, .12), 1 - interval(u, .84, 1)) * (environment ? .52 : .76);
        stroke(old, p, opacity, i % 7 ? .8 : 1.7, i % 4 ? bright : accent);
        if (i % 6 === 0) {
          ctx.save(); ctx.globalAlpha = opacity * .7; ctx.translate(p.x, p.y); ctx.rotate(angle + u * 2);
          ctx.fillStyle = bright;
          if (theme === 'astral') { ctx.beginPath(); ctx.ellipse(0, 0, 1.7, 4.4, .3, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(-1, -2.5, 2, 5);
          ctx.restore();
        }
      }
      if (striking && points.length) {
        const opacity = interval(t, .03, .10) * (1 - interval(t, .15, .30));
        points.forEach(p => {
          const a = { x: p.x - unit * .12, y: 0 }, b = { x: p.x + unit * .025, y: p.y * .57 };
          stroke(a, b, opacity * .25, 8, accent); stroke(b, p, opacity * .25, 8, accent);
          stroke(a, b, opacity, 1.8, bright); stroke(b, p, opacity, 1.8, bright);
        });
      }
      destinations.forEach((p, k) => {
        const hit = interval(t, striking ? .16 : .52 + k * .018, 1);
        if (!hit) return;
        const radius = 12 + easeOut(hit) * Math.min(unit * .095, 85), alpha = (1 - hit) ** 1.5;
        ring(p, radius, alpha * .58, 1.3); ring(p, radius * .82, alpha * .18);
        // Impact fragments lose velocity, then sink under gravity.
        for (let i = 0; i < (environment ? 6 : 14); i++) {
          const angle = i * 2.399963, speed = 40 + noise(i + k * 14) * 100;
          const pos = (v: number) => {
            const drag = (1 - Math.exp(-v * 4.5)) / 4.5;
            return { x: p.x + Math.cos(angle) * speed * drag, y: p.y + Math.sin(angle) * speed * drag + v * v * 26 };
          };
          stroke(pos(Math.max(0, hit - .04)), pos(hit), alpha * .7, 1, i % 3 ? bright : accent);
        }
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      node.dataset.progress = t.toFixed(3);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [theme, ids]);
  return <canvas className="cinematic-return-particles" ref={canvas} data-return-theme={theme} aria-hidden="true" />;
}
