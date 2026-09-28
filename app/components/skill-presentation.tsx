'use client';

import { useEffect, useRef } from 'react';
import * as ReactDOM from 'react-dom';
import { GAME_AUDIO, playGameSound, preloadGameSoundLoop, startGameSoundLoop } from '@/app/hooks/use-game-audio';
import type { TablePresentation } from '@/lib/presentation';
import { skillCardArt } from '@/lib/skill-art';
import { CharacterPortrait } from './character-picker';
import type { CharacterChoice } from '@/lib/characters';

type Point = { x: number; y: number };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x-a.x)*t, y: a.y+(b.y-a.y)*t });
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1-(1-clamp(t))**3;
const colors = { '攻': '#ff566d', '团': '#62baff', '单': '#73f5a5', '陷': '#dd8cff' };

/** All anchors are measured from the rendered, rotated nameplates, not seat coordinates. */
export function SkillPresentation({ event, character }: { event: TablePresentation; character?: CharacterChoice }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const skill = event.skill;
    if (!canvas || !skill) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const art = new Image();
    const src = skillCardArt(skill.cardId);
    if (src) art.src = src;
    let width = 0, height = 0, frame = 0;
    let actor: Point, targets: Point[];
    const measure = () => {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const anchor = (id: string) => {
        const plate = [...document.querySelectorAll<HTMLElement>('.tablet-player-card')].find(node => node.dataset.playerId === id);
        if (!plate) return { x: width/2, y: height/2 };
        const rect = plate.getBoundingClientRect();
        return { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
      };
      actor = anchor(event.playerId); targets = skill.targetIds.map(anchor);
      canvas.dataset.targets = JSON.stringify(targets);
      canvas.dataset.actor = JSON.stringify(actor);
    };
    measure();
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('.tablet-player-card').forEach(node => observer.observe(node));
    window.addEventListener('resize', measure);
    const color = colors[skill.type];
    const start = performance.now();
    const impactTime = skill.type === '陷' ? 1100 : skill.type === '攻' ? 1500 : 1250;
    const absorptionStart = impactTime + 400;
    const absorptionEnd = impactTime + 1476;
    if (skill.type !== '陷' && !reduced) preloadGameSoundLoop(skill.type === '攻' ? GAME_AUDIO.skillAttackAbsorb : GAME_AUDIO.skillAbsorb);
    let shattered = false, absorptionStarted = false;
    let stopAbsorption: (() => void) | undefined;
    const circle = (point: Point, radius: number, alpha: number, ring = false) => {
      ctx.globalAlpha = clamp(alpha); ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(0,radius), 0, Math.PI*2);
      if (ring) { ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.fill(); }
    };
    const drawCard = (point: Point, scale: number, rotation: number, alpha: number) => {
      const cardWidth = Math.min(210, width*.25, height*.28), cardHeight = cardWidth*1.4;
      // Keep the complete face within the display during its readable reveal.
      const x = Math.max(cardWidth*scale/2+8, Math.min(width-cardWidth*scale/2-8, point.x));
      const y = Math.max(cardHeight*scale/2+8, Math.min(height-cardHeight*scale/2-8, point.y));
      ctx.save(); ctx.translate(x,y); ctx.rotate(rotation); ctx.scale(scale,scale); ctx.globalAlpha=clamp(alpha);
      ctx.shadowBlur=25; ctx.shadowColor=color;
      if (art.complete && art.naturalWidth) ctx.drawImage(art,-cardWidth/2,-cardHeight/2,cardWidth,cardHeight);
      else {
        ctx.fillStyle='#30233f'; ctx.fillRect(-cardWidth/2,-cardHeight/2,cardWidth,cardHeight);
        ctx.strokeStyle=color; ctx.strokeRect(-cardWidth/2,-cardHeight/2,cardWidth,cardHeight);
        ctx.fillStyle='#fff0ce';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText(skill.name,0,0,cardWidth-18);
      }
      ctx.restore();
    };
    const tick = (now: number) => {
      const ms=now-start, center={ x: width/2, y: height/2 };
      ctx.clearRect(0,0,width,height);
      if (reduced) {
        drawCard(center,1,0,Math.min(clamp(ms/180),clamp((3100-ms)/250)));
      } else {
        const trap = skill.type === '陷', attack = skill.type === '攻';
        if (!shattered && ms >= impactTime) {
          shattered = true;
          playGameSound(GAME_AUDIO.skillShatter, 0.8);
        }
        if (!trap && !absorptionStarted && ms >= absorptionStart && ms < absorptionEnd) {
          absorptionStarted = true;
          stopAbsorption = startGameSoundLoop(attack ? GAME_AUDIO.skillAttackAbsorb : GAME_AUDIO.skillAbsorb, 0.72, attack ? 1 : 1.8);
        }
        if (stopAbsorption && ms >= absorptionEnd) {
          stopAbsorption();
          stopAbsorption = undefined;
        }
        const impactPoints=attack && targets.length ? targets : [center];
        if (ms < impactTime+220) {
          const origin=trap ? center : actor;
          const reveal=mix(origin,center,ease(ms/480));
          if (attack && ms>1050) {
            for (const target of impactPoints) {
              const t=clamp((ms-1050)/450);
              drawCard(mix(center,target,t*t),1-.55*t,Math.sin(t*Math.PI)*.22,1-clamp((ms-impactTime)/180));
            }
          } else drawCard(reveal, .28+.72*ease(ms/420), trap ? Math.sin(ms/90)*.025 : -.12*(1-ease(ms/480)),1-clamp((ms-impactTime)/200));
        }
        if (ms>=impactTime) {
          const elapsed=ms-impactTime;
          impactPoints.forEach(point=> {
            circle(point,20+elapsed*.16,(1-elapsed/650)*.75,true);
            circle(point,8+elapsed*.045,(1-elapsed/330)*.4);
          });
          const recipients=trap ? [center] : skill.type==='单' ? [actor] : targets.length ? targets : [center];
          recipients.forEach((target, targetIndex)=> {
            const origin=attack ? target : center;
            for(let i=0;i<48;i++) {
              const t=clamp((elapsed-(i%8)*18)/1350);
              if (t<=0 || t>=1) continue;
              const angle=i*2.39996+targetIndex, radius=45+(i*37%100);
              const burst={x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius};
              let point: Point;
              if(trap) point=mix(origin,{x:origin.x+Math.cos(angle)*radius*2.5,y:origin.y+Math.sin(angle)*radius*2.5},ease(t));
              else if(t<.3) point=mix(origin,burst,ease(t/.3));
              else { const p=ease((t-.3)/.7); point=mix(burst,target,p); point.y-=Math.sin(p*Math.PI)*(30+i%5*9); }
              ctx.shadowBlur=12;ctx.shadowColor=color;
              circle(point,1.5+(i%4)*.7,trap ? (1-t)*.95 : Math.sin(Math.PI*t)*.95);
            }
            if(!trap && elapsed>750) {
              ctx.shadowBlur=18;ctx.shadowColor=color;
              circle(target,40*(1-clamp((elapsed-750)/1000))+7,Math.sin(clamp((elapsed-750)/1000)*Math.PI)*.75,true);
            }
          });
          ctx.shadowBlur=0;
        }
      }
      ctx.globalAlpha=1;
      if(ms<3300) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); stopAbsorption?.(); observer.disconnect(); window.removeEventListener('resize',measure); };
  }, [event]);
  return ReactDOM.createPortal(<output className="skill-presentation" aria-label={`${event.playerName}发动${event.skill?.name ?? '技能'}`}>
    <canvas ref={ref} aria-hidden="true" />
    <CharacterPortrait choice={character} className="presentation-character" />
    <span className="skill-presentation-caption">{event.skill?.type === '陷' ? '陷阱触发' : event.playerName} · {event.skill?.name}</span>
  </output>, document.body);
}
