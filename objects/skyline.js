// The city outside the window (0016 option C, made the site's window in 0017): a perspective
// picture of a typical view, drawn into the window opening, while the room stays isometric.
//
// Which city is set in site/city.json ({ "city": "zurich" }). Each city is two files in
// site/city/: <city>.json (where the view stands, the river banks, counts) and <city>.bin (the
// buildings as Int16 decimetres in the view's own frame). They are cut out by
// Desk input/swisstopo/extract.py.
//
// Zürich: swissBUILDINGS3D 3.0 (© swisstopo), tile 1091-41, real roof shapes. The view stands
// above the west quay of the Limmat at Schipfe and looks up the river towards the lake, the
// classic old-town view: Grossmünster on the left bank, Fraumünster and St. Peter on the right,
// the Rathaus standing in the river. It is not the view from the real window.
//
// The room is on the second floor: its floor is 6.6 m above the quay. Greyscale by day and at
// night; at night some windows are lit and the street lights light the houses from below.
import * as THREE from 'three';
import { as, group, box, cylinder, lines, poly, random, tier, makeInk, applyTheme, THEME } from '../lib/draw.js';
import { frame } from './room-shell.js';
import { PUBLIC } from '../lib/models.js';

export const STREET = -6.6;   // the quay, below the room's floor
const LIT = 0xe4e4e4;   // a lit window at night: light grey, not yellow (greyscale)
const BACK = 1.74;      // the eye stands this far back from the window, at its middle height
const LINE = 0.35;      // the city's line widths against the room's
// The eye in the city, in metres from where extract.py's view stands (forward up the river,
// side to the right), height above the water (unset: the second floor above the quay), turn
// (degrees, + to the right), look (degrees, + up), zoom (1: as the window frames it).
// The default stands on the Limmatquai (the east bank), 4 m in front of the house fronts.
export const VIEW = { forward: 0, side: -50, turn: 5, look: 0, zoom: 1 };
export const VIEW_RANGES = {
  forward: [-150, 600, 1, 'm up the river'], side: [-150, 150, 1, 'm to the right'], height: [2, 60, 0.5, 'm above the water'],
  turn: [-60, 60, 0.5, '° turn'], look: [-15, 15, 0.5, '° look up'], zoom: [0.5, 4, 0.05, '× zoom'],
};

// A flat quad from 4 corners [[x, y, z], ...].
function quad(c) {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
    [...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3]], 3));
  return new THREE.Mesh(g);
}
const mesh = (pos) => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)));

// Linear interpolation along a bank polyline [[d, s], ...].
function sAt(bank, d) {
  if (d <= bank[0][0]) return bank[0][1];
  for (let i = 1; i < bank.length; i++) if (d <= bank[i][0]) {
    const [d0, s0] = bank[i - 1], [d1, s1] = bank[i];
    return s0 + (s1 - s0) * (d - d0) / (d1 - d0);
  }
  return bank.at(-1)[1];
}

async function city(name, eye, zc) {
  const meta = await (await fetch(`city/${name}.json`)).json();
  const raw = new Int16Array(await (await fetch(`city/${name}.bin`)).arrayBuffer());
  const u = meta.unit, y0 = eye.y - meta.eyeHeight;   // y0: the river's water level in the room's frame
  // The view's frame (d forward, s right, h up) into the room's: forward is -x, right is -z.
  const P = (d, s, h) => [eye.x - d, y0 + h, zc - s];
  let i = 0;
  const take = (n) => { const out = new Float32Array(n); for (let k = 0; k < n; k += 3) out.set(P(raw[i + k] * u, raw[i + k + 1] * u, raw[i + k + 2] * u), k); i += n; return out; };
  const c = meta.counts;
  const walls = mesh(take(c.walls * 9)), roofs = mesh(take(c.roofs * 9));
  // The outlines (open edges and creases) are worked out in extract.py: the ink's own edge
  // finder would cost seconds over 200,000 triangles.
  walls.userData.noEdges = roofs.userData.noEdges = true;
  const e = take(c.edges * 6), segs = [];
  for (let k = 0; k < e.length; k += 6) segs.push(Array.from(e.subarray(k, k + 6)));
  const rnd = random(17), wsegs = [], lit = [];
  const w = take(c.windows * 12);
  for (let k = 0; k < w.length; k += 12) {
    const q = [0, 1, 2, 3].map((j) => Array.from(w.subarray(k + j * 3, k + j * 3 + 3)));
    wsegs.push(...poly([...q, q[0]]));
    if (rnd() < 0.35) lit.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  const parts = [as('plaster', tier(2, walls)), as('concrete', tier(2, roofs)), lines(segs, 2), lines(wsegs, 3)];

  // The ground: the quays at quay height either side of the river, the water below, the quay
  // walls between.
  const { left, right } = meta.banks, Q = meta.quay, FAR = 1300, NEAR = -150, ripples = [];
  const ground = [], water = [], qsegs = [];
  for (let d = NEAR; d < FAR; d += 10) {
    const d1 = d + 10, l0 = sAt(left, d), l1 = sAt(left, d1), r0 = sAt(right, d), r1 = sAt(right, d1);
    ground.push(...P(d, -900, Q), ...P(d1, -900, Q), ...P(d1, l1, Q), ...P(d, -900, Q), ...P(d1, l1, Q), ...P(d, l0, Q));
    ground.push(...P(d, r0, Q), ...P(d1, r1, Q), ...P(d1, 900, Q), ...P(d, r0, Q), ...P(d1, 900, Q), ...P(d, 900, Q));
    for (const [s0, s1] of [[l0, l1], [r0, r1]]) {   // the quay walls
      ground.push(...P(d, s0, 0), ...P(d1, s1, 0), ...P(d1, s1, Q), ...P(d, s0, 0), ...P(d1, s1, Q), ...P(d, s0, Q));
      qsegs.push([...P(d, s0, Q), ...P(d1, s1, Q)], [...P(d, s0, 0.02), ...P(d1, s1, 0.02)]);
    }
    for (let n = 0; n < 6 * 300 / (Math.abs(d) + 60); n++) {   // ripples: short strokes, fewer per metre further off
      const dd = d + rnd() * 10, s = sAt(left, dd) + rnd() * (sAt(right, dd) - sAt(left, dd)), len = 0.4 + dd * 0.012;
      ripples.push([...P(dd, s, 0.02), ...P(dd, s - len, 0.02)]);
    }
  }
  water.push(...P(NEAR, -2000, 0), ...P(4000, -2000, 0), ...P(4000, 2000, 0), ...P(NEAR, -2000, 0), ...P(4000, 2000, 0), ...P(NEAR, 2000, 0));
  parts.push(as('concrete', tier(1, mesh(ground))), as('glass', tier(1, mesh(water))), lines(qsegs, 2), lines(ripples, 3));

  // Street lights along both banks every 30 m.
  const lamps = [];
  for (let d = NEAR; d < 700; d += 30) for (const [bank, off] of [[left, -3], [right, 3]]) lamps.push(P(d, sAt(bank, d) + off, Q));
  for (const [x, y, z] of lamps) parts.push(as('metal', tier(3, cylinder(0.07, 0.09, 5, x, y + 2.5, z, 8))), as('metal', tier(3, box(0.4, 0.15, 0.4, x, y + 5, z))));

  // The hills behind: the lake's far shores low ahead, the Uetliberg ridge rising on the right,
  // with its mast. Made up from the map, not measured.
  const hill = (s) => 170 + 40 * Math.sin(s * 0.0019) + 20 * Math.sin(s * 0.005 + 1) + Math.max(0, s - 600) * 0.12;
  const pts = [];
  for (let s = -4000; s <= 4400; s += 140) pts.push([zc - s, y0 + hill(s)]);
  const hx = eye.x - 4200, mast = P(4250, 1900, hill(1900) + 50);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape([[zc + 4000, y0], ...pts, [zc - 4400, y0]].map(([a, b]) => new THREE.Vector2(a, b))), { depth: 400, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  const hills = new THREE.Mesh(g);
  hills.position.x = hx;
  parts.push(as('leaf', tier(1, hills)), as('metal', tier(3, cylinder(1, 3, 120, mast[0], mast[1], mast[2], 6))));

  // The lit windows: one mesh, shown at night only.
  const litMesh = mesh(lit);
  litMesh.material = new THREE.MeshBasicMaterial({ color: LIT, side: THREE.DoubleSide, toneMapped: false });
  litMesh.userData.plain = true;
  litMesh.userData.onTheme = (dark) => { litMesh.visible = dark; };
  litMesh.visible = THEME.dark;
  // The street lights at night: grey-white, from 5 m up, reaching 45 m.
  const lights = lamps.map(([x, y, z]) => {
    const l = new THREE.PointLight(0xffffff, 0, 45, 1);
    l.position.set(x, y + 4.7, z);
    l.userData.onTheme = (dark) => { l.intensity = dark ? 60 : 0; };
    l.intensity = THEME.dark ? 60 : 0;
    return l;
  });
  return { root: group(...parts), litMesh, lights, credit: meta.source, P, eyeHeight: meta.eyeHeight };
}

// The picture in the window opening, facing into the room. Its texture is set by the caller.
function windowPlane(f, W, H, yc, zc, map) {
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  picture.rotation.y = Math.PI / 2;   // facing into the room (+x)
  picture.position.set(f.xo - 0.01, yc, zc);
  picture.userData.plain = true;
  return picture;
}

// Adds the city, as a picture in the window opening, to the room's scene.
// 0019: on the public site (PUBLIC, set by publish.py) the window
// shows the two pictures saved from ?tune, day and night, in place of the city itself: the same
// pixels, without the 7 MB of buildings. Returns { ready } that settles once the window is drawn.
export async function addSkyline({ scene, renderer, shell }) {
  const { city: name } = await (await fetch('city.json')).json();
  const f = frame(shell), zc = (f.z0 + f.z1) / 2, yc = (f.yF + f.yT) / 2, W = f.z1 - f.z0, H = f.yT - f.yF;
  if (PUBLIC) {
    const meta = await (await fetch(`city/${name}.json`)).json();
    const load = (mode) => new THREE.TextureLoader().loadAsync(`city/${name}-${mode}.png`).then((t) => {
      // As the live picture was: sRGB, no mipmaps, so it reads as sharp at a small size.
      Object.assign(t, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: false, minFilter: THREE.LinearFilter });
      return t;
    });
    const day = load('day'), night = load('night');
    const picture = windowPlane(f, W, H, yc, zc, null);
    const show = async () => { picture.material.map = await (THEME.dark ? night : day); picture.material.needsUpdate = true; };
    picture.userData.onTheme = show;   // both are loaded by then, so it swaps before the next frame
    scene.add(picture);
    return { root: picture, credit: meta.source, name, ready: show() };
  }
  // Someone standing 1.74 m back from the window, eyes at the window's middle (1.6 m): the
  // frustum passes exactly through the opening, so the picture fits it as a window would.
  const eye = new THREE.Vector3(f.xo + BACK, yc, zc);
  const made = await city(name, eye, zc);
  const cityScene = new THREE.Scene();
  cityScene.add(new THREE.AmbientLight(0xffffff, Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.95 * Math.PI);
  sun.position.set(-1, 0.58, 0.5);   // the room's sun direction
  cityScene.add(sun, ...made.lights);
  const camera = new THREE.PerspectiveCamera(50, W / H, 1, 8000);
  // Where the eye stands in the city and how it looks: VIEW, as saved in bench/skyline.json
  // (the site's ?tune panel saves it). The city stays put; only this camera moves.
  const view = { ...VIEW, height: made.eyeHeight, ...(await fetch('bench/skyline.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))).settings };
  const aim = (v) => {
    const rad = THREE.MathUtils.degToRad, t = rad(v.turn), l = rad(v.look);
    camera.position.set(...made.P(v.forward, v.side, v.height));
    camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(H / 2 / (BACK * v.zoom)));   // zoom: as if standing further back from the window
    camera.updateProjectionMatrix();
    camera.lookAt(camera.position.clone().add(new THREE.Vector3(-Math.cos(t) * Math.cos(l), Math.sin(l), -Math.sin(t) * Math.cos(l))));
  };
  aim(view);
  const ink = makeInk(new THREE.Vector3(1, 0, 0));
  ink.lineify(made.root);
  const inked = ink.drawLines();
  for (const l of inked.children) l.material.linewidth *= LINE;   // the picture is seen small: thinner than the room's lines
  cityScene.add(made.root, inked, made.litMesh);
  const target = new THREE.WebGLRenderTarget(1400, Math.round(1400 * H / W), { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  // 0019: three's thick lines take their pixel size from the page's canvas, not from the picture
  // they are drawn into. The first picture was drawn before the page had its size (300 x 150, the
  // canvas default), every later one (after a day/night switch) at the window's size, so the
  // city's lines thinned out after a switch. They are now always drawn as on first load.
  const LINES_AS = new THREE.Vector4(0, 0, 300, 150);
  const draw = () => {
    applyTheme(cityScene, null);   // the picture follows day and night like the room
    sun.intensity = THEME.dark ? 0 : 0.95 * Math.PI;
    const was = renderer.getViewport(new THREE.Vector4());
    renderer.setViewport(LINES_AS);
    renderer.setRenderTarget(target);
    renderer.render(cityScene, camera);
    renderer.setRenderTarget(null);
    renderer.setViewport(was);
  };
  const picture = windowPlane(f, W, H, yc, zc, target.texture);
  picture.userData.onTheme = draw;
  scene.add(picture);
  draw();
  // 0019: the window's picture by day and at night, as PNG files, for the public site.
  async function pictures() {
    const { width: w, height: h } = target, px = new Uint8Array(w * h * 4), out = [], was = THEME.dark;
    for (const dark of [false, true]) {
      THEME.dark = dark;
      draw();
      renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const img = c.getContext('2d').createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // rows run bottom up in WebGL
      // Opaque, as the window shows it: the lines' soft edges leave alpha below 1 in the render,
      // and kept in the PNG that made the day's lines come out lighter.
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      c.getContext('2d').putImageData(img, 0, 0);
      out.push(await new Promise((res) => c.toBlob(res, 'image/png')));
    }
    THEME.dark = was;
    draw();
    return out;
  }
  return { root: picture, credit: made.credit, name, view, ready: Promise.resolve(), pictures, set(v) { Object.assign(view, v); aim(view); draw(); } };
}
