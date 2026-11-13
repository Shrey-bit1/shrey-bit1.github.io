// 0008: the furniture and plants as bench objects. Moved from index.html, where they were
// drawn in place, and given sliders for their main sizes and shape.
// 0009: rebuilt from your notes and the photos in Desk input/References: the desk chair's
// one-piece shell, the POÄNG's flat bent birch frame, real pots (a wall, soil below the
// rim), peace lily leaves of every age, the dracaena's wavy trunks and filled leaves, and the
// money plant's three pots with vines that have thickness.
//
// Each entry has `params` (the bench's sliders, with x, z and turn first) and
// `build(s, ctx)`, which makes the object in its own frame: metres, y up, standing on
// y = 0 at its origin. objects/index.js places it at (x, y, z) and turns it. `ctx.shell`
// and `ctx.cabinet` hold the room shell's and the cabinet's settings.
//
// Every part sits on a named layer, so the bench writes it to Rhino one layer per part.
// Boxes, cylinders, pots (solids of revolution), spheres and the POÄNG's frames (extrusions)
// go as NURBS; tubes, leaves, the chair shell and the cushions go as meshes (rhino3dm.js
// cannot sweep or loft).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { as, at, box, span, cylinder, group, tier, hot, lines, poly, circle, ring, curve, V, Y,
  random, shadowTube, juteWeave, texture } from '../lib/draw.js';
import { readObj } from '../lib/models.js';
import * as shell from './room-shell.js';

const on = (layer, o) => (o.userData.layer = layer, o);
const P = (key, label, value, min, max, step, unit) => ({ key, label, value, min, max, step, unit });
const place = (x, z, rot = 0, y = null) => [
  P('x', 'Position x (out from the window wall)', x, -1, 2.2, 0.005),
  P('z', 'Position z (along the window wall)', z, -0.6, 2.4, 0.005),
  P('rot', 'Turn', rot, -180, 180, 1, '°'),
  ...(y === null ? [] : [P('y', 'Height it stands at', y, 0, 2.5, 0.005)]),
];
const lerp = THREE.MathUtils.lerp, rad = THREE.MathUtils.degToRad;
const vec = (a) => (a.isVector3 ? a.clone() : V(a));
const tube = (pts, r, n = 6) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(p))), pts.length * 2, r, n));

// Boxes a plant keeps out of, so no leaf passes through glass, a monitor or a wall. They are
// given in the room's frame and moved into the plant's.
// ponytail: only moved, not turned: with the plant turned, the boxes no longer line up.
const Box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(V([x0, y0, z0]), V([x1, y1, z1]));
const toLocal = (boxes, s) => boxes.map((b) => b.clone().translate(V([-s.x, -(s.y ?? 0), -s.z])));
const clear = (mesh, avoid) => {
  mesh.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mesh, true);
  return !avoid.some((a) => a.intersectsBox(b));
};

// ---- Leaves ----------------------------------------------------------------------------------

// A leaf as a grid of quads, `rows` along it and `cols` across, in its own frame: the stalk
// joins at the origin, the tip is along +y, the face looks along +z. `width(t)` is the half
// width at t (0 at the stalk, 1 at the tip), as a share of the length. 0009 (pothos note 8):
// `fold` lifts both halves into a V along the midrib (radians) and `bend` lets the tip fall
// back behind the face, as a share of the length. `notch` pulls the base's edges below the
// stalk, for a heart. The midrib and `veins` pairs of side veins are drawn on it.
function blade(len, width, { fold = 0.15, bend = 0.2, notch = 0, veins = 0, rows = 10, cols = 4 } = {}) {
  const pos = [], index = [], k = (i, j) => i * (cols + 1) + j;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, w = width(t) * len;
    for (let j = 0; j <= cols; j++) {
      const u = j / cols * 2 - 1, x = u * w;
      pos.push(x, t * len - notch * len * Math.abs(u) * (1 - t) ** 2, Math.abs(x) * Math.tan(fold) - bend * len * t * t);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) index.push(k(i, j), k(i, j + 1), k(i + 1, j), k(i, j + 1), k(i + 1, j + 1), k(i + 1, j));
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const mesh = tier(3, new THREE.Mesh(geo));
  mesh.userData.sheet = true;
  mesh.userData.nurbs = { type: 'grid', u: cols + 1 };   // 0013: a NURBS surface in Rhino
  const at = (i, j) => [pos[k(i, j) * 3], pos[k(i, j) * 3 + 1], pos[k(i, j) * 3 + 2] + 0.0006];
  const c = cols / 2, segs = [];
  for (let i = 0; i < rows - 1; i++) segs.push([...at(i, c), ...at(i + 1, c)]);   // midrib, short of the tip
  for (let v = 1; v <= veins; v++) {
    const i = Math.round(v * rows / (veins + 1.6));
    for (const j of [1, cols - 1]) segs.push(...poly([at(i, c), at(i + 1, (j + c) / 2), at(Math.min(i + 3, rows - 1), j)]));
  }
  return mesh.add(lines(segs)), mesh;
}
// Places a leaf: its stalk end at p, its tip along `along`, its face towards `face`.
function orient(mesh, p, along, face) {
  const y = vec(along).normalize();
  let z = vec(face).projectOnPlane(y);
  if (z.lengthSq() < 1e-6) z = V([0, 1, 0.3]).projectOnPlane(y);
  z.normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(y.clone().cross(z), y, z));
  mesh.position.set(...p);
  return mesh;
}
const LILY = (t) => 0.2 * Math.sin(Math.PI * t ** 0.65) ** 0.7;                  // a rounded base, a pointed tip
const HEART = (t) => 0.37 * Math.sin(Math.PI * (0.16 + 0.84 * t) ** 1.15) ** 0.8;  // the pothos

// A peace lily (Spathiphyllum), from IMG_8472-8476 (0009 desk-plant note 1): leaves of
// every age come out of the soil. The young ones are small and stand up in the middle; the
// old ones are large, lean out and droop at the tip, some below the rim. `height` is how high
// the stalks rise, `spread` how far the oldest reach out, `leafLen` a grown blade. A leaf that
// would hit anything in `avoid` is drawn again elsewhere.
// 0010: the stalks are tubes `stemR` thick (a little thinner on young leaves), and `sprouts` young
// leaves come straight up out of the soil at the base: short stalks, small blades still
// half rolled, so the leaf sizes run from a few centimetres to a grown leaf.
function lily({ height, spread, leafLen, n, seed, avoid = [], stemR = 0.0025, sprouts = 0 }) {
  const rnd = random(seed), parts = [];
  const stem = (pts, r) => [on('Stems', tier(3, tube(pts, r, 6)))];
  for (let i = 0, tries = 0; i < n && tries < n * 40; tries++) {
    const age = n > 1 ? i / (n - 1) : 1;   // one leaf of each age, young to old
    const a = tries * 2.4 + rnd() * 0.8, out = V([Math.cos(a), 0, Math.sin(a)]);
    const reach = spread * (0.2 + 0.8 * age) * (0.8 + rnd() * 0.4), rise = height * (0.45 + rnd() * 0.55) * (1 - 0.25 * age);
    const base = out.clone().multiplyScalar(0.012);
    const tip = base.clone().addScaledVector(out, reach).add(V([0, rise, 0]));
    const stalk = curve([base.toArray(), base.clone().addScaledVector(out, reach * 0.2).add(V([0, rise * 0.65, 0])).toArray(), tip.toArray()], 10);
    const e = rad(72 - 85 * age + (rnd() - 0.5) * 30);   // the blade's slope: up when young, down when old
    const along = out.clone().multiplyScalar(Math.cos(e)).add(V([0, Math.sin(e), 0]));
    const face = out.clone().multiplyScalar(-Math.sin(e)).add(V([0, Math.cos(e), 0])).applyAxisAngle(along, (rnd() - 0.5) * 0.8);
    const len = leafLen * (0.6 + 0.5 * age) * (0.85 + rnd() * 0.3), wk = 0.9 + rnd() * 0.25;
    const leaf = orient(blade(len, (t) => LILY(t) * wk, { fold: 0.18, bend: 0.08 + 0.3 * age }), tip.toArray(), along, face);
    if (!clear(leaf, avoid)) continue;
    parts.push(...stem(stalk, stemR * (0.8 + 0.3 * age)), on('Leaves', leaf));
    i++;
  }
  // The new leaves at the base: 20-45% of a grown blade, on stalks 20-80 mm out of the soil.
  for (let i = 0, tries = 0; i < sprouts && tries < sprouts * 40; tries++) {
    const a = tries * 2.4 + 1.2 + rnd() * 0.8, out = V([Math.cos(a), 0, Math.sin(a)]);
    const base = out.clone().multiplyScalar(0.006 + rnd() * 0.014), rise = 0.02 + rnd() * 0.06;
    const tip = base.clone().addScaledVector(out, 0.004 + rnd() * 0.01).add(V([0, rise, 0]));
    const stalk = curve([base.toArray(), base.clone().lerp(tip, 0.5).add(V([0, 0.002, 0])).toArray(), tip.toArray()], 6);
    const e = rad(70 + rnd() * 18), along = out.clone().multiplyScalar(Math.cos(e)).add(V([0, Math.sin(e), 0]));
    const face = out.clone().multiplyScalar(-Math.sin(e)).add(V([0, Math.cos(e), 0])).applyAxisAngle(along, rnd() * 6.28);
    const len = leafLen * (0.2 + rnd() * 0.25);
    const leaf = orient(blade(len, (t) => LILY(t) * 0.7, { fold: 0.7 + rnd() * 0.3, bend: 0.03, rows: 8, cols: 4 }), tip.toArray(), along, face);
    if (!clear(leaf, avoid)) continue;
    parts.push(...stem(stalk, stemR * 0.6), on('Leaves', leaf));
    i++;
  }
  return as('leaf', group(...parts));
}

// ---- Pots ------------------------------------------------------------------------------------

// A pot turned from its profile [[r, y], ...]: from the axis at the foot, out and up the
// outside, over the rim and down the inside to the axis on its floor. One NURBS solid of
// revolution in Rhino.
function turned(profile, mat, layer = 'Pot') {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 40));
  mesh.userData.nurbs = { type: 'rev', profile };
  return as(mat, on(layer, tier(2, mesh)));
}
// Soil at height y, filling the pot to radius r.
const soil = (r, y) => as('soil', on('Soil', tier(3, cylinder(r, r, 0.004, 0, y - 0.002, 0, 40))));
// A plain tapered pot: rim radius r, foot f, height h, wall thickness.
const plainPot = (r, f, h, wall) => [[0, 0], [f, 0], [r, h], [r - wall, h], [f - wall, wall], [0, wall]];
// Where the inside of a plain pot is at height y.
const innerAt = (r, f, h, wall, y) => f - wall + (r - f) * (y - wall) / (h - wall);
// 0009 desk-plant note 2: a terracotta flowerpot as in IMG_8476, with a collar the top 28%
// of the height, standing 8 mm proud of the body.
const flowerpot = (r, f, h, wall) => {
  const c = h * 0.28, b = r - 0.008;
  return [[0, 0], [f, 0], [b, h - c], [r, h - c + 0.004], [r, h], [r - wall, h], [f - wall + 0.002, wall], [0, wall]];
};
// 0009 dracaena note 7: the dracaena's pot (IMG_8460, 8461): nearly straight, a rounded foot.
const roundPot = (r, f, h, wall, fillet = 0.035) => [[0, 0],
  ...Array.from({ length: 6 }, (_, k) => { const q = k / 5 * Math.PI / 2; return [f - fillet + fillet * Math.sin(q), fillet - fillet * Math.cos(q)]; }),
  [r, h], [r - wall, h], [f - wall, fillet], [f - fillet, wall], [0, wall]];
// Clay pebbles on the soil (IMG_8461): small rings, about one per 13 mm square.
function pebbles(r, y, seed) {
  const rnd = random(seed), segs = [];
  for (let i = 0; i < r * r * Math.PI / 0.00017; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (r - 0.007), x = Math.cos(a) * d, z = Math.sin(a) * d;
    segs.push(...circle(0.004 + rnd() * 0.002, 8, (p, q) => [x + p, y + 0.003, z + q]));
  }
  return texture('pebbles', lines(segs));
}

// The desk plant: the terracotta pot, soil `drop` below its rim, and the lily in it.
const deskPlant = (s, avoid, seed) => {
  const r = s.potR, f = r * s.taper, h = s.potH, wall = 0.007, y = h - 0.05, sit = s.saucer ? 0.012 : 0;   // note 3: soil 50 mm down
  return group(
    ...(s.saucer ? [as('terracotta', on('Saucer', tier(2, cylinder(s.saucer, s.saucer - 0.01, 0.012, 0, 0.006, 0))))] : []),
    at(group(turned(flowerpot(r, f, h, wall), 'terracotta'), soil(innerAt(r, f, h, wall, y), y),
      at(lily({ height: s.height, spread: s.spread, leafLen: s.leafLen, n: s.leaves, seed, sprouts: s.sprouts, stemR: s.stemR,
        avoid: avoid.map((b) => b.clone().translate(V([0, -sit - y, 0]))) }), 0, y, 0)), 0, sit, 0),
  );
};
const plantParams = (plant) => [
  P('height', 'How high the stalks rise above the soil', plant[0], 0.05, 0.8, 0.005),
  P('spread', 'How far the oldest stalks reach out', plant[1], 0.03, 0.4, 0.005),
  P('leafLen', 'Leaf length, grown leaves (young ones are smaller)', plant[2], 0.04, 0.4, 0.005),
  P('leaves', 'Number of leaves', plant[3], 3, 50, 1),
  // 0010
  P('sprouts', 'Young leaves sprouting at the base', plant[4], 0, 12, 1),
  P('stemR', 'Stalk thickness (radius, grown leaves)', plant[5], 0.001, 0.006, 0.0005),
];

// ---- The dracaena ----------------------------------------------------------------------------

// A dracaena leaf: a long thin strap that rises from the trunk and droops at the end, with
// a shallow channel along its middle. 0009 note 5: a filled surface, no longer bare lines.
function strap(base, dir, len, width, droop) {
  const d = V(dir).normalize(), s = d.clone().cross(Y);
  if (s.lengthSq() < 1e-6) s.set(1, 0, 0);
  s.normalize();
  const up = s.clone().cross(d).normalize(), pos = [], index = [], mid = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, w = width / 2 * Math.min(1, t * 6) * (1 - t) ** 0.6;
    const p = V(base).addScaledVector(d, len * t).add(V([0, -droop * len * t * t, 0]));
    mid.push(p.toArray());
    pos.push(...p.clone().addScaledVector(s, w).toArray(), ...p.clone().addScaledVector(up, -w * 0.25).toArray(), ...p.clone().addScaledVector(s, -w).toArray());
  }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j;
    index.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const mesh = on('Leaves', tier(3, new THREE.Mesh(geo)));
  mesh.userData.sheet = true;
  mesh.userData.nurbs = { type: 'grid', u: 3 };
  return mesh;
}

// The tall dracaena by the far pier, from IMG_8460-8463. 0009 notes 6 and 8: its trunks are
// thin and wavy, bending several times on the way up (two in the photos; a third with the
// slider), and the leaves of each crown leave the top 140 mm of the trunk one above the next
// in a spiral: the lowest, oldest ones droop, the top ones point up. Its leaves stay off the
// window wall and the side wall. Origin: the middle of the pot's foot.
function dracaena(s, ctx) {
  const rnd = random(53), parts = [], F = shell.frame(ctx.shell);
  const keep = toLocal([Box(shell.X_IN + 0.03, 0, -0.4, 3, 3, F.zE - 0.08)], s)[0];
  const r = s.potR, f = r * s.taper, h = s.potH, top = h - 0.04, scars = [];
  parts.push(turned(roundPot(r, f, h, 0.01), 'ceramic'),
    on('Pot', lines(ring(r - 0.022, 0, h - 0.012, 0))),   // the rim of the plastic pot inside
    soil(r - 0.024, top), pebbles(r - 0.024, top, 7));
  // Where each crown tops out, as drawn since 0005; the heights are sliders.
  const crowns = [[0.1, s.c1, -0.1], [0.2, s.c2, -0.24], [0.18, s.c3, 0.08]].slice(0, Math.round(s.trunks));
  crowns.forEach(([cx, cy, cz], k) => {
    const start = V([cx * 0.12, top - 0.02, cz * 0.12]), end = V([cx, cy - 0.14, cz]);
    const side = V([start.z - end.z, 0, end.x - start.x]).normalize(), out = V([end.x - start.x, 0, end.z - start.z]).normalize();
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, env = Math.sin(t * Math.PI);
      pts.push(start.clone().lerp(end, t).addScaledVector(side, Math.sin(t * Math.PI * (3 + k) + k * 1.3) * 0.045 * env).addScaledVector(out, 0.05 * env).toArray());
    }
    pts.push([cx, cy, cz]);
    parts.push(on('Trunks', tier(2, tube(curve(pts, 40), s.trunkR, 12))));
    // Leaf scars: a ring round the trunk every 45 mm or so.
    const path = new THREE.CatmullRomCurve3(pts.map((p) => V(p)));
    for (let t = 0.03; t < 0.97; t += 0.045 / path.getLength() * (0.6 + rnd() * 0.8)) {
      const p = path.getPointAt(t), d = path.getTangentAt(t), u = d.clone().cross(Y).normalize(), w = d.clone().cross(u);
      scars.push(...circle(s.trunkR * 1.06, 10, (a, b) => p.clone().addScaledVector(u, a).addScaledVector(w, b).toArray()));
    }
    for (let i = 0; i < s.leaves; i++) {
      const hf = i / s.leaves, at = [cx, cy - 0.14 * (1 - hf), cz];   // up the top of the trunk
      const a = i * 2.4 + k, e = rad(-50 + 125 * hf + (rnd() - 0.5) * 30);
      let dir = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
      const len = s.leafLen * (0.73 + rnd() * 0.54);
      if (!keep.containsPoint(V(at).addScaledVector(V(dir).normalize(), len))) dir = [-dir[0], dir[1], -dir[2]];   // back from the glass and the wall
      parts.push(strap(at, dir, len, s.leafW, 0.2 + 0.4 * (1 - hf) + rnd() * 0.2));
    }
  });
  return as('leaf', group(...parts, on('Trunks', texture('bark', lines(scars)))));
}

// ---- The money plant (pothos) ----------------------------------------------------------------

// One vine through control points `pts`, in the pot's frame. 0009 pothos notes 4, 5, 8 and
// 11: the vine is a tube 4.4 mm thick; a node every 1/density metres carries a leaf on a
// curved stalk that ends exactly where the leaf starts; the leaves bend and fold. Leaves
// face away from the cabinet where the vine hangs and up where it lies on top, and get
// smaller towards the end.
function vine(pts, hang, seed, avoid, s) {
  const rnd = random(seed), path = curve(pts, pts.length * 12);
  const parts = [on('Stems', tier(3, tube(path, 0.0022)))], up = V([0, 1, 0]);
  let length = 0;
  for (let i = 1; i < path.length; i++) length += V(path[i]).distanceTo(V(path[i - 1]));
  for (let i = 1, d = 0, run = 0, n = 0; i < path.length - 1; i++) {
    const step = V(path[i]).distanceTo(V(path[i - 1]));
    d += step; run += step;
    if (run < (1 / s.density) * (0.8 + rnd() * 0.4) || d < 0.03) continue;
    run = 0;
    const p = V(path[i]), along = V(path[i + 1]).sub(p).normalize(), lying = p.y > -0.004 || p.y < s.floor + 0.03;
    const face = lying ? up : V(hang);
    const side = face.clone().cross(along);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(n++ % 2 ? 1 : -1);
    // 0014 note 12: each leaf a random size, and smaller towards the vine's end: about 100 mm
    // near the pot, `tipK` of that at the end, each up to `leafVar` bigger or smaller.
    const len = s.leafK * 0.0975 * lerp(1, s.tipK, d / length) * (1 + (rnd() - 0.5) * 2 * s.leafVar);
    const end = p.clone().addScaledVector(side, 0.018 + rnd() * 0.012).addScaledVector(face, 0.02);
    const mid = p.clone().addScaledVector(side, 0.004).addScaledVector(face, 0.016).add(V([0, 0.006, 0]));
    // Each leaf turns its own way: a hanging one points its tip down, out and to its side by
    // different amounts, and rolls a little about its length.
    const tip = lying ? along.clone().multiplyScalar(0.3 + rnd() * 0.5).addScaledVector(side, 0.8)
      : side.clone().multiplyScalar(0.25 + rnd() * 0.6).addScaledVector(face, 0.1 + rnd() * 0.5).add(V([0, -(0.5 + rnd() * 0.7), 0]));
    const look = face.clone().add(V([0, lying ? 0 : 0.4, 0])).applyAxisAngle(tip.clone().normalize(), (rnd() - 0.5) * 1.2);
    // Lying leaves barely bend; hanging ones curl their tips out, away from the cabinet.
    const leaf = orient(blade(len, HEART, { fold: 0.2, bend: lying ? 0.04 : -(0.1 + rnd() * 0.2), notch: 0.12, veins: 3, cols: 6, rows: 8 }),
      end.toArray(), tip, look);
    if (!clear(leaf, avoid)) continue;
    parts.push(on('Leaves', leaf), on('Stems', lines(poly(curve([p.toArray(), mid.toArray(), end.toArray()], 6)))));
  }
  return group(...parts);
}

// The money plant on top of the cabinet, from IMG_8439, 8440 and 8472. 0009 pothos notes 1,
// 2, 3, 6 and 9: three pots, the other two smaller than the first, soil below the rims, and
// vines that leave the soil, go over the rim clear of it, cross the cabinet top and hang down
// its front and right side, crossing each other. The front ones hang longer than before: the
// middle ones to just above the posters, the outer ones lower. Origin: the middle of the
// first pot's foot, on the cabinet top.
function pothos(s, ctx) {
  const c = ctx.cabinet;   // ponytail: the cabinet's turn is ignored; it stands square to the room
  const x0 = c.x - s.x, x1 = c.x + c.W - s.x, z0 = c.z - s.z, z1 = c.z + c.D - s.z, H = c.H;
  const clampX = (x, r) => Math.min(Math.max(x, x0 + r + 0.01), x1 - r - 0.01), clampZ = (z, r) => Math.min(Math.max(z, z0 + r + 0.01), z1 - r - 0.01);
  const pots = [[0, 0, 1], [-0.13, 0.17, s.pot2], [0.09, 0.3, s.pot3]].map(([x, z, k]) => {
    const r = s.potR * k;
    return { x: clampX(x, r), z: clampZ(z, r), r, h: s.potH * k };
  });
  const floor = -s.y + 0.012, opts = { ...s, floor };   // the floor, in this frame
  const avoid = [
    new THREE.Box3(V([x0, -H, z0]), V([x1, 0, z1])),                                             // the cabinet
    ...toLocal([Box(-2, 0, -2, 4, 3, shell.Z_IN), Box(-1, -1, -2, 4, 0.004, 3), Box(0.4, 0, -0.5, 0.75, 0.75, 0.45)], s),   // wall, floor, desk end
    ...pots.map((p) => new THREE.Box3(V([p.x - p.r, 0, p.z - p.r]), V([p.x + p.r, p.h + 0.002, p.z + p.r]))),
  ];
  const drop = (y) => Math.max(H - (H - y) * s.reach, 0.03) - s.y;   // a room height, scaled by `reach`, as a height in this frame
  const posterTop = c.posterY + 0.31;   // the top of the highest poster, from the cabinet
  const parts = [], rnd = random(61);
  pots.forEach((p) => parts.push(at(group(turned(plainPot(p.r, p.r * s.taper, p.h, 0.005), 'ceramic', 'Pots'),
    soil(innerAt(p.r, p.r * s.taper, p.h, 0.005, p.h - 0.015), p.h - 0.015)), p.x, 0, p.z)));   // note 2: soil 15 mm down
  // A vine from pot k to the edge point (ex, ez), out along `hang`, down to room height yEnd.
  const go = (k, ex, ez, hang, yEnd, seed) => {
    const p = pots[k], dir = V([ex - p.x, 0, ez - p.z]).normalize(), O = V([p.x, 0, p.z]);
    const pt = (r, y) => O.clone().addScaledVector(dir, r).add(V([0, y, 0])).toArray();
    const sideways = V(hang).cross(Y).normalize(), y = drop(yEnd), sway = (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.05);
    // Note 3: up out of the soil, over the rim 7 mm clear of it, down its outside to the top.
    const e = V([ex, 0, ez]), toEdge = e.distanceTo(O), pts = [pt(p.r * 0.3, p.h - 0.015), pt(p.r * 0.75, p.h + 0.014), pt(p.r + 0.008, p.h + 0.007), pt(p.r + 0.022, p.h * 0.4)];
    if (toEdge - 0.035 > p.r + 0.03) pts.push(pt(Math.min(p.r + 0.06, toEdge - 0.035), 0.004));
    pts.push(e.clone().addScaledVector(V(hang), -0.03).add(V([0, 0.004, 0])).toArray(), e.clone().addScaledVector(V(hang), 0.006).add(V([0, 0.002, 0])).toArray(),
      e.clone().addScaledVector(V(hang), 0.016).add(V([0, -0.035, 0])).toArray());
    const fall = -0.035 - y;
    for (let i = 1, n = Math.max(2, Math.round(fall / 0.25)); i <= n; i++) {
      const t = i / n;
      pts.push(e.clone().addScaledVector(V(hang), 0.016 + 0.012 * Math.sin(t * 5 + seed)).addScaledVector(sideways, sway * Math.sin(t * Math.PI * (1.2 + (seed % 3) * 0.4) + seed)).add(V([0, -0.035 - fall * t, 0])).toArray());
    }
    if (y + s.y < 0.06) {   // it reaches the floor: it lies there and runs on a little
      const last = V(pts.at(-1));
      pts.push(last.clone().addScaledVector(V(hang), 0.1).setY(floor).toArray(), last.clone().addScaledVector(V(hang), 0.22).addScaledVector(sideways, 0.06).setY(floor).toArray());
    }
    parts.push(vine(pts, hang, 31 + seed, avoid, opts));
  };
  // Down the front: [share along the width, room height it hangs to, pot]. The middle ones
  // stop just above the posters, so they stay readable.
  [[0.05, 0.35, 0], [0.22, posterTop + 0.04, 1], [0.4, posterTop + 0.08, 2], [0.58, posterTop + 0.03, 0], [0.76, posterTop + 0.07, 1], [0.95, 0.8, 2]]
    .slice(0, s.front).forEach(([u, y, k], i) => go(k, lerp(x0, x1, u), z1, [0, 0, 1], y, i));
  // Down the right side: [share along the depth, from the back].
  [[0.15, 1.2, 2], [0.5, 0.02, 1], [0.85, 1.45, 0]].slice(0, s.side).forEach(([u, y, k], i) => go(k, x1, lerp(z0, z1, u), [1, 0, 0], y, 10 + i));
  // One along the top towards the wall.
  const back = pots[0], dir = V([x0 + 0.04 - back.x, 0, z0 + 0.03 - back.z]).normalize();
  parts.push(vine([[back.x, back.h - 0.015, back.z], [back.x + dir.x * back.r * 0.8, back.h + 0.014, back.z + dir.z * back.r * 0.8],
    [back.x + dir.x * (back.r + 0.008), back.h + 0.007, back.z + dir.z * (back.r + 0.008)], [back.x + dir.x * (back.r + 0.03), 0.02, back.z + dir.z * (back.r + 0.03)],
    [x0 + 0.06, 0.004, z0 + 0.05], [x0 + 0.03, 0.004, z0 + 0.12]], [0, 1, 0], 77, avoid, opts));
  const root = as('leaf', group(...parts));
  root.traverse((o) => o.isMesh && o.userData.layer !== 'Pots' && o.userData.layer !== 'Soil' && (o.userData.seeThrough = true));   // clicks pass to the posters
  return root;
}

// ---- Furniture -------------------------------------------------------------------------------

// A closed shell lofted along a centreline `centre` (points in the (z, y) plane), `widths[i]`
// wide across x and `thick[i]` thick. Its faces are dished: the sides rise `dish[i]` towards
// the sitter. Used for the LÅNGFJÄLL seat and back, one piece.
function loft(centre, widths, thick, dish, cols = 14) {
  const n = centre.length, top = [], bottom = [];
  centre.forEach((p, i) => {
    const q = centre[Math.min(i + 1, n - 1)], r = centre[Math.max(i - 1, 0)];
    const tz = q.z - r.z, ty = q.y - r.y, l = Math.hypot(tz, ty), nz = ty / l, ny = -tz / l;   // the normal, towards the sitter
    for (let j = 0; j <= cols; j++) {
      const u = j / cols * 2 - 1, lift = dish[i] * u * u, x = u * widths[i] / 2;
      top.push(x, p.y + ny * (thick[i] / 2 + lift), p.z + nz * (thick[i] / 2 + lift));
      bottom.push(x, p.y + ny * (lift - thick[i] / 2), p.z + nz * (lift - thick[i] / 2));
    }
  });
  const m = cols + 1, B = n * m, index = [], k = (i, j) => i * m + j;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols; j++) {
    index.push(k(i, j), k(i, j + 1), k(i + 1, j), k(i, j + 1), k(i + 1, j + 1), k(i + 1, j));                 // top, facing the sitter
    index.push(B + k(i, j), B + k(i + 1, j), B + k(i, j + 1), B + k(i, j + 1), B + k(i + 1, j), B + k(i + 1, j + 1));   // bottom
  }
  const rim = [...Array.from({ length: m }, (_, j) => k(0, j)), ...Array.from({ length: n - 1 }, (_, i) => k(i + 1, cols)),
    ...Array.from({ length: cols }, (_, j) => k(n - 1, cols - 1 - j)), ...Array.from({ length: n - 2 }, (_, i) => k(n - 2 - i, 0))];
  rim.forEach((a, i) => { const b = rim[(i + 1) % rim.length]; index.push(a, B + a, b, b, B + a, B + b); });   // the edge all round
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...top, ...bottom], 3));
  geo.setIndex(index);
  // 0013: in Rhino one closed NURBS surface: each station's section (across the top, back
  // across the bottom) is a row, and both ends close to a point.
  const P = (a, q) => [a[q * 3], a[q * 3 + 1], a[q * 3 + 2]];
  const rows = centre.map((_, i) => [...Array.from({ length: m }, (_, j) => P(top, k(i, j))), ...Array.from({ length: m }, (_, j) => P(bottom, k(i, cols - j))), P(top, k(i, 0))]);
  const pole = (row) => { const c = row.reduce((s, p) => s.map((v, d) => v + p[d] / row.length), [0, 0, 0]); return row.map(() => c); };
  const mesh = new THREE.Mesh(geo);
  mesh.userData.nurbs = { type: 'grid', rows: [pole(rows[0]), ...rows, pole(rows.at(-1))] };
  return mesh;
}

// IKEA LÅNGFJÄLL conference chair with armrests, from IMG_8454-8459. Official: W 68, D 68 cm,
// seat W 53, D 41 cm, seat height 43-53 cm. Front is +z.
// 0009 notes 2 and 4: the seat and back are one moulded, upholstered shell that curves
// smoothly from the seat's rolled front lip, through a shallow dish, up into the back, which
// leans back and narrows: 380 mm wide at the top and 350 lower down, measured with the ruler
// laid on it (IMG_8459). Note 1: each armrest is one bent tube, clipped under the seat at the
// front and into the back of the shell at the rear (IMG_8456, 8457). Note 3: the five legs
// arch down from a high hub to the castor sockets (IMG_8454, 8455).
function langfjall(s) {
  const h = s.seatH, d = s.seatD, rise = s.backTop - h, lean = Math.tan(rad(s.backTilt)), zb = -d / 2;
  // The shell's centreline from the front lip to the top of the back, 22 mm under the seat face.
  const ctrl = [[d / 2 + 0.006, -0.042], [d / 2 - 0.03, -0.024], [d / 4, -0.022], [0, -0.03], [zb + 0.07, -0.024], [zb + 0.012, 0.03],
    [zb - 0.004, rise * 0.3], [zb - 0.012 - rise * 0.35 * lean, rise * 0.55], [zb - 0.02 - rise * 0.7 * lean, rise * 0.8], [zb - 0.03 - rise * lean, rise - 0.02]];
  const wk = [0.93, 1, 1, 0.98, 0.84, 0.7, 0.66, 0.68, 0.7, 0.72];   // width as a share of the seat's, from the photos
  const line = new THREE.CatmullRomCurve3(ctrl.map(([z, y]) => V([0, h + y, z]))), N = 64, centre = line.getPoints(N);
  const ends = [0];
  for (let i = 1; i < centre.length; i++) ends.push(ends[i - 1] + centre[i].distanceTo(centre[i - 1]));
  const total = ends.at(-1);
  const round = (dist, rc) => (dist >= rc ? 1 : Math.sqrt(1 - (1 - dist / rc) ** 2));   // rounded corners at both ends
  const widths = centre.map((_, i) => {
    const f = i / N * (ctrl.length - 1), a = Math.floor(f), w = lerp(wk[a], wk[Math.min(a + 1, wk.length - 1)], f - a) * s.seatW;
    return w * (0.55 + 0.45 * round(ends[i], 0.07) * round(total - ends[i], 0.08));
  });
  const thick = centre.map((_, i) => lerp(0.046, 0.034, i / N));
  const dish = centre.map((_, i) => 0.025 * Math.min(1, ends[i] / 0.1, (total - ends[i]) / 0.1));   // flat at both ends
  const seat = on('Shell', tier(1, loft(centre, widths, thick, dish)));
  seat.userData.smooth = true;   // 0014 note 5: no zigzag where the shell turns edge-on (lib/draw.js)
  // Where the back is at armrest height, for the armrests' clips.
  const atArm = centre.reduce((b, p) => (Math.abs(p.y - s.armH) < Math.abs(b.y - s.armH) ? p : b));
  const bw = widths[centre.indexOf(atArm)], ax = s.seatW / 2 + 0.015;
  const arm = (sx) => {
    const pts = [[ax - 0.05, h - 0.055, d / 2 - 0.09], [ax + 0.004, h - 0.03, d / 2 - 0.06], [ax + 0.006, h + 0.06, d / 2 - 0.03], [ax + 0.004, s.armH - 0.06, d / 2 - 0.03],
      [ax, s.armH, d / 2 - 0.11], [bw / 2 + 0.035, s.armH, atArm.z + 0.04], [bw / 2 - 0.005, s.armH, atArm.z - 0.035], [bw / 2 - 0.04, s.armH, atArm.z - 0.04]];
    return on('Armrests', tier(2, tube(curve(pts.map(([x, y, z]) => [sx * x, y, z]), 60), 0.011, 12)));
  };
  const clip = (sx) => on('Armrests', tier(3, box(0.03, 0.03, 0.012, sx * (bw / 2 - 0.04), s.armH, atArm.z - 0.04)));
  // The base: five legs arching from the hub down to the castors.
  const base = [], R = s.baseD / 2 - 0.025;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3, c = Math.cos(a), sn = Math.sin(a), L = (r, y) => [c * r, y, sn * r];
    base.push(on('Base', tier(2, tube([L(0.03, 0.155), L(0.1, 0.16), L(R * 0.62, 0.135), L(R * 0.9, 0.095), L(R, 0.072), L(R + 0.004, 0.06)], 0.015, 10))));
    const wheel = cylinder(0.026, 0.026, 0.034, c * R, 0.026, sn * R, 16);
    wheel.rotation.order = 'YXZ';
    wheel.rotation.y = -a;
    wheel.rotation.x = Math.PI / 2;
    base.push(as('rubber', on('Castors', tier(3, wheel))), on('Castors', tier(3, cylinder(0.012, 0.012, 0.03, c * R, 0.055, sn * R, 12))));
  }
  const col = h - 0.24;
  return group(
    as('dark', group(
      ...base,
      on('Base', tier(2, cylinder(0.04, 0.036, 0.05, 0, 0.155, 0))),                       // hub
      on('Base', tier(2, cylinder(0.022, 0.022, 0.09, 0, 0.11, 0))),                       // the column below the hub
      on('Base', tier(2, cylinder(0.03, 0.03, col, 0, 0.18 + col / 2, 0))),               // the sleeve up to the mechanism
      on('Mechanism', tier(2, box(0.2, 0.035, 0.24, 0, h - 0.075, 0))),
      on('Mechanism', tier(3, box(0.13, 0.014, 0.02, 0.15, h - 0.085, 0.06))),            // the height lever, right side
      arm(-1), arm(1), clip(-1), clip(1),
    )),
    as('fabric', seat),
  );
}

// A flat strip along a curve in the (z, y) plane: `t` thick in that plane and `w` wide in x,
// rectangular in section, centred on x. It goes to Rhino as an extrusion.
function strip(pts, t, w, x) {
  const P = new THREE.CatmullRomCurve3(pts.map(([z, y]) => V([0, y, z]))).getPoints(pts.length * 10), a = [], b = [];
  P.forEach((p, i) => {
    const q = P[Math.min(i + 1, P.length - 1)], r = P[Math.max(i - 1, 0)], tz = q.z - r.z, ty = q.y - r.y, l = Math.hypot(tz, ty);
    a.push([p.z - ty / l * t / 2, p.y + tz / l * t / 2]);
    b.push([p.z + ty / l * t / 2, p.y - tz / l * t / 2]);
  });
  const outer = [...a, ...b.reverse()];
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v))), { depth: w, bevelEnabled: false }));
  mesh.rotation.y = -Math.PI / 2;   // the outline's u runs along z, the extrusion along -x
  mesh.position.x = x + w / 2;
  mesh.userData.nurbs = { type: 'extrusion', outer, holes: [], depth: w };
  return mesh;
}

// IKEA POÄNG with head cushion, from IMG_8464-8471, at the official W 68, D 82, H 100 cm,
// then stretched to the sliders. Front is +z.
// 0009 note 2: each side frame is one flat strip of bent birch, rectangular in section,
// 44 mm wide (measured with the ruler on the armrest, IMG_8468). From the armrest's back
// end it runs forward, down the front to the floor (480 mm to the armrest top, measured
// with the ruler at the front leg, IMG_8464), back along the floor, up a diagonal at the back
// and forward under the seat into the seat's front. Note 1: no frame shows round the seat;
// the seat frame is inside the cushion. Note 3: the head cushion is its own bolster. Note 4:
// the cushion is quilted: stripes along the seat, bands across the back.
// 0014 notes 5 and 7: the floor runner is straight, so its bottom is flat on the floor, and at the
// back it turns straight up into the diagonal, with nothing reaching out behind the bend.
const POANG_SIDE = [[-0.2, 0.47], [0.25, 0.472], [0.33, 0.452], [0.356, 0.39], [0.36, 0.15], [0.355, 0.06], [0.335, 0.024], [0.3, 0.014],
  [0.2, 0.014], [0, 0.014], [-0.15, 0.014], [-0.195, 0.018], [-0.218, 0.038], [-0.212, 0.066], [-0.17, 0.15], [-0.11, 0.258], [-0.075, 0.282],
  [0.15, 0.285], [0.2, 0.298], [0.215, 0.33]];
const POANG_SEAT = [[0.4, 0.335], [0.22, 0.33], [0, 0.31], [-0.12, 0.305], [-0.165, 0.37], [-0.22, 0.51], [-0.285, 0.68], [-0.345, 0.83], [-0.385, 0.94]];
function poang(s) {
  const parts = [], t = s.frameT, w = s.frameW, half = 0.34 - w / 2;
  for (const sx of [-1, 1]) parts.push(on('Side frames', tier(2, strip(POANG_SIDE, t, w, sx * half))));
  // Cross rails between the frames: on the floor at the back and (0014 note 6) at the front,
  // and under the seat.
  const rail = (y0, y1, z0, z1) => on('Rails', tier(2, span(-half + w / 2, half - w / 2, y0, y1, z0, z1)));
  parts.push(rail(0.002, 0.026, -0.17, -0.125), rail(0.002, 0.026, 0.22, 0.265), rail(0.27, 0.297, -0.06, -0.02));
  // The cushion: a band on the seat line, `cushion` thick on the seat and (0014 note 8) `back`
  // thick up the back. The head cushion is its own bolster.
  const pts = new THREE.CatmullRomCurve3(POANG_SEAT.map(([z, y]) => V([0, y, z]))).getPoints(48), inner = [], outer = [], normals = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
    const n = new THREE.Vector2(q.y - r.y, -(q.z - r.z)).normalize();
    const end = Math.min(1, i / 3, (pts.length - 1 - i) / 4), roll = Math.sqrt(1 - (1 - end) ** 2);   // both ends rounded
    const thick = lerp(s.cushion, s.back, Math.min(Math.max((p.y - 0.36) / 0.16, 0), 1)) * Math.max(0.15, roll);
    inner.push(new THREE.Vector2(p.z, p.y));
    outer.push(new THREE.Vector2(p.z, p.y).addScaledVector(n, thick));
    normals.push(n);
  });
  const cw = 0.5, cushion = new THREE.ExtrudeGeometry(new THREE.Shape([...inner, ...[...outer].reverse()]),
    { depth: cw, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 4, curveSegments: 4 });
  const cushionMesh = new THREE.Mesh(cushion);   // 0013: turned as a mesh, not in its geometry, so Rhino gets an extrusion
  cushionMesh.rotation.y = -Math.PI / 2;
  cushionMesh.position.x = cw / 2;
  cushionMesh.userData.nurbs = { type: 'extrusion', outer: [...inner, ...[...outer].reverse()].map((p) => [p.x, p.y]), depth: cw };
  // The quilting, on the cushion's face: 0014 note 9, bands across it everywhere, seat and back,
  // about 115 mm apart.
  const face = (i, x, off = 0.0165) => [x, outer[i].y + normals[i].y * off, outer[i].x + normals[i].x * off];   // the bevel stands 15 mm out
  const quilt = [];
  for (let i = 1, run = 0; i < outer.length - 4; i++) {
    run += outer[i - 1].distanceTo(outer[i]);
    if (run > 0.115) { run = 0; quilt.push([...face(i, -cw / 2 + 0.01), ...face(i, cw / 2 - 0.01)]); }
  }
  // The head bolster, on the front of the back, strapped over the top.
  const hb = outer.findIndex((p) => p.y > 0.83), hn = normals[hb];
  const bolster = at(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.19, 0.1, 4, 0.045)), 0, outer[hb].y + hn.y * 0.065, outer[hb].x + hn.x * 0.065);
  bolster.rotation.x = Math.atan2(-hn.y, hn.x);   // its face along the back's
  bolster.userData.nurbs = { type: 'box', size: [0.42, 0.19, 0.1] };   // 0013: in Rhino a plain box, without the rounding
  const strap = [];
  for (const x of [-0.02, 0.02]) for (let i = hb + 2; i < outer.length - 1; i++) strap.push([...face(i, x, 0.019), ...face(i + 1, x, 0.019)]);
  const chair = group(as('birch', group(...parts)),
    as('canvas', group(on('Cushion', tier(1, cushionMesh)), on('Cushion', lines(quilt)), on('Head cushion', tier(2, bolster)), on('Head cushion', lines(strap)))));
  chair.scale.set(s.W / 0.68, s.H / 1.0, s.D / 0.82);
  return group(chair);
}

// The tall cabinet beside the desk, with the four posters on its front (the "Architecture"
// spot). From the photos. Its origin is its back corner nearest the window, so it grows into
// the room and away from the wall. The posters are a group named 'posters', which the site
// lifts out and makes clickable.
// PLACEHOLDER posters: postcards with a line drawing each.
function card(w, h, x, y, z, rot, art = []) {
  const g = as('white', group(hot(tier(2, on('Posters', box(w, h, 0.003, 0, 0, 0)))), lines(art, 3)));
  g.position.set(x, y, z);
  g.rotation.z = rot;
  return g;
}
function hatch(w, h, step) {   // diagonal hatch clipped to a w by h card
  const segs = [];
  for (let c = -h; c < w; c += step) {
    const a = Math.max(0, -c), b = Math.min(h, w - c);
    if (b > a) segs.push([c + a - w / 2, a - h / 2, 0.002, c + b - w / 2, b - h / 2, 0.002]);
  }
  return segs;
}
const onCard = (pts, n) => poly(curve(pts.map(([x, y]) => [x, y, 0.002]), n));
function cabinet(s) {
  const W = s.W, D = s.D, H = s.H, zf = D + 0.002;   // the posters stand 2 mm off the front
  const posters = group(
    card(0.13, 0.2, 0.12, 1.6, zf, 0.04, hatch(0.13, 0.2, 0.012)),
    card(0.22, 0.28, 0.32, 1.61, zf, -0.05, [
      ...onCard([[-0.06, -0.1], [-0.03, 0], [0.01, 0.03], [0.05, 0.1]], 14),
      ...onCard([[-0.03, -0.11], [0.03, -0.06], [0.07, -0.1]], 10),
      ...onCard([[-0.02, 0], [0, 0.07], [0.05, 0.05], [0.03, -0.01]], 12),
    ]),
    card(0.15, 0.22, 0.29, 1.28, zf, 0.03, [
      [-0.075, 0.03, 0.002, 0.075, 0.03, 0.002], [-0.075, -0.05, 0.002, 0.075, -0.05, 0.002],
      ...hatch(0.15, 0.08, 0.008).map(([a, b, c, d, e, f]) => [a, b + 0.07, c, d, e + 0.07, f]),
    ]),
    card(0.12, 0.16, 0.11, 1.27, zf, -0.03, [
      ...onCard([[-0.04, -0.05], [0, 0], [0.04, 0.05]], 8),
      ...circle(0.022, 18, (p, q) => [0.02 + p, q - 0.03, 0.002]),
    ]),
  );
  posters.name = 'posters';
  posters.position.y = s.posterY - 1.44;   // 1.44 m: the middle of the four as drawn before
  return group(
    as('white', on('Cabinet', span(0, W, 0, H, 0, D))),
    on('Cabinet', lines([[W * s.split, 0.02, D + 0.0005, W * s.split, H - 0.02, D + 0.0005], [0, s.shelf, D + 0.0005, W, s.shelf, D + 0.0005]], 3)),
    posters,
  );
}

// The jute rug under the desk, from IMG_8441, 8443 and 8454. 0009 note 1: braided jute, drawn
// as rows of chevron stitches. Origin: its corner nearest the window and the back wall.
function rug(s) {
  return group(as('rug', on('Rug', span(0, s.L, 0, s.T, 0, s.W))), juteWeave(0, s.L, 0, s.W, s.T + 0.0008, 13));
}

// The sill plant's planter, your 3D print (Desk input/Products/sill plant pots.3mf): the
// straight-ribbed pot ("new pot2", Ø118 x 80.5 mm) standing in the tray ("new pot1 tálca",
// Ø124.4 x 55 mm), its foot 23 mm above the tray's, read from IMG_8477 and 8478 (48 mm of
// ribs show above the tray). Converted to models/sill-plant-pot.obj; its top is 103.5 mm up.
const PLANTER_TOP = 0.1035, PLANTER_IN = 0.0446;   // the pot's top, and its inside radius there
async function planter() {
  const model = await readObj('models/sill-plant-pot.obj');
  if (!model) return as('pla', turned(plainPot(0.062, 0.06, PLANTER_TOP, 0.003), 'pla'));   // no file: a plain stand-in
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    as('pla', tier(2, o));
    o.userData.outlineOnly = o.userData.layer === 'Planter';   // 180 ribs: their outlines only, or they ink it solid
  });
  return model.root;
}

// ---- The registry entries --------------------------------------------------------------------

export const FURNITURE = {
  'desk-chair': {
    title: 'Desk chair (IKEA LÅNGFJÄLL)',
    note: 'IKEA LÅNGFJÄLL with armrests, from your photos. Official: W 68, D 68 cm, seat W 53, D 41 cm, seat height 43-53 cm. The back is 380 mm wide at the top, measured with the ruler; the rest of the shell is read from the side photo.',
    // On the rug, pulled out from the desk, facing it and turned a little to the window.
    params: [...place(0.05, 0.85, -166, 0.006),
      P('seatH', 'Seat height (official 430-530)', 0.46, 0.43, 0.53, 0.005),
      P('seatW', 'Seat width (official 530)', 0.53, 0.4, 0.65, 0.005),
      P('seatD', 'Seat depth (official 410)', 0.41, 0.3, 0.55, 0.005),
      P('baseD', 'Base across the castors (official width 680)', 0.67, 0.5, 0.75, 0.005),
      P('backTop', 'Top of the back above the floor', 0.88, 0.7, 1.1, 0.005),
      P('backTilt', 'Back leaning back (about 20 in IMG_8456)', 20, 0, 35, 0.5, '°'),
      P('armH', 'Armrest height above the floor', 0.665, 0.55, 0.8, 0.005)],
    build: langfjall,
  },
  armchair: {
    title: 'Armchair (IKEA POÄNG)',
    note: 'IKEA POÄNG with head cushion, from your photos. Official: W 68, D 82, H 100 cm, seat height 42 cm. Frame 44 mm wide and armrest top 480 mm, measured with the ruler.',
    params: [...place(0.75, 1.75, 107),   // in front of the dracaena, facing into the room
      P('W', 'Width (official 680)', 0.68, 0.55, 0.8, 0.005),
      P('D', 'Depth (official 820)', 0.82, 0.65, 0.95, 0.005),
      P('H', 'Height (official 1000)', 1.0, 0.85, 1.15, 0.005),
      P('cushion', 'Cushion thickness', 0.08, 0.03, 0.14, 0.005),
      P('back', 'Back cushion thickness (0014: thinner)', 0.05, 0.02, 0.14, 0.005),
      P('frameT', 'Birch frame thickness', 0.025, 0.012, 0.04, 0.001),
      P('frameW', 'Birch frame width (measured 44)', 0.044, 0.03, 0.07, 0.001)],
    build: poang,
  },
  cabinet: {
    title: 'Cabinet with the posters',
    note: 'From your photos. Position is its back corner nearest the window. The posters are placeholders and stay the "Architecture" click on the site.',
    params: [...place(0.84, -0.5),
      P('W', 'Width', 0.58, 0.3, 1.2, 0.005),
      P('D', 'Depth', 0.36, 0.2, 0.6, 0.005),
      P('H', 'Height', 2.1, 0.8, 2.4, 0.005),
      P('split', 'Door split, from the left', 0.5, 0, 1, 0.01, '%'),
      P('shelf', 'Line across the front, height', 0.8, 0, 2.2, 0.005),
      P('posterY', 'Posters, height of their middle', 1.44, 0.4, 2.1, 0.005)],
    build: cabinet,
  },
  rug: {
    title: 'Rug (jute)',
    note: 'A braided jute rug, from your photos. Position is its corner nearest the window and the back wall.',
    params: [...place(-0.45, 0.08),
      P('L', 'Length, out from the window', 1.85, 0.6, 3, 0.005),
      P('W', 'Width, along the window', 1.09, 0.6, 2.5, 0.005),
      P('T', 'Thickness', 0.006, 0.002, 0.02, 0.001)],
    build: rug,
  },
  dracaena: {
    title: 'Tall dracaena',
    note: 'From IMG_8460-8463. Position is the middle of the pot. The pot is 232 mm across the rim, measured with the ruler standing in it (IMG_8461). Leaves turn back where they would reach the window or the side wall.',
    params: [...place(-0.4, 1.62),
      P('potR', 'Pot radius at the rim (measured 116)', 0.116, 0.08, 0.3, 0.001),
      P('taper', 'Pot foot, as a share of the rim', 0.9, 0.4, 1, 0.01, '%'),
      P('potH', 'Pot height', 0.25, 0.1, 0.5, 0.005),
      P('trunks', 'Trunks (two in the photos)', 2, 1, 3, 1),
      P('c1', 'Tallest crown, height', 1.82, 0.6, 2.6, 0.01),
      P('c2', 'Middle crown, height', 1.36, 0.5, 2.4, 0.01),
      P('c3', 'Lowest crown, height (third trunk)', 1.02, 0.4, 2.2, 0.01),
      P('trunkR', 'Trunk radius', 0.011, 0.005, 0.03, 0.001),
      P('leafLen', 'Leaf length (average)', 0.41, 0.15, 0.7, 0.005),
      P('leafW', 'Leaf width', 0.017, 0.006, 0.04, 0.001),
      P('leaves', 'Leaves per crown', 60, 10, 120, 1)],
    build: dracaena,
  },
  'desk-plant': {
    title: 'Desk plant (peace lily)',
    note: 'A peace lily in a terracotta pot with a collar, from IMG_8472-8476. Position is the middle of the pot. The photos show no saucer, so it has none (the saucer slider brings one back).',
    params: [...place(0.67, -0.27, 0, 0.74),
      P('saucer', 'Saucer radius (0 = none, as in the photos)', 0, 0, 0.2, 0.001),
      P('potR', 'Pot radius at the rim', 0.095, 0.02, 0.2, 0.001),
      P('taper', 'Pot foot, as a share of the rim', 0.6, 0.4, 1, 0.01, '%'),
      P('potH', 'Pot height', 0.18, 0.03, 0.4, 0.005),
      ...plantParams([0.3, 0.13, 0.23, 26, 5, 0.0025])],
    // Keeps out of the monitor, the two prints (where you placed them in 0007), the wall,
    // the cabinet and the desk top.
    build: (s) => deskPlant(s, toLocal([
      Box(-0.12, 0.83, -0.38, 0.52, 1.22, -0.27), Box(0.4, 0.74, -0.275, 0.56, 0.835, -0.19),
      Box(0.49, 0.74, -0.09, 0.68, 0.9, 0.095), Box(-2, 0, -2, 3, 3, -0.497),
      Box(0.838, 0, -0.6, 1.5, 2.2, -0.138), Box(-1, 0, -1, 2, 0.742, 1),
    ], s), 5),
  },
  'sill-plant': {
    title: 'Sill plant (peace lily)',
    note: 'A small peace lily, the same plant as the desk plant with its own build, in your 3D-printed planter (sill plant pots.3mf: the ribbed pot in its tray). Position is the middle of the planter. Leaves stay off the glass and the window handles.',
    params: [...place(-0.766, 0.907, 0, 0.8), ...plantParams([0.22, 0.1, 0.13, 13, 3, 0.002])],
    build: async (s, ctx) => {
      const p = ctx.shell, F = shell.frame(p), n = Math.round(p.sashes), cw = (p.winW - p.frameW * (n + 1)) / n;
      const handles = Array.from({ length: n - 1 }, (_, i) => F.z0 + p.frameW + i * (cw + p.frameW) + cw - p.sashW / 2);
      const y = PLANTER_TOP - 0.015;   // note 2: the soil 15 mm below the rim
      const avoid = toLocal([Box(-2, 0, -2, F.xf1 + 0.015, 3, 3),
        ...handles.map((z) => Box(F.xf1, F.yF + p.handleY - 0.2, z - 0.03, F.xf1 + 0.09, F.yF + p.handleY + 0.06, z + 0.03))], s);
      return group(await planter(), soil(PLANTER_IN, y),
        at(lily({ height: s.height, spread: s.spread, leafLen: s.leafLen, n: s.leaves, seed: 19, sprouts: s.sprouts, stemR: s.stemR, avoid: avoid.map((b) => b.clone().translate(V([0, -y, 0]))) }), 0, y, 0));
    },
  },
  pothos: {
    title: 'Hanging money plant (pothos)',
    note: 'A money plant (golden pothos) in three pots on top of the cabinet, from IMG_8439, 8440 and 8472. Position is the middle of the first pot. The vines move with the pots and follow the cabinet.',
    params: [...place(1.12, -0.32, 0, 2.1),
      P('potR', 'First pot, radius at the rim', 0.075, 0.03, 0.15, 0.001),
      P('taper', 'Pot foot, as a share of the rim', 0.8, 0.4, 1, 0.01, '%'),
      P('potH', 'First pot, height', 0.11, 0.05, 0.25, 0.005),
      P('pot2', 'Second pot, size as a share of the first', 0.8, 0.4, 1.2, 0.01, '%'),
      P('pot3', 'Third pot, size as a share of the first', 0.7, 0.4, 1.2, 0.01, '%'),
      P('reach', 'How far the vines hang down, as a share', 1, 0.2, 1.5, 0.01, '%'),
      P('front', 'Vines down the front', 6, 0, 6, 1),
      P('side', 'Vines down the side', 3, 0, 3, 1),
      P('density', 'Leaves per metre of vine', 30, 8, 60, 1),
      P('leafK', 'Leaf size, as a share', 1, 0.5, 1.6, 0.01, '%'),
      P('tipK', 'Leaves at the vine ends, size as a share of those near the pot', 0.4, 0.2, 1, 0.01, '%'),
      P('leafVar', 'Leaf size, random spread either way', 0.35, 0, 0.6, 0.01, '%')],
    build: pothos,
  },
};
