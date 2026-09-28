import * as T from 'three';
import { CENTER_HALF } from './center-projection';

/** Bevelled, layered hardware; text/light are projected onto its top plane for crisp mobile display. */
export function createCenterDial(geometry: <G extends T.BufferGeometry>(value: G) => G,
  material: <M extends T.Material>(value: M) => M): T.Group {
  const root = new T.Group();
  const navy = material(new T.MeshStandardMaterial({ color: '#182238', metalness: .45, roughness: .43 }));
  const edge = material(new T.MeshStandardMaterial({ color: '#a88c58', metalness: .72, roughness: .35 }));
  const blue = material(new T.MeshStandardMaterial({ color: '#34415b', metalness: .4, roughness: .5 }));
  const dark = material(new T.MeshStandardMaterial({ color: '#0b1425', metalness: .2, roughness: .68 }));
  const plate = (width: number, height: number, cut: number, depth: number, y: number, mat: T.Material) => {
    const x = width / 2, z = height / 2;
    const shape = new T.Shape();
    shape.moveTo(-x + cut, -z); shape.lineTo(x - cut, -z); shape.lineTo(x, -z + cut);
    shape.lineTo(x, z - cut); shape.lineTo(x - cut, z); shape.lineTo(-x + cut, z);
    shape.lineTo(-x, z - cut); shape.lineTo(-x, -z + cut); shape.closePath();
    const mesh = new T.Mesh(geometry(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true,
      bevelSegments: 2, steps: 1, bevelSize: .055, bevelThickness: .045, curveSegments: 1 })), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const size = CENTER_HALF * 2;
  root.add(plate(size + .1, size + .1, .62, .28, -.06, navy));
  root.add(plate(size, size, .62, .07, .21, edge));
  root.add(plate(size - .16, size - .16, .56, .16, .28, blue));
  root.add(plate(size - .43, size - .43, .52, .05, .44, dark));
  // Four raised bezels and recessed lamp channels remain inside the existing river clearance.
  for (let seat = 0; seat < 4; seat++) {
    const side = new T.Group(); side.rotation.y = seat * Math.PI / 2;
    const bezel = plate(5.0, 1.4, .22, .065, .49, edge); bezel.position.z = 2.98; side.add(bezel);
    const inset = plate(4.88, 1.27, .2, .045, .555, navy); inset.position.z = 2.98; side.add(inset);
    const badge = plate(1.5, 1.5, .19, .12, .49, edge); badge.position.set(-3.03, .49, 3.03); side.add(badge);
    const lamp = plate(3.65, .3, .12, .025, .52, dark); lamp.position.z = 3.89; side.add(lamp);
    root.add(side);
  }
  root.add(plate(3.92, 3.92, .42, .09, .49, edge));
  root.add(plate(3.74, 3.74, .39, .06, .58, dark));
  return root;
}
