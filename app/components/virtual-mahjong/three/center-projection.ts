import { Matrix4, Vector4, type Camera } from 'three';

export const CENTER_PIXELS = 300;
export const CENTER_HALF = 4.15;
export const CENTER_HEIGHT = 0.71;

/** Project the same world-space plane as the center shell into a DOM matrix3d. */
export function centerProjection(camera: Camera, width: number, height: number): number[] {
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const origin = new Vector4(-CENTER_HALF, CENTER_HEIGHT, -CENTER_HALF, 1).applyMatrix4(matrix);
  const x = new Vector4(CENTER_HALF * 2 / CENTER_PIXELS, 0, 0, 0).applyMatrix4(matrix);
  const y = new Vector4(0, 0, CENTER_HALF * 2 / CENTER_PIXELS, 0).applyMatrix4(matrix);
  const screen = (v: Vector4) => [width * (v.x + v.w) / 2 / origin.w, height * (v.w - v.y) / 2 / origin.w, 0, v.w / origin.w];
  return [...screen(x), ...screen(y), 0, 0, 1, 0, ...screen(origin)];
}
