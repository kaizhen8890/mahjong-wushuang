import type { SkillExperienceEvent } from './skill-experience';
import landscape from '../public/cinematics/rulebook/v1/anchors-landscape.json';
import portrait from '../public/cinematics/rulebook/v1/anchors-portrait.json';

export type Point = readonly [number, number];
export type Quad = readonly [Point, Point, Point, Point];
type Anchor = { time: number; points: number[][] };
export function isRulebookCinematic(event: SkillExperienceEvent) {
  return event.kind === 'environment' && event.environment === 'yaku';
}
export function rulebookFilm(vertical: boolean) {
  const shape = vertical ? 'portrait' : 'landscape';
  return { src: `/cinematics/rulebook/v1/intro-${shape}.mp4`, poster: `/cinematics/rulebook/v1/poster-${shape}.jpg`,
    width: vertical ? 1000 : 1600, height: vertical ? 1600 : 1000,
    duration: 5.6, reveal: 5.05, tail: 700, anchors: (vertical ? portrait : landscape) as Anchor[] };
}
/** Live event text remains authoritative; the reusable movie has no chosen yaku. */
export function rulebookYaku(event: SkillExperienceEvent) {
  return event.label.split(' · ')[0].trim() || '待声明役种';
}
export function sampleQuad(anchors: Anchor[], time: number): Quad {
  const after = anchors.findIndex(a => a.time >= time);
  if (after <= 0) return anchors[after === 0 ? 0 : anchors.length - 1].points as unknown as Quad;
  const a = anchors[after - 1], b = anchors[after], t = (time - a.time) / (b.time - a.time);
  return a.points.map((p, i) => [p[0] + (b.points[i][0] - p[0]) * t, p[1] + (b.points[i][1] - p[1]) * t]) as unknown as Quad;
}
/** Match the video's object-fit:contain, including letterboxing on rotation. */
export function fitQuad(points: Quad, filmWidth: number, filmHeight: number, width: number, height: number): Quad {
  const scale = Math.min(width / filmWidth, height / filmHeight), w = filmWidth * scale, h = filmHeight * scale;
  return points.map(([x, y]) => [(width - w) / 2 + x * w, (height - h) / 2 + y * h]) as unknown as Quad;
}
/** Project a source rectangle onto TL/TR/BR/BL using a planar homography. */
export function quadMatrix(q: Quad, width = 640, height = 320): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(det) < 1e-8 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const h = Math.abs(det) < 1e-8 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  return [(p1[0] - p0[0] + g * p1[0]) / width, (p1[1] - p0[1] + g * p1[1]) / width, 0, g / width,
    (p3[0] - p0[0] + h * p3[0]) / height, (p3[1] - p0[1] + h * p3[1]) / height, 0, h / height,
    0, 0, 1, 0, p0[0], p0[1], 0, 1];
}
