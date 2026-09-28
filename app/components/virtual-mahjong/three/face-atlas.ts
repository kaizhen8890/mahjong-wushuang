import * as T from 'three';
export const FACE_CELL_WIDTH = 192;
export const FACE_CELL_HEIGHT = 272;
export const FACE_PADDING = 8;
export const FACE_COLUMNS = 10;
export const FACE_ROWS = 4;
export const FACE_CODES = ['s','m','p','z'].flatMap((suit,row) =>
  Array.from({length:suit === 'z' ? 7 : 10}, (_,column) => ({code:`${column===9?0:column+1}${suit}`,column,row})).filter(face=>face.code!=='5z'));
/** Rasterize supplied transparent vectors once, into one shared padded GPU texture. */
export async function loadFaceAtlas() {
  const images = await Promise.all(FACE_CODES.map(async face => {
    const img = new Image(); img.src = `/virtual-tiles/faces/${face.code}.svg`; await img.decode(); return { ...face, img };
  }));
  const canvas = document.createElement('canvas');canvas.width=FACE_COLUMNS*FACE_CELL_WIDTH;canvas.height=FACE_ROWS*FACE_CELL_HEIGHT;
  const context=canvas.getContext('2d');if(!context)throw new Error('No face atlas canvas');
  for(const {column,row,img} of images) {
    const width=FACE_CELL_WIDTH-2*FACE_PADDING, height=width*26/19;
    context.drawImage(img,column*FACE_CELL_WIDTH+FACE_PADDING,row*FACE_CELL_HEIGHT+(FACE_CELL_HEIGHT-height)/2,width,height);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  return texture;
}
