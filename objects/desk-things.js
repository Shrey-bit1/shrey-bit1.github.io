// 0011: the things on the desk and on the sill as bench objects. Moved from index.html,
// where they were drawn in place, and given sliders for their sizes.
//
// Each desk thing has `on: 'desk'` (the laptop `on: 'laptop-stand'`): its x, z and turn are
// in the frame of what it stands on, so it moves when that moves. objects/index.js does the
// placing. x runs along the desk from its back corner by the window, z out from the back
// edge, y up from the desk top. `build(s, ctx)` makes the thing in its own frame, standing on
// y = 0 at its origin.
//
// Every part sits on a named layer. Boxes, cylinders and turned profiles go to Rhino as NURBS;
// the monitor's arc foot, the mouse shell and the keyboard case go as meshes, the keyboard
// case as an extrusion (NURBS); the cable as a curve.
import * as THREE from 'three';
import { as, at, box, span, cylinder, group, tier, hot, lines, poly, ring, curve, random, shadowTube, THEME } from '../lib/draw.js';

const on = (layer, o) => (o.userData.layer = layer, o);
const P = (key, label, value, min, max, step, unit) => ({ key, label, value, min, max, step, unit });
// The place on what it stands on: along the desk, out from its back edge, turn, height.
const place = (x, z, rot = 0, y = 0) => [
  P('x', 'Position along the desk, from its corner by the window', x, -0.2, 1.6, 0.005),
  P('z', 'Position out from the desk\'s back edge', z, -0.2, 1.0, 0.005),
  P('rot', 'Turn', rot, -180, 180, 1, '°'),
  P('y', 'Height above the desk top', y, 0, 0.3, 0.001),
];

// Key outlines for a layout lying in the local xz plane: `rows` are widths in key units, a
// negative width is a gap. As drawn since 0005.
function keys(rows, unit, x0, z0, y) {
  const segs = [], gap = unit * 0.12;
  rows.forEach((row, r) => {
    let x = x0;
    for (const w of row) {
      if (w > 0) {
        const a = x + gap / 2, b = x + w * unit - gap / 2, c = z0 + r * unit + gap / 2, d = c + unit - gap;
        segs.push(...poly([[a, y, c], [b, y, c], [b, y, d], [a, y, d], [a, y, c]]));
      }
      x += Math.abs(w) * unit;
    }
  });
  return segs;
}
const u = (n, w = 1) => Array(n).fill(w);

// ---- Monitor -------------------------------------------------------------------------------
// LG 27UL500 (27UL550 shares the body). Official: 622.6 x 460.0 x 209.4 mm with stand,
// 622.6 x 371.0 x 74.1 mm without; active area 597.6 x 336.2 mm. The panel's lowest edge is
// 460 - 371 = 89 mm above the desk. The arc foot's width (400 mm) is read from the photos.
// Shape as since 0005. Origin: the middle of the panel's front face, on the desk.
function monitor(s) {
  const W = s.W, H = s.H, y0 = s.lift, cy = y0 + H / 2, aw = s.activeW, ah = aw * 336.2 / 597.6;
  const zs = 0.0005, rnd = random(3), code = [], sy = cy + 0.006;   // the bottom bezel is wider
  const L = -0.29, T = sy + 0.16;
  for (let i = 0; i < 26; i++) {
    const y = T - 0.012 - i * 0.0117, x0 = L + 0.05 + (i % 5 === 0 ? 0 : 0.012 + (i % 3) * 0.01);
    code.push([x0, y, zs, x0 + 0.05 + rnd() * 0.18, y, zs]);
  }
  code.push([L + 0.04, T, zs, L + 0.04, T - 0.32, zs], [0.13, T, zs, 0.13, T - 0.32, zs],
            [0.145, sy - 0.07, zs, 0.28, sy - 0.07, zs], [0.145, sy + 0.06, zs, 0.28, sy + 0.06, zs]);
  // Foot: an arc `footW` wide whose tips reach `footReach` forward of the neck.
  const chord = s.footW, sag = s.footReach, r = (chord * chord / 4 + sag * sag) / (2 * sag), half = Math.asin(chord / 2 / r);
  const foot = new THREE.TorusGeometry(r, 0.011, 8, 28, half * 2).rotateZ(-Math.PI / 2 - half).rotateX(Math.PI / 2);
  const zn = -0.084;   // the neck, just behind the 74 mm deep back
  const screen = as('screen', hot(on('Screen', box(aw, ah, 0.001, 0, sy, 0))));   // active area, tints on hover
  return group(
    as('dark', group(
      on('Panel', box(W, H, 0.015, 0, cy, -0.0075)),                     // thin panel
      on('Panel', box(0.4, 0.26, 0.059, 0, cy - 0.02, -0.0445)),         // the deeper back, 74.1 mm in all
      on('Stand', box(0.045, 0.2, 0.02, 0, 0.1, zn)),                    // neck
      on('Stand', at(new THREE.Mesh(foot), 0, 0.011, zn - 0.01 + r)),    // arc foot, resting on the desk
    )),
    screen,
    on('Screen', lines(code)),
    screenLight(s, screen, aw, ah, [0, sy, 0.0005]),
    stripLight(s),
  );
}

// 0015, night only: the light strip behind the monitor (IMG_8439) is the room's light at night,
// in place of the sun. A warm point light between the monitor's back and the wall, low down: it
// washes the wall behind and throws the monitor's shadow, and spills round it onto the desk.
// `strip` is its brightness; index.html's painted glow on the wall follows the same setting.
// The wall is 228 mm behind the screen face where you saved the monitor; the light sits 60 mm
// off it. Always on at night (not on hover); none of it goes to Rhino.
// ponytail: one point light for a strip about 600 mm long; a row of lights if its ends need their own shadows.
const STRIP_COL = 0xffcc88;   // the warm white of the glow painted on the wall
const STRIP_REACH = 2.6, STRIP_GAIN = 1.4;   // 0017: how far it reaches (m); the gain makes up for the fade near the desk
function stripLight(s) {
  // 0017: it fades to nothing at REACH, so there is no edge where it ends.
  const lamp = new THREE.PointLight(STRIP_COL, s.strip * 12 * STRIP_GAIN, STRIP_REACH, 1);
  lamp.position.set(0, 0.12, -0.17);
  lamp.castShadow = true;
  // 0017: a point light's shadow bias is a share of its shadow camera's depth (near to far).
  // With the default far of 500 m, -0.002 let light through 1 m past anything in its way: it
  // reached behind the cabinet, and where that 1 m ran out it stopped in a hard circle. The
  // camera now ends where the light does, so the bias is 5 mm; small and blurred, the map's
  // shadows have soft edges.
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.radius = 6;
  lamp.shadow.bias = -0.002;
  lamp.shadow.camera.near = 0.02;
  lamp.shadow.camera.far = STRIP_REACH;
  lamp.shadow.camera.updateProjectionMatrix();   // a point light's shadow does not redo this itself: without it all was in shadow
  lamp.userData.onTheme = (dark) => { lamp.visible = dark; };
  lamp.visible = THEME.dark;
  return lamp;
}

// 0014, night only: a screen is a lamp. The screen itself goes flat white; the light comes out
// of its face into the room: a spot light that lights what is in front and casts its shadows,
// and light in the air that leaves the screen at exactly its size and, as it travels, spreads,
// softens and fades, like a neon sign's glow thrown forward (references in the 0014 report).
// It lights up while the screen is hovered (on the site) and fades in and out. The bench
// shows it lit. None of it is drawn by day, and none goes to Rhino (plain meshes).
// `screen` is the screen mesh; w, h its size; [cx, cy, cz] its middle; it faces +z.
// ponytail: the light in the air is stacked soft slices, not true volumetric light: it shows
// no shadows of what stands in it.
// 0015: strength and softness are fixed at the values you saved on the monitor (bench/monitor.json,
// 2026-11-10); only reach, light in the air and colour are left on the bench.
const GLOW = 0.4, SOFT = 0.17;
export const GLOW_PARAMS = [
  P('reach', 'Night: how far the light reaches', 1.2, 0.2, 3, 0.05),
  P('haze', 'Night: light in the air coming out of the screen', 0.55, 0, 1, 0.01, '%'),
  P('glowCol', 'Night: colour of the light', '#ffffff', 0, 0, 0, 'colour'),
];
// A soft rectangle, white, blurred by `blur` px, filling RX by RY of a 128 x 96 texture. Shared.
const RX = 80 / 128, RY = 56 / 96, softRects = new Map();
function softRect(blur) {
  if (!softRects.has(blur)) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 96;
    const g = c.getContext('2d');
    g.filter = `blur(${blur}px)`;
    g.fillStyle = '#fff';
    g.fillRect(24, 20, 80, 56);
    softRects.set(blur, new THREE.CanvasTexture(c));
  }
  return softRects.get(blur);
}
function screenLight(s, screen, w, h, [cx, cy, cz]) {
  const col = new THREE.Color(s.glowCol), soft = SOFT;
  const lamp = new THREE.SpotLight(col, 0, s.reach * 2, THREE.MathUtils.degToRad(50 + 30 * soft), 0.5 + 0.5 * soft, 1);
  lamp.position.set(cx, cy, cz + 0.02);
  lamp.target.position.set(cx, cy - 0.3, cz + 1);   // out from the screen and a little down
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.camera.near = 0.02;
  // Light in the air: slices across the light's path. The first is the screen's own size and
  // sharp, so the light is seen to leave the screen face; each next one is wider, blurrier and
  // fainter. `soft` sets how fast it spreads and blurs, `reach` how far it goes.
  const L = s.reach * 0.75, grow = 0.25 + 0.9 * soft, N = 28, slices = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), z = 0.004 + t * L, sw = w + 2 * z * grow, sh = h + 2 * z * grow * 0.7;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw / RX, sh / RY),
      new THREE.MeshBasicMaterial({ map: softRect(Math.round(1 + t ** 0.8 * (4 + 22 * soft))), color: col, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide,
        // 0015: not hidden by what stands in the beam: the cabinet cut it off in a hard
        // vertical edge. Light in the air in front of it reads the same, and fades out softly.
        depthTest: false }));
    m.position.set(cx, cy - 0.3 * z, cz + z);
    m.userData.fade = (1 - t) ** 1.8 * 2.4 / N;   // its share: bright at the screen, nothing at the end
    m.userData.plain = true;
    slices.push(m);
  }
  const beam = group(...slices);
  const night = group(lamp, lamp.target, beam);
  // How lit it is, 0-1. The screen goes flat white (emissive) with it.
  const set = (k) => {
    lamp.intensity = k * GLOW * 3;
    for (const m of slices) m.material.opacity = k * s.haze * Math.min(1.5, GLOW) * m.userData.fade;
    beam.visible = k > 0;
    screen.material?.emissive?.copy(col).multiplyScalar(k);
  };
  let level = 0, target = THEME.hoverGlow ? 0 : 1, raf = 0;
  const ease = (t0, from) => {
    cancelAnimationFrame(raf);
    const step = (now) => {
      const t = Math.min((now - t0) / 220, 1);
      set(level = from + (target - from) * t * (2 - t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  night.userData.onTheme = (dark) => {
    night.visible = dark;   // by day there is no light and the screen is as it was
    set(dark ? (level = target) : 0);
  };
  night.userData.onHover = (on) => { if (!THEME.hoverGlow) return; target = on ? 1 : 0; ease(performance.now(), level); };
  night.visible = THEME.dark;
  return night;
}

// ---- Laptop and its stand --------------------------------------------------------------------
// HP OMEN 15-dc1xxx. Official (HP datasheet, 15-dc1030nr): 360 x 263 x 26 mm. Split here as a
// 20 mm base and a 6 mm lid. The hinge sits 25 mm in from the back, with the vent block
// behind it, as on the OMEN 15 (2019). Its keyboard is full size with a numeric keypad (HP
// service guide); the 15.6" panel's active area is 344 x 194 mm. It lies on the stand, tilted
// up at the back by `lift` (15° rests it on the 77 mm posts); the lid is opened `open` from the base. Origin: the stand's.
const OMEN_ROWS = [u(15, 1), [...u(13), 2], [1.5, ...u(12), 1.5], [1.75, ...u(11), 2.25], [1.25, ...u(10), 1.75, 1, -1], [1, 1, 1, 1, 6, 1, 1, 1, 1, 1]];
const NUMPAD = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, -1], [1, 1, 1, 1], [2, 1, -1]];
function laptop(s) {
  const W = s.W, D = s.D, base = s.T - 0.006, hinge = D - 0.025, lift = THREE.MathUtils.degToRad(s.lift);
  const ku = (W - 0.025) / (15 + 4 * 0.85), y = base / 2 + 0.0002;   // the main block and a narrower keypad
  const screen = as('screen', hot(on('Screen', box(0.344, 0.194, 0.001, 0, 0.01 + 0.194 / 2, 0.0035))));
  const lid = group(
    on('Lid', box(W, D - 0.028, 0.006, 0, (D - 0.028) / 2, 0)),
    screen, screenLight(s, screen, 0.344, 0.194, [0, 0.01 + 0.194 / 2, 0.004]),   // 0014
    on('Screen', lines(Array.from({ length: 14 }, (_, i) => [-0.16 + (i % 4) * 0.008, 0.19 - i * 0.012, 0.0045, -0.08 + (i * 7 % 5) * 0.03, 0.19 - i * 0.012, 0.0045]))),
  );
  lid.position.set(0, base / 2, -hinge + D / 2);
  lid.rotation.x = -THREE.MathUtils.degToRad(s.open) + Math.PI / 2;
  const x0 = -W / 2 + 0.0125, z0 = -D / 2 + 0.04;
  const deck = group(
    on('Base', box(W, base, D, 0, 0, 0)),
    on('Keyboard', lines([
      ...keys([OMEN_ROWS[0]], ku, x0, z0, y),
      ...keys(OMEN_ROWS.slice(1), ku, x0, z0 + ku * 0.75, y),
      ...keys(NUMPAD, ku * 0.85, x0 + 15 * ku + 0.002, z0 + ku * 0.75, y),
    ])),
    on('Touchpad', lines(poly([[-0.07, y, D / 2 - 0.085], [0.05, y, D / 2 - 0.085], [0.05, y, D / 2 - 0.015], [-0.07, y, D / 2 - 0.015], [-0.07, y, D / 2 - 0.085]]))),
    lid,
  );
  // Lying on the stand: its back on the posts, its front on the foot.
  deck.rotation.x = lift;
  deck.position.set(0, 0.012 + base / 2 + Math.sin(lift) * D / 2, 0.14 - Math.cos(lift) * D / 2);
  return as('dark', group(deck));
}

// The laptop stand (no product name): a flat foot at the front and two posts at the back,
// sizes read from the photos. Origin: the middle of its footprint's front edge.
function stand(s) {
  const w = s.W, d = s.D, post = (x) => on('Posts', span(x - 0.01, x + 0.01, 0, s.H, 0.14 - d, 0.14 - d + 0.04));
  return as('dark', group(on('Foot', span(-w / 2, w / 2, 0, 0.012, 0.09, 0.14)), post(-w / 2 + 0.02), post(w / 2 - 0.02)));
}

// ---- Keyboard ------------------------------------------------------------------------------
// DIERYA T68SE, white, 68 keys in a 65% layout. The case is a wedge, lower at the front; the
// keys float on its top plate, one keycap each. Origin: the middle of its footprint. Its cable
// runs off the back towards the laptop.
// 0013: you measured it 347 mm long (the listing said 289.8). Keys at the standard 19.05 mm
// pitch, 16 units across (304.8 mm), centred; the rest is case each side, 21 mm at 347.
const T68 = [[1, ...u(10), 1, 1, 2, 1], [1.5, ...u(12), 1.5, 1], [1.75, ...u(11), 2.25, 1], [2.25, ...u(10), 1.75, 1, 1], [1.25, 1.25, 1.25, 6.25, 1, 1, 1, 1, 1, 1]];
function keyboard(s) {
  const W = s.W, D = s.D, p = Math.min(0.01905, (W - 0.007) / 16), rim = (W - 16 * p) / 2, f = s.front, b = s.T - 0.0105;
  const prof = [[D / 2, 0], [D / 2, f], [-D / 2, b], [-D / 2, 0]];   // (z, y), front to back
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y))), { depth: W, bevelEnabled: false });
  const caseMesh = new THREE.Mesh(geo);
  caseMesh.rotation.y = -Math.PI / 2;   // the outline's first axis runs along z, the extrusion along -x
  caseMesh.position.x = W / 2;
  caseMesh.userData.nurbs = { type: 'extrusion', outer: prof, holes: [], depth: W };
  const caps = [], slope = (b - f) / D, top = (z) => f + (D / 2 - z) * slope;
  T68.forEach((row, r) => {
    let x = -W / 2 + rim;
    for (const w of row) {
      const z = -D / 2 + Math.max(0, (D - 5 * p) / 2) + (r + 0.5) * p;   // the 5 rows centred front to back
      if (w > 0) caps.push(on('Keycaps', tier(3, box(w * p - 0.0028, 0.008, p - 0.0028, x + w * p / 2, top(z) + 0.005, z))));
      x += Math.abs(w) * p;
    }
  });
  // As drawn since 0006: off the back, across the mat and the desk towards the laptop.
  const cable = curve([[-0.1, 0.0035, -D / 2 - 0.002], [-0.15, 0.0035, -0.16], [-0.32, 0.0035, -0.185], [-0.5, -0.0005, -0.26], [-0.7, -0.0005, -0.42]], 30);
  return group(as('white', group(on('Case', tier(2, caseMesh)), ...caps)), on('Cable', lines(poly(cable))), shadowTube(cable, 0.0035));
}

// ---- Mouse ---------------------------------------------------------------------------------
// Logitech M650 L. Official: 118.7 long, 66.2 wide, 42 mm high. A half ellipsoid, lowered
// towards the buttons so the hump sits under the palm, as in Logitech's photos. Origin: the
// middle of its footprint.
function mouse(s) {
  const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), sp = geo.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i) * (1 - 0.3 * Math.max(0, -sp.getZ(i))));
  const shellMesh = on('Shell', tier(2, new THREE.Mesh(geo)));
  shellMesh.scale.set(s.W / 2, s.H, s.L / 2);
  return as('dark', group(shellMesh, on('Shell', lines([[0, s.H * 0.81, -s.L * 0.34, 0, s.H * 0.93, -s.L * 0.17]]))));   // the button split
}

// ---- Smaller things --------------------------------------------------------------------------
// The desk mat (dark felt, as in the photos), with the round mark on it. Origin: its middle.
const deskMat = (s) => group(as('dark', on('Mat', span(-s.L / 2, s.L / 2, 0, s.T, -s.W / 2, s.W / 2))),
  on('Mat', lines(ring(0.022, -s.L / 2 + 0.04, s.T + 0.0008, s.W / 2 - 0.04))));
// A plain block, as drawn since 0005: the remote, the book, the power bank.
const block = (layer) => (s) => on(layer, box(s.W, s.T, s.L, 0, s.T / 2, 0));
// The earbud case lying on its round pad.
const earbuds = (s) => group(on('Pad', cylinder(s.padR, s.padR, 0.008, 0, 0.004, 0)), on('Case', box(s.W, s.T, s.L, 0, 0.008 + s.T / 2, 0)));
// The things on the sill (no product names): a roll of tape, a coaster and two boxes, as
// drawn since 0005. Placed along the window from its near edge; the object's origin is the
// middle of the sill there, at its top.
function sillThings(s) {
  return group(
    on('Tape', cylinder(0.05, 0.05, 0.05, 0, 0.025, s.tape)),
    on('Coaster', cylinder(0.035, 0.035, 0.012, 0.005, 0.006, s.coaster)),
    on('Small box', box(0.09, 0.03, 0.14, -0.005, 0.015, s.box1)),
    on('Box', box(0.12, 0.05, 0.17, 0, 0.025, s.box2)),
  );
}

// ---- The registry --------------------------------------------------------------------------
// Default places: where they were drawn in the scene before, in the desk's frame (its back
// corner by the window at x -0.72, z -0.395, as you saved it).
const size = (key, label, value, min, max) => P(key, label, value, min, max, 0.001);
export const DESK_THINGS = {
  monitor: {
    title: 'Monitor (LG 27UL500)', on: 'desk',
    note: 'LG 27UL500/27UL550. Official: 622.6 x 460 x 209.4 mm with stand, panel 371 mm high, active area 597.6 x 336.2 mm. The foot is read from your photos. Position is the middle of the screen\'s front face. Clicking it opens "Websites and apps".',
    params: [...place(0.92, 0.123),
      size('W', 'Panel width (official 622.6)', 0.6226, 0.5, 0.75), size('H', 'Panel height (official 371)', 0.371, 0.3, 0.45),
      size('activeW', 'Screen width (official 597.6)', 0.5976, 0.5, 0.72), size('lift', 'Panel above the desk (official 89)', 0.089, 0.05, 0.2),
      size('footW', 'Foot width (from the photos)', 0.4, 0.2, 0.5), size('footReach', 'Foot reaching forward of the neck', 0.17, 0.08, 0.25),
      P('strip', 'Night: light strip brightness (the room\'s light at night)', 1, 0, 3, 0.05, '×'),   // 0015
      ...GLOW_PARAMS],
    build: monitor,
  },
  'laptop-stand': {
    title: 'Laptop stand', on: 'desk',
    note: 'No product name. A flat foot at the front and two posts at the back, from your photos. Position is the middle of its front edge. The laptop stands on it and moves with it.',
    params: [...place(0.28, 0.295, 8),
      size('W', 'Width', 0.2, 0.12, 0.35), size('D', 'Depth, front to the back of the posts', 0.27, 0.15, 0.35), size('H', 'Post height', 0.077, 0.03, 0.2)],
    build: stand,
  },
  laptop: {
    title: 'Laptop (HP OMEN 15)', on: 'laptop-stand',
    note: 'HP OMEN 15-dc1xxx. Official: 360 x 263 x 26 mm (HP datasheet). Full-size keyboard with numeric keypad (HP service guide). Lid and base thickness are a guess. Position is on the stand: it moves with the stand.',
    params: [...place(0, 0, 0, 0).map((p) => ({ ...p, label: p.label.replace('the desk\'s back edge', 'the stand\'s front').replace('along the desk, from its corner by the window', 'across the stand').replace('the desk top', 'the stand') })),
      size('W', 'Width (official 360)', 0.36, 0.3, 0.42), size('D', 'Depth (official 263)', 0.263, 0.2, 0.3), size('T', 'Thickness closed (official 26)', 0.026, 0.015, 0.04),
      P('lift', 'Tilt on the stand (15: its back rests on the posts)', 15, 0, 40, 0.5, '°'), P('open', 'Lid opened from the base', 115, 60, 150, 1, '°'),
      ...GLOW_PARAMS],
    build: laptop,
  },
  keyboard: {
    title: 'Keyboard (DIERYA T68SE)', on: 'desk',
    note: 'DIERYA T68SE, 68 keys. 347 mm long (your measure; the listing says 289.8). Depth and height from the listing: 98.8 x 34.7 mm. Keys at the standard 19.05 mm pitch, the rest is case. Position is the middle of its footprint.',
    params: [...place(0.92, 0.455, 0, 0.004),
      size('W', 'Length (your measure 347)', 0.347, 0.25, 0.4), size('D', 'Depth (listing 98.8)', 0.0988, 0.08, 0.13),
      size('T', 'Height at the back, with the keys (listing 34.7)', 0.0347, 0.02, 0.045), size('front', 'Case height at the front', 0.016, 0.008, 0.03)],
    build: keyboard,
  },
  mouse: {
    title: 'Mouse (Logitech M650 L)', on: 'desk',
    note: 'Logitech M650 L. Official: 118.7 x 66.2 x 42 mm. Position is the middle of its footprint.',
    params: [...place(1.24, 0.465, 0, 0.004),
      size('L', 'Length (official 118.7)', 0.1187, 0.09, 0.14), size('W', 'Width (official 66.2)', 0.0662, 0.05, 0.08), size('H', 'Height (official 42)', 0.042, 0.03, 0.05)],
    build: mouse,
  },
  'desk-mat': {
    title: 'Desk mat', on: 'desk',
    note: 'No product name. Size as drawn since 0005, from your photos. Position is its middle.',
    params: [...place(0.93, 0.465),
      size('L', 'Length', 0.86, 0.4, 1.2), size('W', 'Width', 0.4, 0.2, 0.6), size('T', 'Thickness', 0.004, 0.001, 0.01)],
    build: deskMat,
  },
  remote: {
    title: 'Remote', on: 'desk',
    note: 'No product name. Size as drawn since 0005. Position is its middle.',
    params: [...place(0.6, 0.375, 0, 0.004), size('W', 'Width', 0.05, 0.02, 0.1), size('L', 'Length', 0.11, 0.05, 0.25), size('T', 'Thickness', 0.012, 0.005, 0.03)],
    build: block('Remote'),
  },
  earbuds: {
    title: 'Earbud case', on: 'desk',
    note: 'No product name. The case lying on its round pad, sizes as drawn since 0005. Position is the middle of the pad.',
    params: [...place(0.92, 0.195), size('padR', 'Pad radius', 0.05, 0.02, 0.08), size('W', 'Case width', 0.045, 0.02, 0.08), size('L', 'Case length', 0.035, 0.02, 0.08), size('T', 'Case height', 0.022, 0.01, 0.04)],
    build: earbuds,
  },
  book: {
    title: 'Book', on: 'desk',
    note: 'No title yet. Size as drawn since 0005. Position is its middle.',
    params: [...place(0.52, 0.115), size('W', 'Width', 0.1, 0.08, 0.3), size('L', 'Height of the book', 0.15, 0.1, 0.35), size('T', 'Thickness', 0.012, 0.005, 0.06)],
    build: block('Book'),
  },
  'power-bank': {
    title: 'Power bank', on: 'desk',
    note: 'No product name. Size as drawn since 0005. Position is its middle.',
    params: [...place(0.2, 0.595), size('W', 'Width', 0.08, 0.04, 0.12), size('L', 'Length', 0.15, 0.08, 0.2), size('T', 'Thickness', 0.025, 0.01, 0.04)],
    build: block('Power bank'),
  },
  'sill-things': {
    title: 'Things on the sill',
    note: 'A roll of tape, a coaster and two boxes, as drawn since 0005 (no product names). Position is the middle of the sill at the window\'s near edge; each thing has its own place along the window.',
    params: [
      P('x', 'Position x (out from the window wall)', -0.774, -1, 0, 0.005), P('z', 'Position z (along the window wall)', -0.05, -0.6, 2.4, 0.005),
      P('rot', 'Turn', 0, -180, 180, 1, '°'), P('y', 'Height it stands at', 0.8, 0, 1.5, 0.005),
      P('box1', 'Small box, along the window', 0.127, 0, 1.9, 0.005), P('tape', 'Tape, along the window', 0.338, 0, 1.9, 0.005),
      P('coaster', 'Coaster, along the window', 0.591, 0, 1.9, 0.005), P('box2', 'Box, along the window', 1.59, 0, 1.9, 0.005)],
    build: sillThings,
  },
};
