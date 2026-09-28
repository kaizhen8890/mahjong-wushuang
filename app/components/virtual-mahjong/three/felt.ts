import * as T from 'three';
/** Deterministic woven felt, generated locally without a downloaded bitmap. */
export function createFeltTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No felt canvas');
  ctx.fillStyle='#283159';ctx.fillRect(0,0,1024,1024);
  const glow=ctx.createRadialGradient(512,450,50,512,512,730);
  glow.addColorStop(0,'#394564');glow.addColorStop(1,'#232e4c');ctx.fillStyle=glow;ctx.fillRect(0,0,1024,1024);
  // Low contrast fibers remain subordinate to the white tile faces.
  for(let i=0;i<1024;i+=3){ctx.fillStyle='rgba(219,237,214,.025)';ctx.fillRect(i,0,1,1024);ctx.fillStyle='rgba(1,20,24,.035)';ctx.fillRect(0,i,1024,1);}
  ctx.strokeStyle='rgba(198,190,144,.3)';ctx.lineWidth=2;ctx.strokeRect(76,76,872,872);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
/** Reuse the physical table's bundled courtyard; failure keeps the local fallback. */
export function loadTableArtwork(): Promise<HTMLImageElement | null> {
  return new Promise(resolve => { const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src='/art/sakura-courtyard-v2.png'; });
}
export function paintTableArtwork(texture: T.Texture, image: HTMLImageElement) {
  const canvas=texture.image as HTMLCanvasElement, ctx=canvas.getContext('2d')!;
  const scale=Math.max(canvas.width/image.width,canvas.height/image.height);
  ctx.drawImage(image,(canvas.width-image.width*scale)/2,(canvas.height-image.height*scale)/2,image.width*scale,image.height*scale);
  ctx.fillStyle='#19214333';ctx.fillRect(0,0,canvas.width,canvas.height);
  texture.needsUpdate=true;
}
