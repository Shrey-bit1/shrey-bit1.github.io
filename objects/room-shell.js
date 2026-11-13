// The room shell: walls, columns, floor, and the window with its frame, sashes, handles,
// stay and blind. Every part is a box, cylinder or sphere on a named layer, so the
// bench can write it to models/room-shell.3dm as NURBS, and a file edited in Rhino can come
// back: decorate() works from layer names and bounding boxes, not from the parameters' parts.
//
// Scene frame: metres, y up. x runs out from the window wall into the room, z along the
// window wall. The desk corner is fixed: the window wall's inner face is x = -0.72, the
// block wall's inner face is z = -0.5. Everything else follows the parameters.
import * as THREE from 'three';
import { box, span, cylinder, at, sphere, group, lines, cutWall, unionOutline, blockTexture, floorboards,
  stippleFaces, VIEW_DIR, SHADOW_ONLY } from '../lib/draw.js';

export const X_IN = -0.72, Z_IN = -0.5;
const COURSE = 0.2, BLOCK_W = 0.42;   // the block coursing, as in blockTexture() in lib/draw.js

// The bench draws one slider per entry. 0007 and 0008: the defaults are the settings you
// saved on the bench (bench/room-shell.json). What was measured and what was guessed is in the 0006
// and 0007 reports.
export const PARAMS = [
  { key: 'winW', label: 'Window width', value: 1.9, min: 1.2, max: 2.6, step: 0.01 },
  { key: 'winH', label: 'Window height', value: 1.61, min: 1.0, max: 2.0, step: 0.01 },
  { key: 'pier', label: 'Wall each side of the window', value: 0.45, min: 0.2, max: 0.9, step: 0.01 },
  { key: 'board', label: 'Sill height (top of the wall under the window)', value: 0.8, min: 0.6, max: 1.1, step: 0.01 },
  { key: 'wallH', label: 'Wall height, where it is cut', value: 2.8, min: 2.3, max: 2.9, step: 0.01 },
  // 0009 note 8: the window wall is a two-leaf wall with a facing brick outside: 420 mm.
  { key: 'wallT', label: 'Window wall thickness', value: 0.42, min: 0.18, max: 0.6, step: 0.01 },
  { key: 'blockT', label: 'Block wall thickness', value: 0.2, min: 0.08, max: 0.2, step: 0.01 },
  { key: 'roomD', label: 'Room drawn to, from the window wall', value: 2.04, min: 1.5, max: 4.5, step: 0.01 },
  // 0010: the corner column runs through both walls to the building's outside corner; these
  // are only how far it stands proud of the walls inside the room.
  { key: 'colW', label: 'Column, out from the window wall into the room', value: 0.15, min: 0, max: 0.4, step: 0.01 },
  { key: 'colD', label: 'Column, out from the back wall into the room', value: 0.1, min: 0, max: 0.3, step: 0.01 },
  { key: 'sideCut', label: 'Far side wall cut at', value: 0.02, min: 0.02, max: 1.0, step: 0.01 },
  { key: 'sashes', label: 'Sashes', value: 3, min: 1, max: 4, step: 1 },
  { key: 'frameW', label: 'Frame face width', value: 0.055, min: 0.03, max: 0.09, step: 0.005 },
  { key: 'sashW', label: 'Sash face width', value: 0.05, min: 0.04, max: 0.1, step: 0.005 },
  { key: 'handleY', label: 'Handle height above the frame bottom', value: 0.46, min: 0.2, max: 1.2, step: 0.01 },
  { key: 'blind', label: 'Blind let down', value: 0.28, min: 0, max: 1, step: 0.01, unit: '%' },
  // 0008 note 7. Tilt of the slats from flat, the outer edge down. 31.5 is what was drawn before.
  { key: 'slat', label: 'Blind slat angle (0 = flat, 90 = closed)', value: 31.5, min: 0, max: 90, step: 0.5, unit: '°' },
];
export const defaults = () => Object.fromEntries(PARAMS.map((p) => [p.key, p.value]));

// The floor slab from the top (0007 note 3). All guesses: 15 oak parquet, 70 screed with the
// underfloor heating pipes, 30 impact sound insulation, 250 concrete, 10 plaster below.
export const SLAB = [[0.015, 'wood'], [0.07, 'screed'], [0.03, 'rigid'], [0.25, 'concrete'], [0.01]];
export const SLAB_T = SLAB.reduce((t, [w]) => t + w, 0);   // 0.375 m

// What each layer is drawn as. `buildUp` is the wall's layers from the room side, used
// where the wall is cut; it is scaled to the wall's real thickness. `thick` names the axis
// the layers run across, where it is not the wall's thin horizontal side.
export const LAYERS = {
  'Floor': { mat: 'floor', tier: 0, thick: 1, buildUp: SLAB },
  // 0007 note 1: the window wall is blocks too, painted. 0009 note 8: outside the insulation
  // a facing brick leaf, the facade. 10 skim, 150 block, 120 insulation, 20 air, 120 brick;
  // all but the block are guesses.
  'Window wall': { mat: 'block', tier: 0, buildUp: [[0.01], [0.15, 'block'], [0.12, 'insulation'], [0.02], [0.12, 'brick']] },
  'Block wall': { mat: 'block', tier: 0, buildUp: [[0.01], [0.08, 'block'], [0.01]] },
  'Column': { mat: 'concrete', tier: 0, buildUp: [[1, 'concrete']] },
  // 0013: in front of the column. The same material as the window wall it carries on from
  // (whose brick leaf is part of the one 'Window wall' solid); its room face is hidden.
  'Facade brick': { mat: 'block', tier: 0, buildUp: [[1, 'brick']], noFace: true },
  'Window frame': { mat: 'white' },
  'Window sash': { mat: 'white' },
  'Window glass': { mat: 'glass', glass: true },
  'Window handle': { mat: 'metal', tier: 2 },
  'Window stay': { mat: 'white', tier: 3 },
  'Window stay steel': { mat: 'metal', tier: 3 },
  'Blind': { mat: 'blind', tier: 3 },
};

// The facade brick's thickness: its share of the window wall's build-up, scaled to the wall.
const WW = LAYERS['Window wall'].buildUp;
export const brickT = (p) => WW.at(-1)[0] * p.wallT / WW.reduce((s, [w]) => s + w, 0);

// Derived positions, shared by build(), decorate() and the scene.
export function frame(p) {
  const xo = X_IN - p.wallT, z0 = Z_IN + p.pier, z1 = z0 + p.winW, zE = z1 + p.pier;
  const yF = p.board, yT = Math.min(p.board + p.winH, p.wallH - 0.05);
  // 0009: the window frame keeps its place from the room side (120 mm reveal, as before),
  // so a thicker wall grows outwards.
  const xf1 = X_IN - 0.12;
  return { xo, z0, z1, zE, zEnd: zE + p.blockT, yF, yT, yM: p.board, xf0: xf1 - 0.07, xf1 };
}

const on = (layer, ...meshes) => meshes.map((m) => (m.userData.layer = layer, m));

export function build(p) {
  const f = frame(p), { xo, z0, z1, zE, zEnd, yF, yT, yM, xf0, xf1 } = f, parts = [];
  // Walls. The window wall runs from the block wall to the far side wall's outer face.
  // 0008 note 5: one solid with the window cut out, not four boxes, so no joint lines show
  // where the pieces met. It goes to Rhino as one extrusion with a hole.
  // 0010: the column in the corner of the window wall and the back wall is structural. It
  // runs through the full thickness of both walls to the building's outside corner
  // (Desk input/column correction.png), and the walls, insulation and facade brick stop
  // against it. Inside the room it stands colW and colD proud of the walls. No column: the
  // back wall runs through the corner, as before.
  // 0013: the facade brick runs on in front of the column to the outside corner, and the
  // column stops at the back of the brick, so no concrete shows outside. The seam where the
  // brick in front of the column meets the window wall's own brick is not drawn.
  const col = p.colW > 0 && p.colD > 0, zW = col ? Z_IN + p.colD : Z_IN, xB = col ? X_IN + p.colW : xo;
  const xBrick = xo + brickT(p);
  const wall = windowWall(xo, f, p, zW);
  parts.push(...on('Window wall', wall));
  if (col) {
    wall.userData.seams = [[2, zW, 0, xo]];
    const brick = span(xo, xBrick, 0, p.wallH, Z_IN - p.blockT, zW);
    brick.userData.seams = [[2, zW]];
    parts.push(...on('Facade brick', brick));
  }
  parts.push(...on('Block wall',
    span(xB, p.roomD, 0, p.wallH, Z_IN - p.blockT, Z_IN),   // behind the desk
    span(X_IN, p.roomD, 0, p.sideCut, zE, zEnd),            // far side wall, cut low so the room shows
  ));
  if (col) parts.push(...on('Column', span(xBrick, xB, 0, p.wallH, Z_IN - p.blockT, zW)));
  parts.push(...on('Floor', span(xo, p.roomD, -SLAB_T, 0, Z_IN - p.blockT, zEnd)));
  // 0007 note 2: no window board. The sill is the top of the block wall under the window.
  // Fixed frame: a perimeter and a mullion between each pair of sashes.
  const fw = p.frameW, sw = p.sashW, n = Math.round(p.sashes), cw = (p.winW - fw * (n + 1)) / n;
  parts.push(...on('Window frame',
    span(xf0, xf1, yF, yF + fw, z0, z1), span(xf0, xf1, yT - fw, yT, z0, z1),
    span(xf0, xf1, yF + fw, yT - fw, z0, z0 + fw), span(xf0, xf1, yF + fw, yT - fw, z1 - fw, z1),
    ...Array.from({ length: n - 1 }, (_, i) => { const z = z0 + fw + (i + 1) * (cw + fw); return span(xf0, xf1, yF + fw, yT - fw, z - fw, z); }),
  ));
  // Sashes: four rails each, 12 mm proud of the frame on the room side, glass in the middle.
  const xs0 = xf0 + 0.01, xs1 = xf1 + 0.012, ya = yF + fw, yb = yT - fw;
  for (let i = 0; i < n; i++) {
    const za = z0 + fw + i * (cw + fw), zb = za + cw;
    parts.push(...on('Window sash',
      span(xs0, xs1, ya, ya + sw, za, zb), span(xs0, xs1, yb - sw, yb, za, zb),
      span(xs0, xs1, ya + sw, yb - sw, za, za + sw), span(xs0, xs1, ya + sw, yb - sw, zb - sw, zb),
    ));
    const gx = (xs0 + xs1) / 2;
    parts.push(...on('Window glass', span(gx - 0.002, gx + 0.002, ya + sw - 0.015, yb - sw + 0.015, za + sw - 0.015, zb - sw + 0.015)));
    // Handles on the far stile of every sash but the last, closed, lever down.
    if (i < n - 1) parts.push(...on('Window handle', ...handle(xs1, yF + p.handleY, zb - sw / 2)));
  }
  parts.push(...windowStay(xf1, z0 + fw / 2, yF, yT));
  if (p.blind > 0) parts.push(...blind(f, p));
  return group(...parts);
}

// The window wall in elevation, pushed through its thickness along x. Outline coordinates
// are (u, v) = (-z, y): that way round the extrusion runs along +x into the room.
function windowWall(xo, f, p, zW = Z_IN) {
  const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const outer = rect(-f.zEnd, -zW, 0, p.wallH), hole = rect(-f.z1, -f.z0, f.yM, f.yT);
  const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v)));
  shape.holes.push(new THREE.Path(hole.map(([u, v]) => new THREE.Vector2(u, v))));
  const mesh = at(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: p.wallT, bevelEnabled: false })), xo, 0, 0);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
  mesh.userData.nurbs = { type: 'extrusion', outer, holes: [hole], depth: p.wallT };
  mesh.userData.holes = [[f.z0, f.z1, f.yM, f.yT]];   // in (z, y), for the block texture
  return mesh;
}

// A window handle as in IMG_8447: a rose on the sash, a short neck straight out, and a
// round lever bent down. x is the room face of the sash.
function handle(x, y, z) {
  const neck = cylinder(0.009, 0.009, 0.04, x + 0.032, y + 0.012, z, 14);
  neck.rotation.z = Math.PI / 2;
  return [
    box(0.012, 0.075, 0.03, x + 0.006, y, z),                       // rose, 30 x 75 mm
    neck,
    sphere(0.0095, x + 0.052, y + 0.012, z),                         // the bend
    cylinder(0.0095, 0.0095, 0.13, x + 0.052, y + 0.012 - 0.065, z, 14),   // the lever
  ];
}

// The window stay from IMG_8448: a white rod on the frame beside the first sash, with a
// telescopic steel middle and a bracket screwed to the frame. x is the frame's room face.
function windowStay(x, z, y0, yT) {
  const rx = x + 0.013, tube = (r, a, b) => cylinder(r, r, b - a, rx, (a + b) / 2, z, 16);
  return [
    ...on('Window stay',
      tube(0.011, y0 + 0.015, y0 + 0.135),    // lower end cap
      tube(0.011, y0 + 0.315, y0 + 0.445),    // upper sleeve
      tube(0.008, y0 + 0.445, yT - 0.05),     // rod up to the top hinge
      box(0.016, 0.06, 0.026, x + 0.008, y0 + 0.2, z - 0.016),   // bracket on the frame
    ),
    ...on('Window stay steel',
      tube(0.006, y0 + 0.135, y0 + 0.315),    // steel middle
      box(0.012, 0.02, 0.012, x + 0.006, yT - 0.05, z),          // top hinge
    ),
  ];
}

// The external venetian blind: 70 mm tilted slats in the reveal outside the frame, in
// guide rails at both reveals, let down a fraction of the window. Cords are curves.
function blind(f, p) {
  const { xo, xf0, z0, z1, yF, yT } = f, half = Math.min(0.035, (xf0 - xo) / 2 - 0.002), xc = xf0 - half - 0.01;   // just outside the frame
  const bottom = yT - (yT - yF) * p.blind, za = z0 + 0.024, zb = z1 - 0.024, parts = [];
  const tilt = -THREE.MathUtils.degToRad(p.slat ?? 31.5);
  for (let y = yT - 0.03; y > bottom + 0.04; y -= 0.07) parts.push(box(half * 2, 0.002, zb - za, xc, y, (za + zb) / 2, tilt));
  parts.push(span(xc - 0.03, xc + 0.03, bottom, bottom + 0.012, za, zb));   // bottom rail
  for (const z of [z0 + 0.002, z1 - 0.022]) parts.push(span(xc - 0.012, xc + 0.012, yF, yT, z, z + 0.02));   // guide rails
  const cords = [];
  for (const t of [0.17, 0.5, 0.83]) for (const dx of [-0.028, 0.028]) {
    const z = za + (zb - za) * t;
    cords.push([xc + dx, yT, z, xc + dx, bottom, z]);
  }
  return on('Blind', ...parts, lines(cords));
}

// Styles a shell, built here or read from a .3dm: tones and tiers by layer, the cut wall
// faces in section, and the textures. Works from bounding boxes, so it suits boxes; a part
// reshaped in Rhino keeps its tone, and its cut is drawn over its bounding box.
export function decorate(root, p) {
  const f = frame(p), deco = [];
  const planes = [[1, p.wallH], [1, p.sideCut], [0, p.roomD], [2, f.zEnd]];
  const centre = new THREE.Vector3((X_IN + p.roomD) / 2, 1, (Z_IN + f.zE) / 2);
  const rects = planes.map(() => []);
  let seed = 21;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const L = LAYERS[o.userData.layer];
    if (!L || !(o.isMesh || o.userData.segs)) return;
    o.userData.mat = L.mat;
    if (L.tier !== undefined) o.userData.tier = L.tier;
    if (!o.isMesh) return;
    if (L.glass) { o.userData.noShadow = true; o.userData.see = true; }   // light and the eye pass through
    const bb = new THREE.Box3().setFromObject(o), lo = bb.min.toArray(), hi = bb.max.toArray();
    if (L.buildUp) {
      o.userData.cuts = [...(o.userData.seams ?? [])];
      planes.forEach(([axis, v], k) => {
        if (Math.abs(hi[axis] - v) > 1e-3) return;
        o.userData.cuts.push([axis, hi[axis]]);
        const [ua, wa] = [0, 1, 2].filter((x) => x !== axis);
        rects[k].push([lo[ua], hi[ua], lo[wa], hi[wa]]);
        // Thickness runs across the wall: the shorter horizontal side on a top cut, the
        // horizontal side on an upright cut. It is measured from the room side.
        const ta = L.thick ?? (axis === 1 ? (hi[0] - lo[0] < hi[2] - lo[2] ? 0 : 2) : (ua === 1 ? wa : ua)), sa = [ua, wa].find((x) => x !== ta);
        const roomAtMax = centre.getComponent(ta) > (lo[ta] + hi[ta]) / 2, thick = hi[ta] - lo[ta];
        const total = L.buildUp.reduce((s, [w]) => s + w, 0), layers = L.buildUp.map(([w, pat]) => [w * thick / total, pat]);
        const at = (s, t) => { const q = [0, 0, 0]; q[axis] = v + 0.001; q[sa] = s; q[ta] = roomAtMax ? hi[ta] - t : lo[ta] + t; return q; };
        // 0009 note 10: the joints in the cut carry on from the coursing on the face.
        const row = Math.floor((v - 1e-6) / COURSE), grid = sa === 1 ? { step: COURSE, off: 0, m: 0.005 } : { step: BLOCK_W, off: (row % 2) * BLOCK_W / 2, m: 0.005 };
        deco.push(cutWall(at, lo[sa], hi[sa], layers, seed++, grid));
      });
    }
    if (L.mat === 'block' && !L.noFace) {   // ribbed blocks on the room face, if it can be seen
      const ta = hi[0] - lo[0] < hi[2] - lo[2] ? 0 : 2, sa = 2 - ta;
      const roomAtMax = centre.getComponent(ta) > (lo[ta] + hi[ta]) / 2, face = roomAtMax ? hi[ta] + 0.0015 : lo[ta] - 0.0015;
      const n = [0, 0, 0]; n[ta] = roomAtMax ? 1 : -1;
      if (new THREE.Vector3(...n).dot(VIEW_DIR) > 0) {
        const s0 = Math.max(lo[sa], ta === 2 ? X_IN : Z_IN), s1 = Math.min(hi[sa], ta === 2 ? p.roomD : f.zE);
        // Round a window opening: the four pieces of wall face round it.
        const h = o.userData.holes?.[0], y0 = lo[1], y1 = hi[1];
        const rects = h ? [[s0, s1, y0, h[2]], [s0, s1, h[3], y1], [s0, h[0], h[2], h[3]], [h[1], s1, h[2], h[3]]] : [[s0, s1, y0, y1]];
        for (const [a, b, c, d] of rects) if (b > a && d > c) {
          deco.push(blockTexture((s, y) => { const q = [0, y, 0]; q[sa] = s; q[ta] = face; return q; }, a, b, c, d, seed++));
        }
      }
    }
    if (o.userData.layer === 'Column') deco.push(stippleFaces(o, 2600, seed++));
    if (L.glass) {   // three short strokes: the drawing convention for glass
      const gx = hi[0] + 0.001, c = (lo[2] + hi[2]) / 2, m = (lo[1] + hi[1]) / 2;
      deco.push(lines([[gx, m + 0.08, c - 0.14, gx, m + 0.3, c + 0.02], [gx, m + 0.02, c - 0.08, gx, m + 0.3, c + 0.12], [gx, m - 0.25, c - 0.02, gx, m - 0.14, c + 0.08]]));
    }
  });
  // The one heavy line: round the outside of all the cuts in each plane.
  planes.forEach(([axis, v], k) => {
    if (!rects[k].length) return;
    const [ua, wa] = [0, 1, 2].filter((x) => x !== axis);
    const segs = unionOutline(rects[k]).map(([u0, w0, u1, w1]) => {
      const p0 = [0, 0, 0], p1 = [0, 0, 0];
      p0[axis] = p1[axis] = v + 0.001;
      p0[ua] = u0; p0[wa] = w0; p1[ua] = u1; p1[wa] = w1;
      return [...p0, ...p1];
    });
    deco.push(lines(segs, 4));
  });
  deco.push(floorboards(X_IN, p.roomD, Z_IN, f.zE, 0.0008, 14));
  return group(...deco);
}

// Never drawn, but they keep the sun out: a ceiling, and the far side wall at full height
// (in the drawing it is cut away low so the room shows).
export function sunBlockers(p) {
  const f = frame(p);
  const ceiling = span(f.xo - 0.3, p.roomD + 0.6, p.wallH + 0.002, p.wallH + 0.022, Z_IN - p.blockT - 0.3, f.zEnd + 0.3);
  const side = span(X_IN, p.roomD + 0.6, 0.005, p.wallH, f.zE, f.zEnd);
  for (const m of [ceiling, side]) { m.material = SHADOW_ONLY; m.castShadow = true; m.userData.plain = true; }
  return group(ceiling, side);
}

// The box the sun's shadow map has to cover.
export function bounds(p) {
  const f = frame(p);
  return new THREE.Box3(new THREE.Vector3(f.xo - 0.1, -SLAB_T - 0.05, Z_IN - p.blockT - 0.1), new THREE.Vector3(p.roomD + 0.05, p.wallH + 0.1, f.zEnd + 0.1));
}
