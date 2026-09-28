import { MOTION_MS, motionProgress } from './motion';
import { createFeltTexture, loadTableArtwork, paintTableArtwork } from './felt';
import { loadFaceAtlas, FACE_CELL_WIDTH, FACE_CELL_HEIGHT, FACE_COLUMNS, FACE_ROWS, FACE_PADDING } from './face-atlas';
import { DEFAULT_QUALITY, qualitySettings, qualityPixelRatio, type TableQuality } from './quality';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { centerProjection } from './center-projection';
import { createCenterDial } from './center-dial';

/** Display data only. Unknown tiles have neither a face nor a game tile ID. */
export interface TableTile {
  key: string; tileId?: number; face?: { column: number; row: number };
  x: number; y: number; z: number; yaw: number; flat: boolean;
  sideways?: boolean; tilt?: number; scale?: number; selected?: boolean; highlighted?: boolean;
  dora?: boolean;
  enabled?: boolean; muted?: boolean;
  motion?: keyof typeof MOTION_MS; delay?: number; origin?: { x: number; y: number; z: number };
}
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; tiles: number; frames: number; cpuMs: number; lost: boolean }

/** One owner for all GPU resources, observers, listeners and frames. No Host access. */
export class TableScene {
  readonly renderer: T.WebGLRenderer;
  readonly camera = new T.PerspectiveCamera(38, 1, 0.1, 500);
  private readonly scene = new T.Scene();
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly materials = new Set<T.Material>();
  private readonly roots = new Map<string, T.Group>();
  private readonly faceGeometries = new Map<string, T.BufferGeometry>();
  private readonly pool: T.Group[] = [];
  private readonly ray = new T.Raycaster();
  private readonly observer: ResizeObserver;
  private readonly motions = new Map<T.Group, { from: T.Vector3; to: T.Vector3; rotation: T.Quaternion; targetRotation: T.Quaternion; started: number; duration: number; lift: number }>();
  private texture: T.Texture | null = null;
  private felt: T.Texture;
  private light: T.DirectionalLight;
  private disposed = false;
  private lost = false;
  private lossCount = 0;
  private recoveryTimer = 0;
  private frame = 0;
  private frames = 0;
  private cpuMs = 0;
  private press: { x: number; y: number; id: number | null; pointer: number } | null = null;
  private body: T.BufferGeometry;
  private ivory: T.MeshStandardMaterial;
  private back: T.MeshStandardMaterial;
  private accent: T.MeshStandardMaterial;
  private faceMaterial: T.MeshBasicMaterial;
  private mutedFace: T.MeshBasicMaterial;
  private doraSheen: T.ShaderMaterial;
  private doraGeometry: T.PlaneGeometry;
  private doraCount = 0;
  private sheenTimer = 0;
  private reducedMotion = false;
  private quality: TableQuality = DEFAULT_QUALITY;

  constructor(private canvas: HTMLCanvasElement, private onPick: (id: number) => void,
    private onFailure: (message: string) => void,
    private onCenterProjection?: (matrix: string) => void) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.setClearColor('#202641', 0);
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.scene.add(new T.HemisphereLight('#ffffff', '#68757a', 2.0));
    const light = this.light = new T.DirectionalLight('#ffffff', 1.6); light.position.set(-10, 28, 10); this.scene.add(light);
    Object.assign(light.shadow.camera, { left: -24, right: 24, top: 23, bottom: -23, near: 1, far: 75 });
    light.shadow.bias = -0.0002; light.shadow.normalBias = 0.025; light.shadow.camera.updateProjectionMatrix();
    this.updateShadows();
    const geometry = <G extends T.BufferGeometry>(value: G) => { this.geometries.add(value); return value; };
    const material = <M extends T.Material>(value: M) => { this.materials.add(value); return value; };
    this.body = geometry(new RoundedBoxGeometry(1, 1.4, 0.52, 2, 0.075));
    this.ivory = material(new T.MeshStandardMaterial({ color: '#efefef', roughness: 0.72 }));
    this.back = material(new T.MeshStandardMaterial({ color: '#088370', roughness: 0.7 }));
    this.accent = material(new T.MeshStandardMaterial({ color: '#ffe19a', emissive: '#667923', emissiveIntensity: 0.45 }));
    this.faceMaterial = material(new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, alphaTest: 0.015, depthWrite: false }));
    this.mutedFace = material(new T.MeshBasicMaterial({ color: '#81928e', transparent: true, alphaTest: 0.015, depthWrite: false }));
    this.doraGeometry = geometry(new T.PlaneGeometry(0.91, 1.29));
    this.doraSheen = material(new T.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { phase: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform float phase; void main(){float center=-0.3+1.6*phase; float band=abs(vUv.y+0.11*(vUv.x-0.5)-center); float glow=1.0-smoothstep(0.015,0.19,band); float fade=smoothstep(0.0,0.1,phase)*(1.0-smoothstep(0.72,0.92,phase)); gl_FragColor=vec4(1.0,1.0,1.0,glow*fade*0.72);}' }));
    const table = new T.Mesh(geometry(new RoundedBoxGeometry(37, 0.7, 30, 2, 0.3)),
      material(new T.MeshStandardMaterial({ color: '#232e4c', roughness: 0.45, metalness: 0.2 })));
    table.position.y = -0.6; this.scene.add(table);
    const trim = new T.Mesh(geometry(new RoundedBoxGeometry(36.4, 0.1, 29.4, 2, 0.24)),
      material(new T.MeshStandardMaterial({color:'#c7b287',metalness:0.65,roughness:0.42})));
    trim.position.y=-0.25;this.scene.add(trim);
    this.felt=createFeltTexture();
    const cloth = new T.Mesh(geometry(new RoundedBoxGeometry(35.8, 0.08, 28.8, 2, 0.16)),
      material(new T.MeshStandardMaterial({ map:this.felt, roughness:1 })));
    cloth.position.y = -0.16; cloth.receiveShadow=true; this.scene.add(cloth);
    this.scene.add(createCenterDial(geometry, material));
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
    document.addEventListener('visibilitychange', this.visibility);
    this.resize();
  }

  async loadAtlas() {
    const [texture, artwork] = await Promise.all([loadFaceAtlas(), loadTableArtwork()]);
    if (this.disposed) { texture.dispose(); return; }
    if (artwork) paintTableArtwork(this.felt, artwork);
    texture.anisotropy = Math.min(qualitySettings(this.quality).anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    this.texture = texture; this.faceMaterial.map = texture; this.mutedFace.map = texture;
    this.faceMaterial.needsUpdate = true; this.mutedFace.needsUpdate = true; this.invalidate();
  }

  private faceGeometry(column: number, row: number) {
    const key = `${column}:${row}`;
    let geometry = this.faceGeometries.get(key);
    if (!geometry) {
      geometry = new T.PlaneGeometry(0.91, 1.29);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i,
        (column * FACE_CELL_WIDTH + FACE_PADDING + uv.getX(i) * (FACE_CELL_WIDTH - 2 * FACE_PADDING)) / (FACE_COLUMNS * FACE_CELL_WIDTH),
        1 - (row * FACE_CELL_HEIGHT + FACE_PADDING + (1 - uv.getY(i)) * (FACE_CELL_HEIGHT - 2 * FACE_PADDING)) / (FACE_ROWS * FACE_CELL_HEIGHT));
      this.faceGeometries.set(key, geometry); this.geometries.add(geometry);
    }
    return geometry;
  }

  sync(tiles: readonly TableTile[], animate?: boolean) {
    if (this.disposed) return;
    if (animate === false) this.finishMotions();
    const sources = new Map<number, { position: T.Vector3; rotation: T.Quaternion }>();
    if (animate) for (const root of this.roots.values()) if (typeof root.userData.tileId === 'number')
      sources.set(root.userData.tileId, { position: root.position.clone(), rotation: root.quaternion.clone() });
    const wanted = new Set(tiles.map(tile => tile.key));
    for (const [key, root] of this.roots) if (!wanted.has(key)) {
      this.scene.remove(root); this.roots.delete(key); this.motions.delete(root); root.userData = {}; this.pool.push(root);
    }
    let changed = false;
    for (const tile of tiles) {
      let root = this.roots.get(tile.key);
      const existing = Boolean(root);
      if (!root) {
        root = this.pool.pop() ?? new T.Group(); root.userData = {};
        if (!root.children.length) {
          const ivory = new T.Mesh(this.body, this.ivory); ivory.scale.z = 0.77; ivory.position.z = 0.06; ivory.castShadow = true; root.add(ivory);
          const back = new T.Mesh(this.body, this.back); back.scale.set(1, 1, 0.28); back.position.z = -0.19; root.add(back);
          const face = new T.Mesh(this.faceGeometry(0, 0), this.faceMaterial); face.position.z = 0.266; root.add(face);
          const sheen = new T.Mesh(this.doraGeometry, this.doraSheen); sheen.position.z = 0.271; sheen.visible = false; root.add(sheen);
        }
        this.roots.set(tile.key, root); this.scene.add(root); changed = true;
      }
      const signature = JSON.stringify(tile);
      if (root.userData.signature === signature) continue;
      const priorMotion = this.motions.get(root);
      const from = root.position.clone(), rotation = root.quaternion.clone();
      changed = true; root.userData = { signature, tileId: tile.tileId, enabled: tile.enabled === true, dora: Boolean(tile.face && tile.dora) };
      root.position.set(tile.x, tile.y + (tile.selected ? 0.4 : 0), tile.z);
      root.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), tile.yaw);
      root.rotateX(tile.flat ? -Math.PI / 2 : tile.tilt ?? 0);
      if (tile.sideways) root.rotateZ(Math.PI / 2);
      root.scale.setScalar(tile.scale ?? 1);
      (root.children[0] as T.Mesh).material = tile.selected || tile.highlighted ? this.accent : this.ivory;
      const face = root.children[2] as T.Mesh;
      face.visible = Boolean(tile.face);
      if (tile.face) face.geometry = this.faceGeometry(tile.face.column, tile.face.row);
      face.material = tile.muted ? this.mutedFace : this.faceMaterial;
      root.children[3].visible = Boolean(tile.face && tile.dora && !this.reducedMotion);
      // Face-down kan tiles expose the green back; standing opponents retain outward seat orientation.
      if (!tile.face && tile.flat) root.rotateY(Math.PI);
      const to = root.position.clone(), targetRotation = root.quaternion.clone();
      if (priorMotion && priorMotion.to.distanceToSquared(to) < 1e-10 && priorMotion.targetRotation.angleTo(targetRotation) < 1e-6) {
        root.position.copy(from); root.quaternion.copy(rotation);
      } else {
        this.motions.delete(root);
        if (animate && !document.hidden && tile.motion) {
          const source = tile.tileId === undefined ? undefined : sources.get(tile.tileId);
          const start = existing ? from : source?.position ?? (tile.origin ? new T.Vector3(tile.origin.x,tile.origin.y,tile.origin.z) : to);
          const startRotation = existing ? rotation : source?.rotation ?? (tile.motion === 'nuki'
            ? new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), tile.yaw) : tile.sideways && tile.motion === 'discard'
            ? targetRotation.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1), -Math.PI/2)) : targetRotation);
          if (start.distanceToSquared(to) > 1e-10 || startRotation.angleTo(targetRotation) > 1e-6) {
            this.motions.set(root,{ from:start.clone(),to,rotation:startRotation.clone(),targetRotation,started:performance.now()+(tile.delay ?? 0),duration:MOTION_MS[tile.motion],lift:tile.motion === 'nuki' ? 1.1 : 0 });
            root.position.copy(start);root.quaternion.copy(startRotation);
          }
        }
      }
    }
    // Removed meshes must also trigger a render, including an empty snapshot.
    this.doraCount = tiles.filter(tile => tile.face && tile.dora).length;
    if (changed || wanted.size !== this.lastCount) this.invalidate();
    this.lastCount = wanted.size;
  }
  private lastCount = 0;
  private finishMotions() {
    for (const [root,motion] of this.motions) { root.position.copy(motion.to);root.quaternion.copy(motion.targetRotation); }
    this.motions.clear();
  }
  private advanceMotions(now: number) {
    for (const [root,motion] of this.motions) {
      const t=motionProgress(now-motion.started,motion.duration);
      root.position.lerpVectors(motion.from,motion.to,t);root.quaternion.slerpQuaternions(motion.rotation,motion.targetRotation,t);
      root.position.y += Math.sin(Math.PI * t) * motion.lift;
      if(t>=1)this.motions.delete(root);
    }
  }

  pick(clientX: number, clientY: number): number | null {
    if (this.disposed || this.lost) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    // Include disabled tiles as occluders, never click through them to a legal tile behind.
    const hit = this.ray.intersectObjects([...this.roots.values()], true)[0];
    if (!hit) return null;
    const root = hit.object.parent!;
    return root.userData.enabled && typeof root.userData.tileId === 'number' ? root.userData.tileId : null;
  }
  project(key: string) {
    const root = this.roots.get(key); if (!root) return null;
    const rect = this.canvas.getBoundingClientRect(); this.camera.updateMatrixWorld(true);
    const p = root.position.clone().project(this.camera);
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }
  setQuality(quality: TableQuality) {
    if (this.quality === quality) return;
    this.quality = quality;
    if (this.texture) { this.texture.anisotropy = Math.min(qualitySettings(quality).anisotropy, this.renderer.capabilities.getMaxAnisotropy()); this.texture.needsUpdate = true; }
    this.updateShadows(); this.resize();
  }
  private updateShadows() {
    const size = this.quality === 'low' || this.quality === 'standard' ? 0 : this.quality === 'high' ? 1024 : 2048;
    this.renderer.shadowMap.enabled = size > 0; this.light.castShadow = size > 0;
    this.light.shadow.map?.dispose(); this.light.shadow.map = null;
    if (size) this.light.shadow.mapSize.set(size, size);
  }
  setLowQuality(low: boolean) { this.setQuality(low ? 'low' : DEFAULT_QUALITY); }
  setReducedMotion(reduced: boolean) {
    if (this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
    for (const root of this.roots.values()) root.children[3].visible = !reduced && Boolean(root.userData.dora);
    this.invalidate();
  }
  private pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    this.press = { x: event.clientX, y: event.clientY, id: this.pick(event.clientX, event.clientY), pointer: event.pointerId };
  };
  private pointerUp = (event: PointerEvent) => {
    const press = this.press; this.press = null;
    if (!press || press.pointer !== event.pointerId || press.id === null || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) return;
    if (this.pick(event.clientX, event.clientY) === press.id) this.onPick(press.id);
  };
  private pointerCancel = () => { this.press = null; };
  cancelInput() { this.pointerCancel(); }
  private resize = () => {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const gl = this.renderer.getContext();
    const maxSize = Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    this.renderer.setPixelRatio(qualityPixelRatio(this.quality, rect.width, rect.height, maxSize));
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    const distance = Math.max(1, 1.65 / this.camera.aspect);
    this.camera.position.set(0, 30 * distance, 32 * distance);
    this.camera.zoom = 1.2;
    this.camera.lookAt(0, 0, 2.8); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true);
    this.onCenterProjection?.(`matrix3d(${centerProjection(this.camera, rect.width, rect.height).join(',')})`);
    this.invalidate();
  };
  private visibility = () => { this.pointerCancel(); this.finishMotions(); if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; } else this.resize(); };
  private contextLost = (event: Event) => {
    event.preventDefault(); this.finishMotions(); this.lost = true; this.pointerCancel(); cancelAnimationFrame(this.frame); this.frame = 0;
    window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = window.setTimeout(() => {
      if (this.lost && !this.disposed) this.onFailure('3D图形上下文未恢复，已切回平面牌桌。');
    }, 4000);
    if (++this.lossCount >= 3) this.onFailure('3D图形上下文多次中断，已切回平面牌桌。');
  };
  private contextRestored = () => { window.clearTimeout(this.recoveryTimer); if (!this.disposed) { this.lost = false; this.resize(); } };
  invalidate() {
    if (this.frame || this.disposed || this.lost || document.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0; if (this.disposed || this.lost) return;
      try { const start = performance.now(); this.advanceMotions(start); this.doraSheen.uniforms.phase.value = (start % 3200) / 3200; this.renderer.render(this.scene, this.camera); this.cpuMs = performance.now() - start; this.frames++; }
      catch { this.finishMotions(); this.onFailure('3D绘制失败，已切回平面牌桌。'); }
      if (this.motions.size || (this.doraCount && !this.reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        if (this.motions.size) this.invalidate(); else this.sheenTimer = window.setTimeout(() => { this.sheenTimer = 0; this.invalidate(); }, 42);
      }
    });
  }
  stats(): SceneStats {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures,
      tiles: this.roots.size, frames: this.frames, cpuMs: this.cpuMs, lost: this.lost };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); window.clearTimeout(this.recoveryTimer); window.clearTimeout(this.sheenTimer); this.frame = 0; this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.pointerDown); this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('webglcontextlost', this.contextLost); this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    document.removeEventListener('visibilitychange', this.visibility);
    this.motions.clear(); this.scene.clear(); this.roots.clear(); this.pool.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.texture?.dispose(); this.felt.dispose(); this.light.shadow.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
    this.geometries.clear(); this.materials.clear(); this.faceGeometries.clear();
  }
}


