// The objects that are detailed one at a time on the bench (bench.html) and placed in the
// scene (index.html). Each one is made the same way on both pages:
//   1. Its settings come from bench/<id>.json, saved by the bench, or from the defaults.
//   2. If models/<id>.3dm has been saved by Rhino (every part has a render mesh), it is used.
//   3. Otherwise the object comes from code (the room shell, the furniture and plants) or
//      from its .obj (the desk, the speaker and the 3D prints).
// 0008: every object also carries its own look (colour, opacity, line weights, textures) in
// its settings; see the style keys in lib/draw.js.
import * as THREE from 'three';
import { as, group, lines, woodGrain, COLOURS } from '../lib/draw.js';
import { readObj, pieces, merge } from '../lib/models.js';
import * as shell from './room-shell.js';
import { FURNITURE } from './furniture.js';
import { DESK_THINGS } from './desk-things.js';

export const DESK_TOP = 0.74;   // Desk.obj: 740 mm

const place = [
  { key: 'x', label: 'Position x (out from the window wall)', min: -1, max: 2, step: 0.005 },
  { key: 'z', label: 'Position z (along the window wall)', min: -0.6, max: 2.4, step: 0.005 },
  { key: 'rot', label: 'Turn (degrees)', min: -180, max: 180, step: 1 },
];
const withPlace = (x, z, extra = []) => [...place.map((p) => ({ ...p, value: { x, z, rot: 0 }[p.key] })), ...extra];
const standsAt = { key: 'y', label: 'Height it stands at', value: DESK_TOP, min: 0, max: 2.5, step: 0.005 };
// A 3D print: placed by its corner nearest the window and the wall, scaled so its longest
// side (in plan) is the real size you measured.
const aPrint = (x, z, long) => withPlace(x, z, [standsAt, { key: 'long', label: 'Longest side in plan, real (mm)', value: long, min: 40, max: 300, step: 1 }]);

export const OBJECTS = {
  'room-shell': {
    title: 'Room shell',
    params: shell.PARAMS,
    file: 'models/room-shell.3dm',
  },
  desk: {
    title: 'Desk',
    params: withPlace(-0.72, -0.395),   // x: the end by the window; z: the back edge. 0008: your saved place
    file: 'models/desk.3dm',
    obj: 'models/desk.obj',
    note: 'Your Desk.obj, 1400 x 820 x 740 mm. Position is its back corner by the window.',
  },
  speaker: {
    title: 'Speaker',
    params: withPlace(-0.11, -0.17, [standsAt]),
    file: 'models/speaker.3dm',
    obj: 'models/speaker.obj',
    note: 'Sony SRS-XB100. Your Speaker.obj, scaled to the official 76 mm footprint (86 mm tall), remeshed at 1 mm and cut from 161,276 to 8,557 faces.',
  },
  // 0007: your two prints. The dark stack in the right corner of the desk, and the pale wide
  // one under the monitor's screen, right of its foot (IMG_8439).
  'print-15': {
    title: '3D print Demo-15 (dark)',
    params: aPrint(0.495, -0.085, 180),   // 0008: your saved place and size
    file: 'models/print-15.3dm',
    obj: 'models/print-15.obj',
    mat: 'dark',
    note: 'Your Demo-15.stl, 18 cm on its longest side in plan (your bench setting): 180 x 176 x 156 mm. Flat faces merged, 96,708 to 67,894 triangles.',
  },
  'print-wide': {
    title: '3D print Demo-Wide-1 (pale)',
    params: aPrint(0.405, -0.268, 150),
    file: 'models/print-wide.3dm',
    obj: 'models/print-wide.obj',
    mat: 'white',
    note: 'Your Demo-Wide-1.stl, 15 cm on its longest side: 150 x 72 x 89 mm. Flat faces merged, 99,900 to 71,227 triangles.',
  },
  // 0008: the furniture and plants, built from code (objects/furniture.js).
  ...Object.fromEntries(Object.entries(FURNITURE).map(([key, def]) => [key, { ...def, file: `models/${key}.3dm` }])),
  // 0011: the desk things and the things on the sill (objects/desk-things.js).
  ...Object.fromEntries(Object.entries(DESK_THINGS).map(([key, def]) => [key, { ...def, file: `models/${key}.3dm` }])),
};

// 0014: how close the site's camera comes when this object is clicked, as the share of the
// free part of the window its face fills. On the three objects the clicks fly to.
const CLOSE = { key: 'close', label: 'Camera on the site: how close it comes when clicked (share of the view it fills)', value: 0.6, min: 0.15, max: 1, step: 0.01, unit: '%' };
// 0015: the prints are small, so 60% of the view was too close; they start further back.
for (const k of ['monitor', 'print-15', 'cabinet']) OBJECTS[k].params = [...OBJECTS[k].params, { ...CLOSE, value: k === 'print-15' ? 0.35 : 0.6 }];

export const defaults = (id) => Object.fromEntries(OBJECTS[id].params.map((p) => [p.key, p.value]));

// What the bench saved: { settings, notes }. Missing file or keys fall back to defaults.
// 0019: each file is fetched once per page (it was 20 times for the room shell); a copy is
// handed out, so a caller can change its settings freely. The bench forgets one after saving it.
const savedFiles = new Map();
export const forget = (id) => savedFiles.delete(id);
export async function saved(id) {
  if (!savedFiles.has(id)) savedFiles.set(id, fetch(`bench/${id}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const data = structuredClone(await savedFiles.get(id));
  return { ...data, settings: { ...defaults(id), ...data.settings }, notes: data.notes ?? [] };
}

// 0013: the scene's material colours (bench/materials.json) into COLOURS, once per page.
let coloursLoaded;
export const colours = () => coloursLoaded ??= fetch('bench/materials.json')
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => Object.assign(COLOURS, d.colours));

// Makes object `id` with settings `s`. Returns { root, source } where source says where the
// geometry came from, in words, for the bench.
// 0019: the code and the bench's settings are the master; the .3dm files are only an export
// (the bench's Export button), never read back. So no page loads rhino3dm.js to draw.
export async function make(id, s) {
  await colours();
  const def = OBJECTS[id];
  let model = null, source = 'code, from the settings', root;
  if (id === 'room-shell') {
    const built = shell.build(s);
    root = group(built, shell.decorate(built, s));
  } else if (def.build) {
    // Made in its own frame, then placed.
    // 0009: a build may be async (the sill planter is read from a file) and gets the
    // cabinet too (the money plant stands on it).
    const ctx = { shell: (await saved('room-shell')).settings, cabinet: (await saved('cabinet')).settings };
    root = group(await def.build(s, ctx));
    root.position.set(s.x, s.y ?? 0, s.z); root.rotation.y = THREE.MathUtils.degToRad(s.rot);
    if (def.on) { root = group(root); root.applyMatrix4(await frameOn(def.on)); }   // 0011: on the desk, the stand
  } else if (!(model = await readObj(def.obj))) throw new Error(`No model for ${id}`);
  else { source = def.obj; root = id === 'desk' ? desk(model.root, s) : id === 'speaker' ? speaker(model.root, s) : print(model.root, s, def.mat); }
  root.userData.style = s;   // the style keys in the settings: see lib/draw.js
  return { root, source };
}

// 0011: the frame of what a thing stands on (the desk, the laptop stand): its place and turn as
// saved, at its top (the desk top for the desk, its own height for the rest). Things on
// things on the desk chain through.
export async function frameOn(id) {
  const s = (await saved(id)).settings, def = OBJECTS[id];
  const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x, (s.y ?? 0) + (id === 'desk' ? DESK_TOP : 0), s.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(s.rot ?? 0)), new THREE.Vector3(1, 1, 1));
  return def.on ? (await frameOn(def.on)).multiply(m) : m;
}

// What an object stands in, for the bench: the room shell and, since 0010, every other
// object where it is saved, drawn greyed out so the object can be placed among them.
// One that fails to build is left out.
export async function context(id) {
  const s = (await saved('room-shell')).settings, parts = [shell.build(s)];
  const others = Object.keys(OBJECTS).filter((k) => k !== id && k !== 'room-shell');
  for (const made of await Promise.all(others.map((k) => saved(k).then((d) => make(k, d.settings)).catch((e) => console.warn(k, e))))) {
    if (made) parts.push(made.root);
  }
  return { root: group(...parts), shell: s };
}

// Moves a model so its bounding box starts at the origin (or centres it in x and z), then
// places and turns it by its settings.
function settle(root, s, centre, y = 0) {
  const bb = new THREE.Box3().setFromObject(root), c = bb.getCenter(new THREE.Vector3());
  const inner = group(...root.children.slice());
  inner.position.set(-(centre ? c.x : bb.min.x), -bb.min.y, -(centre ? c.z : bb.min.z));
  const outer = group(inner);
  outer.position.set(s.x, y, s.z);
  outer.rotation.y = THREE.MathUtils.degToRad(s.rot);
  return outer;
}

// The desk: the top is the piece that reaches highest and is widest, drawn as plywood with
// grain on top and its layers on the visible edges. Everything else is the metal frame.
function desk(root, s) {
  const all = [];
  root.traverse((o) => o.isMesh && all.push(...pieces(o)));
  const score = (m) => { const b = new THREE.Box3().setFromObject(m); return b.max.y * 10 + (b.max.x - b.min.x) * (b.max.z - b.min.z); };
  all.sort((p, q) => score(q) - score(p));
  const top = all[0], frame = merge(all.slice(1));
  const t = new THREE.Box3().setFromObject(top), h = t.max.y - t.min.y, y = t.max.y;
  const deco = [
    woodGrain(t.min.x, t.max.x, t.min.z, t.max.z, y + 0.0006, 15),
    lines([1 / 3, 2 / 3].flatMap((k) => [
      [t.min.x, y - h * k, t.max.z + 0.0005, t.max.x, y - h * k, t.max.z + 0.0005],
      [t.max.x + 0.0005, y - h * k, t.min.z, t.max.x + 0.0005, y - h * k, t.max.z],
    ])),
  ];
  top.userData.tier = 1;
  frame.userData.tier = 1;
  top.userData.layer = 'Desk top';
  frame.userData.layer = 'Desk frame';
  return settle(group(as('wood', top), as('metal', frame), ...deco), s, false);
}

// A 3D print, at its real size. Every piece tints on hover on the site. Outlines only, at
// the finest weight: its thousands of small steps would otherwise ink it solid black.
function print(root, s, mat) {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.scale.setScalar(s.long / 1000 / Math.max(size.x, size.z));
  root.traverse((o) => o.isMesh && (as(mat, o), o.userData.tier = 3, o.userData.outlineOnly = true, o.userData.hot = true, o.userData.layer = 'Print'));
  return settle(group(root), s, false, s.y);
}

// The speaker: its body dark, the 'Lines' material (the grille rings) mid grey.
function speaker(root, s) {
  root.traverse((o) => o.isMesh && as(/line/i.test(o.userData.layer) ? 'metal' : 'dark', o));
  root.traverse((o) => o.isMesh && (o.userData.tier = 2, o.userData.layer = `Speaker ${o.userData.layer || ''}`.trim()));
  return settle(root, s, true, s.y);
}
