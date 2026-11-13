// Reading and writing model files: .3dm (Rhino) through rhino3dm.js, and .obj.
// Model files are in Rhino's frame: millimetres, z up. The scene is metres, y up.
// scene (x, y, z) = rhino (x, z, -y) / 1000
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { lines } from './draw.js';

export const FROM_RHINO = new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001));
export const TO_RHINO = FROM_RHINO.clone().invert();

let rhinoReady = null;
export function rhino() {   // rhino3dm.js from the CDN, loaded once, only when a .3dm is touched
  rhinoReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/rhino3dm.min.js';
    s.onload = () => window.rhino3dm().then(resolve, reject);
    s.onerror = () => reject(new Error('rhino3dm.js did not load'));
    document.head.append(s);
  });
  return rhinoReady;
}

// Reads a .3dm into scene coordinates. Each mesh and line keeps its Rhino layer name in
// userData.layer. A Brep that has never been shown shaded in Rhino has no render mesh, and
// rhino3dm.js cannot mesh NURBS itself; those are counted in `unmeshed` and left out.
// Returns null if there is no file.
export async function read3dm(url) {
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const rh = await rhino();
  const doc = rh.File3dm.fromByteArray(new Uint8Array(await res.arrayBuffer()));
  const layerNames = Array.from({ length: doc.layers().count }, (_, i) => doc.layers().get(i).name);
  const root = new THREE.Group(), parse = new THREE.BufferGeometryLoader();
  let unmeshed = 0, count = 0;
  const T = rh.ObjectType;
  for (let i = 0; i < doc.objects().count; i++) {
    const obj = doc.objects().get(i), g = obj.geometry(), layer = layerNames[obj.attributes().layerIndex] ?? '';
    count++;
    let meshes = [];
    if (g.objectType === T.Mesh) meshes = [g];
    else if (g.objectType === T.Extrusion) meshes = [g.getMesh(rh.MeshType.Any)];
    else if (g.objectType === T.Brep) meshes = Array.from({ length: g.faces().count }, (_, k) => g.faces().get(k).getMesh(rh.MeshType.Any));
    else if (g.objectType === T.Curve) {
      const [t0, t1] = g.domain, n = g.degree === 1 ? Math.max(1, (g.pointCount ?? 2) - 1) : 24;
      const pts = Array.from({ length: n + 1 }, (_, k) => new THREE.Vector3(...g.pointAt(t0 + (t1 - t0) * k / n)).applyMatrix4(FROM_RHINO).toArray());
      const l = lines(pts.slice(1).map((p, k) => [...pts[k], ...p]));
      l.userData.layer = layer;
      root.add(l);
      continue;
    } else continue;
    if (meshes.some((m) => !m)) { unmeshed++; continue; }
    for (const m of meshes) {
      let geometry = parse.parse(m.toThreejsJSON());
      if (geometry.index) geometry = geometry.toNonIndexed();   // pieces() and the desk expect plain triangles
      geometry.applyMatrix4(FROM_RHINO);
      const mesh = new THREE.Mesh(geometry);
      mesh.userData.layer = layer;
      root.add(mesh);
    }
  }
  return { root, count, unmeshed, editedBy: doc.lastEditedBy };
}

// A mesh's world matrix, moved into Rhino's frame, as a rhino3dm Transform.
function rhinoTransform(rh, matrix) {
  const m = TO_RHINO.clone().multiply(matrix).elements, t = new rh.Transform(1);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) t[`m${r}${c}`] = m[c * 4 + r];
  return t;
}

// A closed outline [[u, v], ...] as a polyline curve in the xy plane, counter-clockwise, so
// an extrusion of it runs along +z as three's ExtrudeGeometry does.
function outline(rh, pts, ccw = true) {
  const area = pts.reduce((s, [u, v], i) => { const [u2, v2] = pts[(i + 1) % pts.length]; return s + u * v2 - u2 * v; }, 0);
  const ring = (area > 0) === ccw ? [...pts] : [...pts].reverse();
  const pl = new rh.Polyline(ring.length + 1);
  for (const [u, v] of [...ring, ring[0]]) pl.add(u, v, 0);
  return pl.toPolylineCurve();
}

// 0013: a NURBS surface on rows of control points (cubic where there are enough points,
// clamped). With `weights`, each row is a rational quadratic circle of 9 points.
function surface(rh, rows, weights) {
  const nu = rows[0].length, nv = rows.length;
  const s = rh.NurbsSurface.create(3, !!weights, weights ? 3 : Math.min(4, nu), Math.min(4, nv), nu, nv);
  rows.forEach((row, j) => row.forEach(([x, y, z], i) => { const w = weights?.[i] ?? 1; s.points().set(i, j, [x * w, y * w, z * w, w]); }));
  if (weights) [0, 0, 1, 1, 2, 2, 3, 3, 4, 4].forEach((k, i) => s.knotsU().set(i, k)); else s.knotsU().createUniformKnots(1);
  s.knotsV().createUniformKnots(1);
  return rh.Brep.createFromSurface(s);
}
const W = Math.SQRT1_2, CIRCLE = [[1, 0, 1], [1, 1, W], [0, 1, 1], [-1, 1, W], [-1, 0, 1], [-1, -1, W], [0, -1, 1], [1, -1, W], [1, 0, 1]];
// A tube as a NURBS pipe: a true circle round three's own path and frames, closed at both ends.
function pipe(rh, g) {
  const { path, tubularSegments: n, radius: r, closed } = g.parameters, fr = path.computeFrenetFrames(n, closed);
  const rows = Array.from({ length: n + 1 }, (_, i) => {
    const c = path.getPointAt(i / n);
    return CIRCLE.map(([a, b]) => c.clone().addScaledVector(fr.normals[i], r * a).addScaledVector(fr.binormals[i], r * b).toArray());
  });
  if (!closed) rows.unshift(rows[0].map(() => path.getPointAt(0).toArray())), rows.push(rows[0].map(() => path.getPointAt(1).toArray()));
  return surface(rh, rows, CIRCLE.map((c) => c[2]));
}
// A mesh made as a grid, `u` points to a row, as its positions run (leaves, the sphere and torus).
const gridRows = (pos, u) => Array.from({ length: pos.count / u }, (_, j) => Array.from({ length: u }, (_, i) => [pos.getX(j * u + i), pos.getY(j * u + i), pos.getZ(j * u + i)]));

// Writes every mesh that knows its NURBS form as a Brep or Extrusion: box, cylinder,
// sphere, `rev` (a profile turned round the axis: pots) and `extrusion` (an outline with
// holes, pushed through: the window wall). Any other mesh goes as a Rhino mesh. Lines on a
// layer go as polylines, joined end to end; textures are left out. Returns the bytes of a
// .3dm in millimetres and how many parts went each way.
export async function write3dm(root, meta = {}) {
  const rh = await rhino();
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  doc.applicationName = 'Desk model bench';
  for (const [k, v] of Object.entries(meta)) doc.strings()?.set?.(k, String(v));
  const layers = new Map();
  const layerOf = (name = 'Default') => {
    if (!layers.has(name)) {
      const l = new rh.Layer();
      l.name = name;
      layers.set(name, doc.layers().add(l));
    }
    const at = new rh.ObjectAttributes();
    at.layerIndex = layers.get(name);
    return at;
  };
  root.updateMatrixWorld(true);
  const count = { nurbs: 0, meshes: 0, curves: 0 };
  const layerUp = (o) => { for (let p = o; p; p = p.parent) if (p.userData.layer) return p.userData.layer; };
  root.traverse((o) => {
    const layer = layerUp(o);
    if (o.userData.segs) {
      if (!layer || o.userData.texture || o.parent?.userData.texture) return;
      const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld).applyMatrix4(TO_RHINO).toArray();
      let run = [];
      const flush = () => {
        if (run.length < 2) return;
        const pl = new rh.Polyline(run.length);
        for (const p of run) pl.add(...p);
        doc.objects().add(pl.toPolylineCurve(), layerOf(layer));
        count.curves++;
      };
      for (const s of o.userData.segs) {   // a segment that starts where the last ended carries on
        const p = P(s[0], s[1], s[2]), q = P(s[3], s[4], s[5]), last = run.at(-1);
        if (!last || Math.hypot(last[0] - p[0], last[1] - p[1], last[2] - p[2]) > 1e-3) { flush(); run = [p]; }
        run.push(q);
      }
      flush();
      return;
    }
    if (!o.isMesh || o.userData.plain) return;
    const n = o.userData.nurbs;
    let brep = null, local = new THREE.Matrix4();
    // rhino3dm's solids of revolution stand on z; the meshes' stand on y.
    const upright = (dy = 0) => local.set(1, 0, 0, 0, 0, 0, 1, dy, 0, -1, 0, 0, 0, 0, 0, 1);
    if (n?.type === 'box') {
      const [w, h, d] = n.size;
      brep = rh.Brep.createFromBox(new rh.Box(new rh.BoundingBox([-w / 2, -h / 2, -d / 2], [w / 2, h / 2, d / 2])));
    } else if (n?.type === 'cylinder') {
      brep = rh.Brep.createFromCylinder(new rh.Cylinder(new rh.Circle(n.r), n.h), true, true);
      upright(-n.h / 2);   // it stands from 0 to h; the mesh is centred
    } else if (n?.type === 'sphere') {
      brep = rh.Brep.createFromSphere(new rh.Sphere([0, 0, 0], n.r));
    } else if (n?.type === 'rev') {
      const pl = new rh.Polyline(n.profile.length);
      for (const [r, y] of n.profile) pl.add(r, 0, y);
      brep = rh.Brep.createFromRevSurface(rh.RevSurface.create(pl.toPolylineCurve(), new rh.Line([0, 0, 0], [0, 0, 1]), 0, 2 * Math.PI), false, false);
      upright();
    } else if (n?.type === 'extrusion') {
      brep = rh.Extrusion.create(outline(rh, n.outer), n.depth, true);
      for (const h of n.holes ?? []) brep.addInnerProfile(outline(rh, h));
    } else if (n?.type === 'grid') {
      brep = surface(rh, n.rows ?? gridRows(o.geometry.attributes.position, n.u));
    } else if (o.geometry.type === 'TubeGeometry') {
      brep = pipe(rh, o.geometry);
    } else if (o.geometry.type === 'SphereGeometry' || o.geometry.type === 'TorusGeometry') {
      const gp = o.geometry.parameters;
      brep = surface(rh, gridRows(o.geometry.attributes.position, (gp.widthSegments ?? gp.tubularSegments) + 1));
    }
    if (brep) {
      brep.transform(rhinoTransform(rh, o.matrixWorld.clone().multiply(local)));
      doc.objects().add(brep, layerOf(layer));
      count.nurbs++;
      return;
    }
    // No NURBS form: the triangles themselves, welded so Rhino sees one surface.
    // Placed and scaled to mm here, still y up: Mesh.createFromThreejsJSON turns y up into z up
    // itself, so a Rhino transform after it turned the meshes twice (the desk chair's legs, 0013).
    const g = mergeVertices(o.geometry.clone().deleteAttribute('normal').deleteAttribute('uv').applyMatrix4(new THREE.Matrix4().makeScale(1000, 1000, 1000).multiply(o.matrixWorld)));
    // 0009: a leaf narrows to a point, which welds into faces with no area; Rhino calls a
    // mesh with those invalid, so they are left out.
    const ix = g.index.array, keep = [];
    for (let i = 0; i < ix.length; i += 3) if (ix[i] !== ix[i + 1] && ix[i + 1] !== ix[i + 2] && ix[i] !== ix[i + 2]) keep.push(ix[i], ix[i + 1], ix[i + 2]);
    g.setIndex(keep);
    // Arrays, not g.toJSON(): a tube or a rounded box would write its recipe, not its triangles.
    const mesh = rh.Mesh.createFromThreejsJSON({ data: {
      attributes: { position: { itemSize: 3, type: 'Float32Array', array: Array.from(g.attributes.position.array), normalized: false } },
      index: { type: 'Uint32Array', array: Array.from(g.index.array) } } });
    doc.objects().add(mesh, layerOf(layer));
    count.meshes++;
  });
  return { bytes: doc.toByteArray(), ...count };
}

// An .obj (Rhino export, mm, z up) in scene coordinates, one mesh per material, each with
// its material name in userData.layer.
export async function readObj(url) {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  // Rhino writes curves as `l` lines; one of them turns OBJLoader's whole object into lines.
  const loaded = new OBJLoader().parse((await res.text()).replace(/^[lp] .*$/gm, ''));
  const root = new THREE.Group();
  loaded.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [o.material].flat(), groups = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: o.geometry.attributes.position.count, materialIndex: 0 }];
    for (const grp of groups) {
      const pos = o.geometry.attributes.position.array.slice(grp.start * 3, (grp.start + grp.count) * 3);
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.applyMatrix4(FROM_RHINO);
      const mesh = new THREE.Mesh(geometry);
      mesh.userData.layer = mats[grp.materialIndex]?.name ?? '';
      root.add(mesh);
    }
  });
  return { root, count: root.children.length, unmeshed: 0 };
}

// Splits a mesh into its connected pieces (shared corners), for files with one material.
export function pieces(mesh) {
  const pos = mesh.geometry.attributes.position, n = pos.count / 3, parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const key = `${pos.getX(t * 3 + k).toFixed(5)},${pos.getY(t * 3 + k).toFixed(5)},${pos.getZ(t * 3 + k).toFixed(5)}`;
    if (owner.has(key)) parent[find(t)] = find(owner.get(key)); else owner.set(key, t);
  }
  const byRoot = new Map();
  for (let t = 0; t < n; t++) {
    const r = find(t);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(t);
  }
  return [...byRoot.values()].map((tris) => {
    const arr = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => { for (let k = 0; k < 9; k++) arr[i * 9 + k] = pos.array[t * 9 + k]; });
    return new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)));
  });
}

// Merges meshes into one (world positions).
export function merge(meshes) {
  const parts = meshes.map((m) => { m.updateMatrixWorld(true); return (g => g.index ? g.toNonIndexed() : g)(m.geometry.clone().applyMatrix4(m.matrixWorld)).attributes.position.array; });
  const arr = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { arr.set(p, o); o += p.length; }
  return new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)));
}
