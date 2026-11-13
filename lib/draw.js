// The drawing style, shared by the site (index.html) and the model bench (bench.html).
// All sizes are metres, y is up. Moved here unchanged from index.html in run 0006, except
// that a cut is now any plane in mesh.userData.cuts, not only the wall tops.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const PAPER = 0xf5f5f4, INK = 0x111111;
// True isometric: the view direction never changes.
export const VIEW_DIR = new THREE.Vector3(1, Math.SQRT2 / Math.sqrt(3), 1).normalize();

// Line weights in CSS pixels. A mesh of tier t (0-3) draws its outline at WEIGHTS[t] and
// its inner edges one step lighter. Tier follows size unless a mesh sets userData.tier.
// Tier 4, CUT, is only for where walls are cut: the one heavy line, as in a section.
// 0007: tiers 5 and 6 are pale lines: FAINT for the block joints and for the greyed-out
// room on the bench, FAINTER for the block ribs and speckle.
export const WEIGHTS = [1.3, 1.0, 0.75, 0.45, 2.4, 0.5, 0.4];
const COLORS = [INK, INK, 0x2b2b2b, 0x5a5a5a, INK, 0x9c9c9c, 0xbdbdbd];   // the finest lines are also lighter
export const CUT = 4, FAINT = 5, FAINTER = 6;

// ---- Per-object style (0008) --------------------------------------------------------------
// Every bench object can change its own look. The values live in its settings, beside its
// sizes, under these keys. Missing keys mean the house style above, so the scene only
// changes where a setting was moved on the bench.
//   (fill_<mat>, a colour per material per object, 0009-0012: gone in 0013. Colours are
//   shared by the whole scene now, in COLOURS below.)
//   mat_<layer> 0012: the material of one part (all meshes on that layer of this object),
//               in place of the one it was built with. Set in the bench's materials mode.
//   opacity     of the surfaces, 0-1; lines stay
//   w0 ... w6   line weight of each tier in px (WEIGHTS)
//   tex_<kind>  texture strength 0-1: 1 is the house style, 0 hides it
//   texw_<kind> texture line thickness, a factor on its tier's weight
export const WEIGHT_LABELS = [
  'Line weight 0: outlines of large parts (over 1 m)',
  'Line weight 1: outlines of mid-size parts, inner edges of large ones',
  'Line weight 2: outlines of small parts (60-250 mm)',
  'Line weight 3: the finest: details, leaves, stems, hatches',
  'Cut line: the heavy line round wall cuts',
  'Pale line: block joints',
  'Palest line: block ribs and pits',
];
// Texture kinds, with what they are called on the bench and their default strength.
// 0008 notes: the floor (room-shell 6) and the desk's grain (desk 2) were too strong.
export const TEXTURES = {
  floor: ['Floorboards', 0.5], block: ['Block ribs and joints', 1], section: ['Section hatches where cut', 1],
  concrete: ['Concrete stipple', 1], grain: ['Wood grain', 0.35], rug: ['Jute weave', 1],
  pebbles: ['Clay pebbles', 1], bark: ['Bark rings', 1],   // 0009, the dracaena
};
// Marks lines (or a group of them) as a texture of one kind.
export const texture = (kind, o) => (o.userData.texture = kind, o);
function styleOf(o) {
  for (let p = o; p; p = p.parent) if (p.userData.style) return p.userData.style;
  return {};
}
const weightOf = (st, t) => st[`w${t}`] ?? WEIGHTS[t];
// The part a mesh belongs to: its nearest layer name.
export function layerOf(o) {
  for (let p = o; p; p = p.parent) if (p.userData.layer) return p.userData.layer;
  return '';
}
// The material a mesh is drawn in: its part's override (0012), else the nearest one it was
// built with, else 'object'. With `st` = {} it is the one it was built with.
export function matOf(o, st = styleOf(o)) {
  const over = st[`mat_${layerOf(o)}`];
  if (over && TONES[over] !== undefined) return over;
  for (let p = o; p; p = p.parent) if (p.userData.mat) return p.userData.mat;
  return 'object';
}

// Flat light grey per material, as in the reference drawings. These are the colours in
// shade. Sunlight lifts them towards white, so nothing is plain white unless it is lit.
export const TONES = {
  plaster: 0xe0e0de, block: 0xd8d8d6, concrete: 0xcbcbc9, floor: 0xd3d3d1, rug: 0xbdbdbb,
  wood: 0xd6d6d3, metal: 0x9a9a9a, white: 0xe6e6e4, dark: 0xa4a4a4, glass: 0xe4e7e8,
  screen: 0xd5d8db, leaf: 0xcdcfcb, object: 0xdcdcda,
  blind: 0xd6c2bf,     // a pale tint of the blind's real red
  fabric: 0xb4b4b2,    // the dark grey shell of the desk chair
  birch: 0xdedbd3,     // the POÄNG's bent birch frame
  // 0009
  canvas: 0xe4e3de,    // the POÄNG's off-white cushion
  rubber: 0xbdbdbb,    // the desk chair's grey castor tyres
  terracotta: 0xd7d2cc, soil: 0xaaa8a4, ceramic: 0xd3d1cd,
  pla: 0xe3e1db,       // the 3D-printed planter on the sill
};
// 0013: one colour per material for the whole scene, '#rrggbb', from bench/materials.json
// (loaded by objects/index.js, changed by the bench). A material not in it draws in its tone.
export const COLOURS = {};
export const colourOf = (mat) => COLOURS[mat] || `#${new THREE.Color(TONES[mat] ?? TONES.object).getHexString()}`;
// What each material is called on the bench, beside its colour picker.
export const MATERIALS = {
  plaster: 'Plaster', block: 'Blocks', concrete: 'Concrete', floor: 'Floor', rug: 'Jute',
  wood: 'Wood', metal: 'Metal', white: 'White paint', dark: 'Black plastic', glass: 'Glass',
  screen: 'Screen', leaf: 'Leaves and stems', object: 'Other', blind: 'Blind', fabric: 'Fabric',
  birch: 'Birch', canvas: 'Cushion', rubber: 'Castor tyres', terracotta: 'Terracotta', soil: 'Soil',
  ceramic: 'Ceramic', pla: 'Printed plastic',
};
export const as = (mat, o) => (o.userData.mat = mat, o);   // marks a mesh or group with a material

// ---- Day and night (0014) -------------------------------------------------------------------
// Everything above is the day drawing: dark ink on light paper. Night is worked out from it:
// light lines on dark grey. Every fill and line keeps its day colour (userData.light) and is
// drawn in fill() or line() of it, so the saved colours stay the day ones and the switch only
// recolours. The choice is kept in the browser, shared by the site and the bench.
export const THEME = { dark: false, hoverGlow: false };   // hoverGlow: the screens light only while hovered (the site)
try { THEME.dark = localStorage.getItem('theme') === 'dark'; } catch {}
const NIGHT = {
  // Greyscale, like the day drawing (your note after 0014: no blue).
  paper: [0.09, 0.09, 0.09],    // the dark grey round the room
  deep: [0.11, 0.11, 0.11],     // a dark material (black plastic) in shade
  lift: [0.23, 0.23, 0.23],     // a white one in shade
  ink: [0.92, 0.92, 0.92],      // the heaviest line
  moon: 0,                      // 0015: no sun at night; the light patches come from the light strip (objects/desk-things.js)
};
const rgb = (hex) => { const c = new THREE.Color(); c.setHex(hex, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
const toHex = (v) => new THREE.Color().setRGB(...v.map((x) => Math.min(Math.max(x, 0), 1)), THREE.SRGBColorSpace).getHex();
const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const lum = (v) => (v[0] + v[1] + v[2]) / 3;
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
// A surface: its lightness by day sets how light a blue it is at night; a tint (the blind's red,
// a hover colour) is kept at half strength.
export function fill(hex) {
  if (!THEME.dark) return hex;
  const v = rgb(hex), L = lum(v), out = mix(NIGHT.deep, NIGHT.lift, clamp01((L - 0.55) / 0.45));
  return toHex(out.map((x, i) => x + (v[i] - L) * 0.5));
}
// A line: as far from the paper towards the ink as it is by day.
export function line(hex) {
  if (!THEME.dark) return hex;
  const p = lum(rgb(PAPER)), t = clamp01((p - lum(rgb(hex))) / (p - lum(rgb(INK))));
  return toHex(mix(rgb(paperHex()), NIGHT.ink, t));
}
// The background. 0014: chosen on the bench, one for day and one for night, saved with the
// material colours (COLOURS.paper, COLOURS.nightPaper in bench/materials.json).
export const PAPER_KEY = () => (THEME.dark ? 'nightPaper' : 'paper');
export const paperHex = () => {
  const chosen = COLOURS[PAPER_KEY()];
  return chosen ? new THREE.Color(chosen).getHex() : THEME.dark ? toHex(NIGHT.paper) : PAPER;
};
// Recolours a scene for the current theme: background, sun, every fill and line, and anything
// with its own userData.onTheme(dark) (the light strip's glow).
export function applyTheme(scene, sun) {
  document.documentElement.dataset.theme = THEME.dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--paper', `#${new THREE.Color(paperHex()).getHexString()}`);
  scene.background = new THREE.Color(paperHex());
  if (sun) sun.intensity = (THEME.dark ? NIGHT.moon : 1) * SUN;
  scene.traverse((o) => {
    if (o.userData.light === undefined) { o.userData.onTheme?.(THEME.dark); return; }
    // Lines first: a LineSegments2 is a mesh too.
    if (o.material?.isLineMaterial) o.material.color.set(line(o.userData.light));
    else if (o.isMesh) { o.userData.tone = fill(o.userData.light); o.material.color.set(o.userData.tone); }
  });
}
// Sets things built after applyTheme (a bench rebuild) to the current theme.
export const themed = (root) => root.traverse((o) => o.userData.onTheme?.(THEME.dark));
// Lights or dims what has userData.onHover under root (the screens at night).
export const glowing = (root, on) => root.traverse((o) => o.userData.onHover?.(on));
// A button that switches day and night: recolours, remembers, and tells `then`.
export function themeButton(button, scene, sun, then) {
  const label = () => { button.textContent = THEME.dark ? 'Day' : 'Night'; button.setAttribute('aria-pressed', THEME.dark); };
  label();
  button.addEventListener('click', () => {
    THEME.dark = !THEME.dark;
    try { localStorage.setItem('theme', THEME.dark ? 'dark' : 'light'); } catch {}
    applyTheme(scene, sun);
    label();
    then?.();
  });
}
// The sun comes in through the window: from outside (-x) and from the front (+z).
export const SUN_DIR = new THREE.Vector3(-1, 0.58, 0.5).normalize();   // low, about 27 degrees
// Tier follows the middle one of a mesh's three sizes, so a long thin piece like the sill
// draws as fine as its section, not as heavy as a wall.
const tierOf = (mid) => (mid > 1.0 ? 0 : mid > 0.25 ? 1 : mid > 0.06 ? 2 : 3);

// Geometry helpers. Box and cylinder record what they are in userData.nurbs, so the bench
// can write them to a .3dm as true NURBS solids.
export const at = (mesh, x, y, z) => (mesh.position.set(x, y, z), mesh);
export const box = (w, h, d, x, y, z, rotZ = 0) => {
  const mesh = at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d)), x, y, z);
  mesh.rotation.z = rotZ;
  mesh.userData.nurbs = { type: 'box', size: [w, h, d] };
  return mesh;
};
// A box from its min and max corners.
export const span = (x0, x1, y0, y1, z0, z1) => box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
export const cylinder = (rTop, rBottom, h, x, y, z, sides = 28) => {
  const mesh = at(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides)), x, y, z);
  // A tapered one (a pot) is a profile turned round its axis: radius, height from its middle.
  mesh.userData.nurbs = rTop === rBottom ? { type: 'cylinder', r: rTop, h }
    : { type: 'rev', profile: [[0, -h / 2], [rBottom, -h / 2], [rTop, h / 2], [0, h / 2]] };
  return mesh;
};
export const sphere = (r, x, y, z) => {
  const mesh = at(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8)), x, y, z);
  mesh.userData.nurbs = { type: 'sphere', r };
  return mesh;
};
export const group = (...parts) => new THREE.Group().add(...parts);
export const tier = (t, mesh) => (mesh.userData.tier = t, mesh);
export const hot = (mesh) => (mesh.userData.hot = true, mesh);       // the part that tints on hover

// Bare lines with no surface: textures, keys, cables. segs is a list of [x0,y0,z0,x1,y1,z1].
export function lines(segs, t = 3) {
  const o = new THREE.Object3D();
  o.userData.segs = segs;
  o.userData.tier = t;
  return o;
}
export const poly = (pts) => pts.slice(1).map((p, i) => [...pts[i], ...p]);
export const circle = (r, n, point) => poly(Array.from({ length: n + 1 }, (_, i) =>
  point(r * Math.cos(i / n * 2 * Math.PI), r * Math.sin(i / n * 2 * Math.PI))));
export const ring = (r, x, y, z) => circle(r, 24, (p, q) => [x + p, y, z + q]);     // flat, facing up
export const curve = (pts, n = 40) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  .getPoints(n).map((v) => v.toArray());
export const V = (a) => new THREE.Vector3(...a);
export const Y = new THREE.Vector3(0, 1, 0);

export function random(seed) {   // repeatable, so the drawing is the same on every load
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

// Thin things drawn only as lines (stems, cables) still need a shadow. This is an
// invisible tube along the same points that casts one.
export const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
export function shadowTube(pts, r) {
  const path = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, r, 5), SHADOW_ONLY);
  mesh.castShadow = true;
  mesh.userData.plain = true;
  return mesh;
}

// ---- Textures --------------------------------------------------------------------------

// Coursed ribbed blocks, as in IMG_8439: mortar joints drawn as two lines, uneven ribs that
// stop short of the joints, and a speckle of pits. Pale lines (0007 note: lighter, less
// opaque). `at(s, y)` places a point on the wall face, s along the wall from s0 to s1. The
// coursing is laid from s = 0, y = 0, so pieces of one wall line up.
export function blockTexture(at, s0, s1, y0, y1, seed = 7) {
  const rnd = random(seed), joints = [], ribs = [];
  const courseH = 0.2, blockW = 0.42, ribW = 0.028, mortar = 0.01, m = mortar / 2;
  const clipS = (s) => Math.min(Math.max(s, s0), s1);
  for (let row = Math.floor(y0 / courseH); row * courseH < y1; row++) {
    const yb = row * courseH, yt = yb + courseH;
    for (const y of [yb + m, yt - m]) if (y > y0 && y < y1) joints.push([...at(s0, y), ...at(s1, y)]);
    const off = (row % 2) * blockW / 2;
    for (let k = Math.floor((s0 - off) / blockW) - 1; off + k * blockW < s1; k++) {
      const sb = off + k * blockW, ya = Math.max(yb + m, y0), yz = Math.min(yt - m, y1);
      if (ya >= yz) continue;
      for (const s of [sb - m, sb + m]) if (s > s0 && s < s1) joints.push([...at(s, ya), ...at(s, yz)]);
      for (let r = 0.03; r < blockW - 0.02; r += ribW) {   // ribs, each a little shorter or longer
        const rs = sb + r + (rnd() - 0.5) * 0.004;
        if (rs <= s0 || rs >= s1) continue;
        const a0 = Math.max(ya + 0.006 + rnd() * 0.02, y0), a1 = Math.min(yz - 0.006 - rnd() * 0.02, y1);
        if (a1 > a0) ribs.push([...at(rs, a0), ...at(rs, a1)]);
      }
      for (let i = 0; i < 6; i++) {   // pits in the face
        const ps = clipS(sb + rnd() * blockW), py = ya + rnd() * (yz - ya);
        ribs.push([...at(ps, py), ...at(clipS(ps + 0.003), py + 0.002)]);
      }
    }
  }
  return texture('block', group(lines(joints, FAINT), lines(ribs, FAINTER)));
}

// Where a wall is cut: its layers, as in a section drawing. `at(s, t)` turns a position
// along the cut (s) and through the wall's thickness (t, from the room side) into a point.
// Each layer is [thickness, pattern]. The heavy outline is drawn separately, round all cuts.
// 0009: `grid` lays the block joints where the face's coursing puts them, so the joints in
// the cut carry on from the joints on the face: { step, off, m }, joints at off + k * step,
// each drawn as two lines m either side, as on the face.
export function cutWall(at, s0, s1, layers, seed, grid = null) {
  const rnd = random(seed), fine = [], edges = [];
  const total = layers.reduce((sum, [w]) => sum + w, 0);
  let t0 = 0;
  for (const [w, pattern] of layers) {
    const t1 = t0 + w, mid = (t0 + t1) / 2;
    if (t1 < total - 1e-6) edges.push([...at(s0, t1), ...at(s1, t1)]);
    if (pattern === 'insulation') {   // the chain of loops for soft insulation
      const n = Math.round((s1 - s0) / 0.004);
      for (const sign of [1, -1]) {
        fine.push(...poly(Array.from({ length: n + 1 }, (_, i) => {
          const s = s0 + (s1 - s0) * i / n;
          return at(s, mid + sign * (w * 0.42) * Math.abs(Math.sin(s / (w * 0.9) * Math.PI)));
        })));
      }
    }
    if (pattern === 'block') {   // block joints across the layer
      if (!grid) for (let s = s0 + 0.21; s < s1; s += 0.21) fine.push([...at(s, t0), ...at(s, t1)]);
      else for (let g = grid.off + Math.floor((s0 - grid.off) / grid.step) * grid.step; g < s1 + grid.m; g += grid.step) {
        for (const s of [g - grid.m, g + grid.m]) if (s > s0 && s < s1) fine.push([...at(s, t0), ...at(s, t1)]);
      }
    }
    if (pattern === 'brick') {   // facing brick: the 45-degree hatch for masonry in section
      for (let s = s0 - w; s < s1; s += 0.014) {
        const a = Math.max(0, (s0 - s) / w), b = Math.min(1, (s1 - s) / w);
        if (b > a) fine.push([...at(s + w * a, t0 + w * a), ...at(s + w * b, t0 + w * b)]);
      }
    }
    if (pattern === 'wood') {   // parquet: grain along the cut
      for (let i = 1; i < 3; i++) fine.push([...at(s0, t0 + w * i / 3), ...at(s1, t0 + w * i / 3)]);
    }
    if (pattern === 'rigid') {   // rigid insulation board: a diagonal hatch
      for (let s = s0; s < s1 - w; s += w * 0.8) fine.push([...at(s, t1), ...at(s + w, t0)]);
    }
    if (pattern === 'screed') {   // screed with the underfloor heating pipes in it, 150 mm apart
      for (let i = 0; i < (s1 - s0) * w * 2500; i++) {
        const s = s0 + rnd() * (s1 - s0), t = t0 + rnd() * w;
        fine.push([...at(s, t), ...at(s + 0.002, t + 0.001)]);
      }
      const r = 0.009, tc = t0 + w * 0.6;
      for (let s = s0 + 0.075; s < s1 - r; s += 0.15) fine.push(...circle(r, 12, (p, q) => at(s + p, tc + q)));
    }
    if (pattern === 'concrete') {   // aggregate: dots and a few small triangles
      for (let i = 0; i < (s1 - s0) * w * 9000; i++) {
        const s = s0 + rnd() * (s1 - s0), t = t0 + rnd() * w;
        if (rnd() < 0.12) fine.push(...poly([at(s, t), at(s + 0.006, t), at(s + 0.003, t + 0.005), at(s, t)]));
        else fine.push([...at(s, t), ...at(s + 0.0025, t + 0.0015)]);
      }
    }
    t0 = t1;
  }
  // Its own outline is fine: where two cuts meet it is a change of material, not an edge.
  const outline = poly([at(s0, 0), at(s1, 0), at(s1, total), at(s0, total), at(s0, 0)]);
  return group(texture('section', lines(fine, 3)), lines(edges, 2), lines(outline, 2));
}

// The outline of a union of rectangles in one plane, as segments: a grid of all their
// coordinates, and an edge wherever a covered cell meets an uncovered one.
export function unionOutline(rects) {   // rects: [u0, u1, v0, v1]
  const us = [...new Set(rects.flatMap((r) => [r[0], r[1]].map((x) => +x.toFixed(4))))].sort((p, q) => p - q);
  const vs = [...new Set(rects.flatMap((r) => [r[2], r[3]].map((x) => +x.toFixed(4))))].sort((p, q) => p - q);
  const covered = (i, j) => i >= 0 && j >= 0 && i < us.length - 1 && j < vs.length - 1 && rects.some((r) =>
    r[0] - 1e-4 <= us[i] && us[i + 1] <= r[1] + 1e-4 && r[2] - 1e-4 <= vs[j] && vs[j + 1] <= r[3] + 1e-4);
  const segs = [];
  for (let i = 0; i < us.length; i++) for (let j = 0; j < vs.length - 1; j++)
    if (covered(i - 1, j) !== covered(i, j)) segs.push([us[i], vs[j], us[i], vs[j + 1]]);
  for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length - 1; i++)
    if (covered(i, j - 1) !== covered(i, j)) segs.push([us[i], vs[j], us[i + 1], vs[j]]);
  return segs;
}

// Floorboards: joints between boards, staggered end joints, and dashes for the grain.
export function floorboards(x0, x1, z0, z1, y, seed) {
  const rnd = random(seed), joints = [], grain = [], boardW = 0.14;
  for (let x = x0; x < x1; x += boardW) {
    const right = Math.min(x + boardW, x1);
    if (x > x0) joints.push([x, y, z0, x, y, z1]);
    for (let z = z0 + rnd() * 1.4; z < z1; z += 1.1 + rnd() * 0.8) joints.push([x, y, z, right, y, z]);
    for (let i = 0; i < (z1 - z0) * 50; i++) {
      const gx = x + 0.01 + rnd() * (right - x - 0.02), gz = z0 + rnd() * (z1 - z0), len = 0.015 + rnd() ** 2 * 0.11;
      grain.push([gx, y, gz, gx, y, Math.min(gz + len, z1)]);
    }
  }
  return texture('floor', group(lines(joints, 2), lines(grain, 3)));
}

// Wood grain on a flat top: lines that wander along x and swing round a few knots.
export function woodGrain(x0, x1, z0, z1, y, seed) {
  const rnd = random(seed), segs = [];
  const knots = Array.from({ length: 3 }, () => [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)]);
  for (let z = z0 + 0.008; z < z1; z += 0.011 + rnd() * 0.006) {
    const phase = rnd() * 6, pts = [];
    for (let i = 0; i <= 80; i++) {
      const x = x0 + (x1 - x0) * i / 80;
      let dz = 0.004 * Math.sin(x * 7 + phase) + 0.002 * Math.sin(x * 23 + phase * 2);
      for (const [kx, kz] of knots) dz += 0.03 * Math.sign(z - kz) * Math.exp(-(((x - kx) / 0.07) ** 2 + ((z - kz) / 0.03) ** 2));
      const zz = z + dz;
      if (zz > z0 && zz < z1) pts.push([x, y, zz]);
      else if (pts.length > 1) { segs.push(...poly(pts)); pts.length = 0; }
    }
    if (pts.length > 1) segs.push(...poly(pts));
  }
  return texture('grain', lines(segs, 3));
}

// 0009: a braided jute rug, as in IMG_8454: rows of chevron stitches along x, each row
// pointing the other way, like the plaits of the braid lying side by side.
export function juteWeave(x0, x1, z0, z1, y, seed) {
  const rnd = random(seed), segs = [], row = 0.018, step = 0.014;
  for (let z = z0 + row / 2, k = 0; z < z1 - row / 2; z += row, k++) {
    const dir = k % 2 ? 1 : -1;
    for (let x = x0 + rnd() * step; x < x1 - step; x += step * (0.9 + rnd() * 0.2)) {
      const j = () => (rnd() - 0.5) * 0.002, xa = dir > 0 ? x : x + step, tip = dir > 0 ? x + step : x;
      segs.push([xa + j(), y, z - row * 0.42, tip, y, z + j()], [tip, y, z, xa + j(), y, z + row * 0.42]);
    }
  }
  return texture('rug', lines(segs, 3));
}

// Concrete: a stipple of very short strokes on every face of `mesh` that stands upright
// and faces the viewer, about `density` strokes per square metre.
export function stippleFaces(mesh, density, seed) {
  const rnd = random(seed), segs = [], geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.attributes.position, p = [0, 1, 2].map(() => new THREE.Vector3());
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < pos.count; i += 3) {
    p.forEach((v, k) => v.fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld));
    const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
    const area = n.length() / 2;
    if (area < 1e-8) continue;
    n.normalize();
    if (Math.abs(n.y) > 0.1 || n.dot(VIEW_DIR) <= 0) continue;
    const along = Y.clone().cross(n).normalize().add(Y).multiplyScalar(0.003);   // a tiny slant in the face
    for (let k = 0; k < area * density; k++) {
      let a = rnd(), b = rnd();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const q = p[0].clone().addScaledVector(p[1].clone().sub(p[0]), a).addScaledVector(p[2].clone().sub(p[0]), b).addScaledVector(n, 0.0015);
      segs.push([...q.toArray(), ...q.clone().add(along).toArray()]);
    }
  }
  return texture('concrete', lines(segs));
}

// ---- The line style --------------------------------------------------------------------

// Every mesh gets a paper fill, which hides what is behind it. Then each edge is sorted by
// the view direction: an edge between a face turned to the viewer and a face turned away is
// an outline, heavy. An edge between two visible faces meeting at more than 30 degrees is an
// inner edge, one weight lighter. Curved surfaces get a true outline this way, with no facet
// lines. Everything lands in one merged line object per weight.
const CREASE = Math.cos(THREE.MathUtils.degToRad(30)), SMOOTH = Math.cos(THREE.MathUtils.degToRad(8));
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

// 0019: which faces meet at each edge of a mesh does not depend on where it is seen from, so it
// is worked out once per mesh and place, and kept; each view (the isometric one, each clicked
// object's straight-on one) then only sorts the edges. Working it out every time froze the
// page for 1.4-3.1 s per view. Returns { open: [p q]..., pairs: [p q n1 n2]... } as flat arrays.
const topologies = new WeakMap();
function topology(mesh) {
  const place = mesh.matrixWorld.elements.join();
  const known = topologies.get(mesh);
  if (known?.place === place && known.geometry === mesh.geometry) return known;
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geo.attributes.position, m = mesh.matrixWorld;
  // Each corner is numbered once (corners closer than 0.1 mm are one), then an edge is the pair
  // of its corners' numbers: far quicker than a text key per edge end.
  const corner = new Map(), at = [];
  const cornerOf = (v) => {
    const key = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let k = corner.get(key);
    if (k === undefined) { k = at.length / 3; corner.set(key, k); at.push(v.x, v.y, v.z); }
    return k;
  };
  const edges = new Map(), normals = [], ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i).applyMatrix4(m);
    b.fromBufferAttribute(pos, i + 1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i + 2).applyMatrix4(m);
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    if (n.lengthSq() < 1e-16) continue;
    n.normalize();
    const f = normals.length / 3;
    normals.push(n.x, n.y, n.z);
    const k = [cornerOf(a), cornerOf(b), cornerOf(c)];
    for (const [p, q] of [[k[0], k[1]], [k[1], k[2]], [k[2], k[0]]]) {
      const key = p < q ? p * 67108864 + q : q * 67108864 + p;
      const e = edges.get(key);
      if (!e) edges.set(key, [p, q, f, -1]);
      else if (e[3] < 0) e[3] = f;   // only the first two faces at an edge count, as before
    }
  }
  // Edges lying in one of this mesh's cut planes are left out: the cut draws them.
  // 0013: a cut [axis, v, axis2, v2] is a line, where two planes meet: a seam between two
  // pieces of one face (the facade brick in front of the column), not drawn either.
  const cuts = mesh.userData.cuts ?? [];
  const on = (p, q, axis, v) => Math.abs(at[p * 3 + axis] - v) < 1e-4 && Math.abs(at[q * 3 + axis] - v) < 1e-4;
  const inCut = (p, q) => cuts.some(([axis, v, axis2, v2]) => on(p, q, axis, v) && (axis2 === undefined || on(p, q, axis2, v2)));
  const open = [], pairs = [];
  for (const [p, q, f1, f2] of edges.values()) {
    if (cuts.length && inCut(p, q)) continue;
    const ends = [at[p * 3], at[p * 3 + 1], at[p * 3 + 2], at[q * 3], at[q * 3 + 1], at[q * 3 + 2]];
    if (f2 < 0) open.push(...ends);
    else pairs.push(...ends, normals[f1 * 3], normals[f1 * 3 + 1], normals[f1 * 3 + 2], normals[f2 * 3], normals[f2 * 3 + 1], normals[f2 * 3 + 2]);
  }
  const made = { place, geometry: mesh.geometry, open: new Float64Array(open), pairs: new Float64Array(pairs) };
  topologies.set(mesh, made);
  return made;
}

// 0014: `view` is the direction the drawing is seen from: the isometric one, or a clicked
// object's straight-on one (the site works out a second set of lines for it).
export function makeInk(view = VIEW_DIR) {
  // One bucket per look (colour and width), so objects with the same style share a draw call.
  const buckets = new Map();
  const used = { tiers: new Set(), textures: new Set(), mats: new Set() };   // what the bench offers controls for
  let ghost = false;   // while true, every line goes pale (the greyed-out context on the bench)
  let st = {};         // the style of the object being drawn
  const paper = new THREE.Color(PAPER);
  function push(t, p, q, kind = null) {
    t = ghost ? FAINT : t >= CUT ? t : Math.min(t, 3);
    let width = ghost ? WEIGHTS[FAINT] : weightOf(st, t), color = COLORS[t];
    if (!ghost) used.tiers.add(t);
    if (kind && !ghost) {
      used.textures.add(kind);
      const strength = st[`tex_${kind}`] ?? TEXTURES[kind]?.[1] ?? 1;
      if (strength <= 0) return;
      width *= st[`texw_${kind}`] ?? 1;
      color = new THREE.Color(color).lerp(paper, 1 - strength).getHex();
    }
    if (width <= 0) return;
    const key = `${color}|${width}`;
    if (!buckets.has(key)) buckets.set(key, { color, width, positions: [] });
    buckets.get(key).positions.push(...p, ...q);
  }

  function edgesOf(mesh, t) {
    if (mesh.userData.noEdges) return;   // 0017: its outlines come with it (the city's buildings)
    const { open, pairs } = topology(mesh), vx = view.x, vy = view.y, vz = view.z;
    for (let i = 0; i < open.length; i += 6) push(t, open.subarray(i, i + 3), open.subarray(i + 3, i + 6));   // open edge of a flat shape
    for (let i = 0; i < pairs.length; i += 12) {
      const e = pairs, d1 = e[i + 6] * vx + e[i + 7] * vy + e[i + 8] * vz, d2 = e[i + 9] * vx + e[i + 10] * vy + e[i + 11] * vz;
      const f1 = d1 > 0, f2 = d2 > 0, n12 = e[i + 6] * e[i + 9] + e[i + 7] * e[i + 10] + e[i + 8] * e[i + 11];
      const p = e.subarray(i, i + 3), q = e.subarray(i + 3, i + 6);
      // 0014 (desk chair note 5): on a smooth surface (userData.smooth) two faces that turn
      // less than 8 degrees are no outline, even where one tips away: seen almost edge-on,
      // that drew a zigzag across the chair's seat.
      if (f1 !== f2 && !(mesh.userData.smooth && n12 > SMOOTH)) push(t, p, q);
      else if (f1 && !mesh.userData.outlineOnly && n12 < CREASE) push(Math.min(t + 1, 3), p, q);   // never into CUT
    }
  }

  // Styles everything under root and collects its lines. Returns the meshes, for picking.
  // With `pale`, it is drawn as context: pale lines and fills, nothing to pick.
  // With `linesOnly` (0014), it only collects the lines of what is already styled.
  function lineify(root, item = null, pale = false, linesOnly = false) {
    const meshes = [];
    ghost = pale;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      st = pale ? {} : styleOf(o);
      if (o.userData.segs && !pale) {   // context is drawn without its textures
        const kind = o.userData.texture ?? o.parent?.userData.texture;
        for (const s of o.userData.segs) {
          push(o.userData.tier, a.set(s[0], s[1], s[2]).applyMatrix4(o.matrixWorld).toArray(),
               b.set(s[3], s[4], s[5]).applyMatrix4(o.matrixWorld).toArray(), kind);
        }
      }
      if (!o.isMesh || o.userData.plain) return;
      if (linesOnly) return edgesOf(o, o.userData.tier ?? 3);
      meshes.push(o);
      const mat = matOf(o, st);
      if (!pale) used.mats.add(mat);
      o.userData.light = new THREE.Color(colourOf(mat)).getHex();   // 0014: the day colour; drawn in fill() of it
      if (pale) o.userData.light = new THREE.Color(o.userData.light).lerp(new THREE.Color(PAPER), 0.6).getHex();
      o.userData.tone = fill(o.userData.light);
      const see = o.userData.see;   // glass: a light tint you can see through
      const opacity = see ? 0.35 : st.opacity ?? 1;
      o.material = new THREE.MeshLambertMaterial({
        color: o.userData.tone, side: THREE.DoubleSide,
        transparent: opacity < 1, opacity, depthWrite: opacity === 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        // Closed solids cast from their back faces: the lit front never shades itself, so the
        // shadow needs almost no offset and starts right where the object touches.
        // A leaf (o.userData.sheet) has no back to cast from, so both sides cast.
        shadowSide: o.userData.sheet || o.geometry.type === 'ShapeGeometry' ? THREE.DoubleSide : THREE.BackSide,
      });
      o.castShadow = !o.userData.noShadow;
      o.receiveShadow = true;
      o.userData.item = item;
      if (o.userData.tier === undefined) {
        const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().sort((p, q) => p - q);
        o.userData.tier = tierOf(size[1]);
      }
      edgesOf(o, o.userData.tier);
    });
    ghost = false;
    return pale ? [] : meshes;
  }

  // One merged line object per weight, in a group. Clears the buckets.
  function drawLines() {
    const out = new THREE.Group();
    for (const { color, width, positions } of buckets.values()) {
      const geometry = new LineSegmentsGeometry().setPositions(positions);
      const object = new LineSegments2(geometry, new LineMaterial({ color: line(color), linewidth: width }));
      object.userData.light = color;   // 0014
      object.frustumCulled = false;
      out.add(object);
    }
    buckets.clear();
    return out;
  }
  return { lineify, drawLines, used };
}

// ---- Light -----------------------------------------------------------------------------

// An even sky light for the tones in shade, and a sun that casts the shadows. Three.js
// divides light by pi, so an ambient of pi gives each tone exactly in shade.
// 0005: SHADE back to 1, so the room in shade shows its own light tones.
export const SHADE = 1.0, SUN = 0.95 * Math.PI;
export function makeLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, SHADE * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0;
  scene.add(sun, sun.target);
  return sun;
}
// Fit the shadow map tightly round a box, seen from the sun, so each texel is as small as
// it can be and the shadow outlines stay sharp.
export function fitSun(sun, box3) {
  sun.target.position.copy(box3.getCenter(new THREE.Vector3()));
  sun.position.copy(SUN_DIR).multiplyScalar(6).add(sun.target.position);
  sun.target.updateMatrixWorld();
  const toSun = new THREE.Matrix4().lookAt(sun.position, sun.target.position, Y).setPosition(sun.position).invert();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate(), p = new THREE.Vector3();
  for (const x of [box3.min.x, box3.max.x]) for (const y of [box3.min.y, box3.max.y]) for (const z of [box3.min.z, box3.max.z]) {
    p.set(x, y, z).applyMatrix4(toSun);
    lo.min(p); hi.max(p);
  }
  Object.assign(sun.shadow.camera, { left: lo.x, right: hi.x, bottom: lo.y, top: hi.y, near: -hi.z - 0.1, far: -lo.z + 0.1 });
  sun.shadow.camera.updateProjectionMatrix();
}
