/** Track obstacles (jump barriers, roll-under gates) and collectibles. */
import { Part, Svg, THREE, rng, shade, svgToNormalMap, svgToWebp } from "./lib.mjs";

const ATLAS = 1024;
const R = (x0, y0, x1, y1) => [x0 / ATLAS, y0 / ATLAS, x1 / ATLAS, y1 / ATLAS];
const UV = {
  plank: R(0, 0, 512, 128),
  chevron: R(0, 128, 512, 256),
  travertine: R(512, 0, 1024, 256),
  marble: R(0, 256, 512, 512),
  crate: R(512, 256, 1024, 512),
  boom: R(0, 512, 512, 640),
  crossSign: R(512, 512, 768, 768),
  steel: R(768, 512, 1024, 768),
};

async function obstacleAtlas() {
  const svg = new Svg(ATLAS, ATLAS);
  const r = rng(1201);
  // Red / white diagonal works plank.
  svg.rect(0, 0, 512, 128, "#f4f1ea");
  for (let x = -128; x < 640; x += 96) svg.poly([[x, 128], [x + 48, 128], [x + 176, 0], [x + 128, 0]], "#c8232c");
  svg.noise(0, 0, 512, 128, { freq: "0.04", seed: 3, color: "#3a2a20", opacity: 0.25 });
  svg.rect(0, 0, 512, 6, "#2b2b2b", 'opacity="0.35"');
  svg.rect(0, 122, 512, 6, "#2b2b2b", 'opacity="0.35"');
  // Yellow / black chevrons.
  svg.rect(0, 128, 512, 128, "#f2b81f");
  for (let x = -128; x < 640; x += 96) svg.poly([[x, 256], [x + 48, 256], [x + 112, 192], [x + 48, 128], [x, 128], [x + 64, 192]], "#1d1d1d");
  svg.noise(0, 128, 512, 128, { freq: "0.05", seed: 4, color: "#2a2016", opacity: 0.3 });
  // Travertine.
  svg.rect(512, 0, 512, 256, "#d9c9a7");
  svg.rect(512, 0, 512, 256, svg.linearGradient([[0, "#cdb994"], [0.35, "#e5d8bc"], [0.6, "#cbb58f"], [1, "#e0d1b1"]]), 'opacity="0.75"');
  svg.noise(512, 0, 512, 256, { freq: "0.005 0.07", seed: 5, color: "#8c7652", opacity: 0.6 });
  for (let i = 0; i < 520; i++) svg.rect(512 + r.range(0, 512), r.range(0, 256), r.range(2, 10), r.range(0.8, 2.2), "#7a6648", 'opacity="0.55" rx="1"');
  // Carrara-style marble with grey veins.
  svg.rect(0, 256, 512, 256, "#eeebe4");
  svg.noise(0, 256, 512, 256, { freq: "0.008 0.02", seed: 6, color: "#9a978f", opacity: 0.55 });
  for (let i = 0; i < 9; i++) {
    let x = r.range(0, 512);
    let y = 256 + r.range(0, 256);
    const pts = [];
    for (let k = 0; k < 14; k++) {
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      x += r.range(10, 42);
      y += r.range(-18, 18);
    }
    svg.add(`<polyline points="${pts.join(" ")}" fill="none" stroke="#8d8a84" stroke-width="${r.range(0.8, 2.6).toFixed(1)}" opacity="0.55"/>`);
  }
  // Weathered crate planks.
  svg.rect(512, 256, 512, 256, "#b9894f");
  for (let k = 0; k < 6; k++) {
    const y = 256 + k * 42.6;
    svg.rect(512, y, 512, 40, r.pick(["#b9894f", "#a77a45", "#c3965c"]));
    svg.rect(512, y + 40, 512, 2.6, "#5a3d1f");
    svg.noise(512, y, 512, 40, { freq: "0.004 0.15", seed: 10 + k, color: "#5a3d1f", opacity: 0.55 });
  }
  svg.rect(512, 256, 512, 256, svg.radialGradient([[0, "#000", 0], [0.75, "#000", 0.05], [1, "#2a1a0c", 0.45]]));
  // Lemon logo stamp (no text): a lemon and leaf branded into the plank.
  svg.add('<ellipse cx="768" cy="384" rx="54" ry="36" fill="none" stroke="#4a2c12" stroke-width="5" opacity="0.65"/>');
  svg.add('<path d="M 812 360 q 30 -22 46 4 q -26 14 -46 -4 z" fill="#4a2c12" opacity="0.6"/>');
  // Red / white boom bands.
  svg.rect(0, 512, 512, 128, "#f4f1ea");
  for (let y = 512; y < 640; y += 32) svg.rect(0, y, 512, 16, "#c8232c");
  svg.noise(0, 512, 512, 128, { freq: "0.05", seed: 7, color: "#2a2016", opacity: 0.2 });
  // St Andrew's cross (level-crossing warning).
  svg.rect(512, 512, 256, 256, "#f4f1ea");
  for (let k = 0; k < 8; k++) svg.rect(512 + k * 32, 512, 16, 256, "#c8232c");
  svg.noise(512, 512, 256, 256, { freq: "0.05", seed: 8, color: "#2a2016", opacity: 0.2 });
  // Galvanised steel.
  svg.rect(768, 512, 256, 256, "#9aa0a3");
  svg.noise(768, 512, 256, 256, { freq: "0.08", seed: 9, color: "#4d5154", opacity: 0.5 });
  svg.noise(768, 512, 256, 256, { freq: "0.02", seed: 10, color: "#ffffff", opacity: 0.25 });
  return svgToWebp(svg, { quality: 86 });
}

/* ---------------------------------------------------------------- barriers */

function barrierWorks() {
  const part = new Part("barrier:works", { kit: "barrier" });
  const z = -0.3;
  for (const side of [-1, 1]) {
    const x = side * 0.86;
    for (const dz of [-0.24, 0.24]) part.rod("trim", [x, 0.0, z + dz], [x, 0.9, z], 0.028, 0xf2b81f, 8);
    part.box("trim", [x - 0.06, 0, z - 0.3], [x + 0.06, 0.04, z + 0.3], 0x1d1d1d);
    part.rod("trim", [x, 0.32, z - 0.15], [x, 0.32, z + 0.15], 0.02, 0x1d1d1d, 6);
  }
  part.box("paint", [-1.02, 0.56, z - 0.03], [1.02, 0.84, z + 0.03], 0xffffff, UV.plank);
  part.box("paint", [-1.02, 0.24, z - 0.025], [1.02, 0.4, z + 0.025], 0xffffff, UV.plank);
  // Amber beacon clipped on the plank.
  part.box("trim", [-0.82, 0.84, z - 0.05], [-0.66, 0.9, z + 0.05], 0x1d1d1d);
  part.add("beacon", new THREE.CylinderGeometry(0.075, 0.085, 0.13, 14), { p: [-0.74, 0.97, z] });
  part.add("trim", new THREE.CylinderGeometry(0.09, 0.09, 0.025, 14), { p: [-0.74, 1.045, z], color: 0x1d1d1d });
  // Sandbag feet.
  for (const side of [-1, 1]) {
    part.add("matte", new THREE.SphereGeometry(0.16, 10, 6), { p: [side * 0.86, 0.06, z - 0.32], s: [1.2, 0.45, 0.8], color: 0x8a7a5c });
    part.add("matte", new THREE.SphereGeometry(0.16, 10, 6), { p: [side * 0.86, 0.06, z + 0.32], s: [1.2, 0.45, 0.8], color: 0x7d6e52 });
  }
  return part;
}

function barrierTravertine() {
  const part = new Part("barrier:travertine", { kit: "barrier" });
  const r = rng(77);
  const blocks = [
    [-0.72, 0.56, 0.74, 0.6, -0.04],
    [0.02, 0.62, 0.8, 0.62, 0.03],
    [0.74, 0.52, 0.68, 0.56, -0.06],
  ];
  for (const [x, w, h, d, rot] of blocks) {
    const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
    // Chip the top corners for a hand-cut, weathered look.
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const top = pos.getY(i) > h / 2 - 1e-4;
      const edge = Math.abs(pos.getX(i)) > w / 2 - 1e-4 || Math.abs(pos.getZ(i)) > d / 2 - 1e-4;
      if (top && edge) {
        const hsh = Math.abs(Math.sin(pos.getX(i) * 12.9898 + pos.getZ(i) * 78.233 + x * 3.1) * 43758.5453) % 1;
        pos.setY(i, pos.getY(i) - (0.02 + hsh * 0.045));
      }
    }
    g.computeVertexNormals();
    part.add("paint", g, { p: [x, h / 2, -0.3], r: [0, rot, 0], color: shade(0xffffff, r.range(0.9, 1.02)), uvRect: UV.travertine });
  }
  // Bronze cramp across the blocks and a slim reflector strip.
  part.box("trim", [-0.5, 0.66, -0.31], [0.48, 0.7, -0.27], 0x8a5a2b);
  part.box("trim", [-0.36, 0.2, -0.015], [0.36, 0.26, 0.005], 0xd8402f);
  // Rubble at the base.
  for (let i = 0; i < 9; i++) {
    part.add("paint", new THREE.DodecahedronGeometry(r.range(0.05, 0.1), 0), {
      p: [r.range(-1.0, 1.0), 0.03, -0.3 + r.pick([-0.38, 0.36]) + r.range(-0.06, 0.06)],
      r: [r.range(0, 3), r.range(0, 3), r.range(0, 3)],
      color: shade(0xffffff, r.range(0.82, 0.98)),
      uvRect: UV.travertine,
    });
  }
  return part;
}

function barrierCrates() {
  const part = new Part("barrier:crates", { kit: "barrier" });
  const r = rng(404);
  const crate = (x, y, z, w, h, d, rot, filled) => {
    const g = new THREE.BoxGeometry(w, h, d);
    part.add("paint", g, { p: [x, y + h / 2, z], r: [0, rot, 0], color: shade(0xffffff, r.range(0.85, 1.05)), uvRect: UV.crate });
    // Corner posts.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const lx = sx * (w / 2 - 0.02);
      const lz = sz * (d / 2 - 0.02);
      part.box("paint", [x + lx * c + lz * s - 0.025, y, z - lx * s + lz * c - 0.025], [x + lx * c + lz * s + 0.025, y + h + 0.015, z - lx * s + lz * c + 0.025], shade(0xffffff, 0.75), UV.crate);
    }
    if (filled) {
      for (let i = 0; i < 16; i++) {
        const fx = r.range(-w / 2 + 0.08, w / 2 - 0.08);
        const fz = r.range(-d / 2 + 0.08, d / 2 - 0.08);
        const lemon = r.chance(0.7);
        part.add("matte", new THREE.SphereGeometry(0.065, 10, 8), {
          p: [x + fx * Math.cos(rot) + fz * Math.sin(rot), y + h - 0.02 + r.range(0, 0.04), z - fx * Math.sin(rot) + fz * Math.cos(rot)],
          s: lemon ? [1, 0.78, 0.78] : [1, 1, 1],
          r: [0, r.range(0, 3), 0],
          color: lemon ? r.pick([0xf2d43a, 0xe9c92a, 0xf7df55]) : r.pick([0xe98a1f, 0xf09a2a]),
        });
      }
      for (let i = 0; i < 4; i++) {
        part.add("matte", new THREE.SphereGeometry(0.06, 6, 4), {
          p: [x + r.range(-w / 3, w / 3), y + h + 0.04, z + r.range(-d / 3, d / 3)],
          s: [1.4, 0.18, 0.55],
          r: [0, r.range(0, 3), r.range(-0.3, 0.3)],
          color: 0x3f6b2a,
        });
      }
    }
  };
  crate(-0.66, 0, -0.3, 0.66, 0.4, 0.5, 0.05, false);
  crate(0.02, 0, -0.28, 0.66, 0.4, 0.5, -0.04, true);
  crate(0.7, 0, -0.32, 0.6, 0.4, 0.48, 0.08, true);
  crate(-0.6, 0.4, -0.3, 0.62, 0.4, 0.48, -0.1, true);
  return part;
}

/* ------------------------------------------------------------------ gates */

function gateCrossing() {
  const part = new Part("gate:crossing", { kit: "gate" });
  const z = -0.3;
  for (const side of [-1, 1]) {
    const x = side * 1.1;
    part.box("trim", [x - 0.07, 0, z - 0.07], [x + 0.07, 2.25, z + 0.07], 0x8f9599);
    part.box("trim", [x - 0.18, 0, z - 0.18], [x + 0.18, 0.08, z + 0.18], 0x5d6164);
  }
  // Mechanism cabinet and counterweight on the left post.
  part.box("trim", [-1.42, 0.0, z - 0.22], [-1.12, 1.0, z + 0.22], 0x6d7477);
  part.box("trim", [-1.38, 0.92, z - 0.18], [-1.16, 0.98, z + 0.18], 0x3d4245);
  part.box("trim", [-1.36, 1.5, z - 0.12], [-1.18, 1.86, z + 0.12], 0x2a2c2e);
  // Banded boom and hanging warning board.
  part.add("paint", new THREE.CylinderGeometry(0.06, 0.06, 2.4, 14, 1, false), { p: [0, 1.74, z], r: [0, 0, Math.PI / 2], uvRect: UV.boom });
  part.box("paint", [-0.95, 1.38, z - 0.02], [0.95, 1.62, z + 0.02], 0xffffff, UV.plank);
  for (const x of [-0.7, 0, 0.7]) {
    part.rod("trim", [x, 1.62, z], [x, 1.69, z], 0.012, 0x2a2c2e, 6);
    part.add("signal", new THREE.SphereGeometry(0.05, 12, 8), { p: [x, 1.81, z + 0.02] });
  }
  // St Andrew's cross on the right post.
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    part.add("paint", new THREE.BoxGeometry(0.9, 0.14, 0.025), { p: [1.1, 2.05, z + 0.09], r: [0, 0, a], uvRect: UV.crossSign });
  }
  part.add("signal", new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14), { p: [1.1, 1.62, z + 0.1], r: [Math.PI / 2, 0, 0] });
  part.add("trim", new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14), { p: [1.1, 1.62, z + 0.075], r: [Math.PI / 2, 0, 0], color: 0x1d1d1d });
  return part;
}

function flutedColumn(radius, length, flutes = 20) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.94, length, flutes * 3, 6, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 - 0.07 * Math.pow(Math.max(0, Math.cos(a * flutes)), 2);
    pos.setX(i, (x / rr) * rr * k);
    pos.setZ(i, (z / rr) * rr * k);
  }
  g.computeVertexNormals();
  return g;
}

function gateColumn() {
  const part = new Part("gate:column", { kit: "gate" });
  const r = rng(31);
  const z = -0.3;
  // Two travertine plinth stacks.
  for (const side of [-1, 1]) {
    let y = 0;
    for (const [w, h, d] of [[0.62, 0.5, 0.76], [0.52, 0.46, 0.66], [0.56, 0.36, 0.7]]) {
      const g = new THREE.BoxGeometry(w, h, d);
      part.add("paint", g, { p: [side * 1.18 + r.range(-0.03, 0.03), y + h / 2, z + r.range(-0.03, 0.03)], r: [0, r.range(-0.08, 0.08), 0], color: shade(0xffffff, r.range(0.88, 1.0)), uvRect: UV.travertine });
      y += h;
    }
  }
  // Fallen fluted marble drum resting across the line (underside at 1.36 m).
  const drum = flutedColumn(0.3, 2.75);
  part.add("paint", drum, { p: [0, 1.66, z], r: [0, 0, Math.PI / 2 + 0.03], uvRect: UV.marble, color: 0xffffff });
  // Ionic capital fragment at one end.
  part.box("paint", [1.25, 1.32, z - 0.42], [1.55, 1.42, z + 0.42], 0xf4f2ec, UV.marble);
  for (const dz of [-0.36, 0.36]) part.add("paint", new THREE.TorusGeometry(0.12, 0.05, 8, 16), { p: [1.4, 1.48, z + dz], r: [0, Math.PI / 2, 0], uvRect: UV.marble });
  // Broken edge chips and ivy.
  for (let i = 0; i < 6; i++) part.add("paint", new THREE.DodecahedronGeometry(r.range(0.05, 0.09), 0), { p: [r.range(-1.3, 1.3), 0.04, z + r.pick([-0.45, 0.4])], r: [r.range(0, 3), r.range(0, 3), 0], uvRect: UV.marble });
  for (let i = 0; i < 18; i++) {
    const side = r.pick([-1, 1]);
    part.add("matte", new THREE.SphereGeometry(0.06, 6, 4), {
      p: [side * (0.9 + r.range(0, 0.1)), r.range(0.2, 1.3), z + r.range(-0.36, 0.36)],
      s: [0.4, 1, 1],
      r: [r.range(0, 3), 0, 0],
      color: r.pick([0x3f6b2a, 0x4f7d33, 0x335a24]),
    });
  }
  return part;
}

function gateScaffold() {
  const part = new Part("gate:scaffold", { kit: "gate" });
  const tube = 0x9aa0a3;
  const z0 = -0.05;
  const z1 = -0.55;
  for (const x of [-1.12, 1.12]) {
    for (const z of [z0, z1]) {
      part.rod("trim", [x, 0, z], [x, 2.6, z], 0.03, tube, 8);
      part.box("trim", [x - 0.08, 0, z - 0.08], [x + 0.08, 0.02, z + 0.08], 0x5d6164);
    }
    part.rod("trim", [x, 0.25, z0], [x, 2.3, z1], 0.025, tube, 8);
    for (const y of [1.3, 2.5]) part.rod("trim", [x, y, z0], [x, y, z1], 0.028, tube, 8);
  }
  for (const z of [z0, z1]) {
    for (const y of [1.3, 2.5]) part.rod("trim", [-1.12, y, z], [1.12, y, z], 0.028, tube, 8);
    // Swivel couplers at each joint.
    for (const x of [-1.12, 1.12]) for (const y of [1.3, 2.5]) part.box("trim", [x - 0.05, y - 0.05, z - 0.05], [x + 0.05, y + 0.05, z + 0.05], 0x5d6164);
  }
  // Chevron board and timber toe boards across the top.
  part.box("paint", [-1.06, 1.36, z0 + 0.01], [1.06, 1.78, z0 + 0.05], 0xffffff, UV.chevron);
  for (let k = 0; k < 3; k++) part.box("paint", [-1.2, 2.53, z0 + 0.02 - k * 0.2], [1.2, 2.58, z0 - 0.16 - k * 0.2], shade(0xffffff, 0.85 + k * 0.05), UV.crate);
  // Green safety net panel above the board.
  part.box("matte", [-1.08, 1.82, z0 + 0.0], [1.08, 2.46, z0 + 0.012], 0x2f6b3b);
  for (let k = 0; k < 9; k++) part.box("matte", [-1.08 + k * 0.27, 1.82, z0 + 0.012], [-1.06 + k * 0.27, 2.46, z0 + 0.016], 0x1f4a29);
  // Hanging work lamp.
  part.rod("trim", [0.55, 2.5, z0 + 0.02], [0.55, 2.3, z0 + 0.02], 0.008, 0x1d1d1d, 4);
  part.add("beacon", new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), { p: [0.55, 2.24, z0 + 0.02] });
  return part;
}

export async function buildObstacles() {
  const atlas = await obstacleAtlas();
  const materials = {
    paint: { map: atlas, roughness: 0.62, metalness: 0.02, vertexColors: true, envIntensity: 0.45, kit: "propPaint" },
    trim: { color: 0xffffff, roughness: 0.45, metalness: 0.55, vertexColors: true, envIntensity: 0.9, kit: "trim" },
    matte: { color: 0xffffff, roughness: 0.62, metalness: 0, vertexColors: true, envIntensity: 0.35, kit: "matte" },
    beacon: { color: 0xffb02e, emissive: 0xff9a1a, roughness: 0.25, metalness: 0, kit: "beacon" },
    signal: { color: 0xff3326, emissive: 0xff2414, roughness: 0.25, metalness: 0, kit: "signal" },
  };
  const parts = [barrierWorks(), barrierTravertine(), barrierCrates(), gateCrossing(), gateColumn(), gateScaffold()];
  return { materials, parts, extras: {} };
}

/* ---------------------------------------------------------------- pickups */

async function coinTextures() {
  const size = 512;
  const height = new Svg(size, size / 2);
  const albedo = new Svg(size, size / 2);
  const face = (svg, mode) => {
    const H = mode === "height";
    const c = size / 4;
    const rr = size / 4;
    svg.rect(0, 0, size, size / 2, H ? "#808080" : "#d6a53a");
    // Raised rim, field, laurel wreath and SPQR legend.
    svg.add(`<circle cx="${c}" cy="${c}" r="${rr}" fill="${H ? "#c8c8c8" : "#e8bd52"}"/>`);
    svg.add(`<circle cx="${c}" cy="${c}" r="${rr * 0.86}" fill="${H ? "#5a5a5a" : "#c99a33"}"/>`);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      svg.add(`<circle cx="${(c + Math.cos(a) * rr * 0.81).toFixed(1)}" cy="${(c + Math.sin(a) * rr * 0.81).toFixed(1)}" r="${(rr * 0.025).toFixed(1)}" fill="${H ? "#9a9a9a" : "#e3b54a"}"/>`);
    }
    const leaves = [];
    for (let i = 0; i < 22; i++) {
      for (const side of [-1, 1]) {
        const t = i / 22;
        const a = Math.PI / 2 + side * (0.25 + t * 2.55);
        const x = c + Math.cos(a) * rr * 0.66;
        const y = c + Math.sin(a) * rr * 0.66;
        const deg = (a * 180) / Math.PI + (side > 0 ? 60 : 120);
        leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(rr * 0.11).toFixed(1)}" ry="${(rr * 0.045).toFixed(1)}" transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${H ? "#d8d8d8" : "#f2cc63"}"/>`);
      }
    }
    svg.add(leaves.join(""));
    svg.add(`<text x="${c}" y="${c + rr * 0.15}" font-family="C059" font-weight="bold" font-size="${(rr * 0.42).toFixed(0)}" text-anchor="middle" fill="${H ? "#e6e6e6" : "#f6d575"}">SPQR</text>`);
    svg.add(`<rect x="${c - rr * 0.36}" y="${c + rr * 0.26}" width="${rr * 0.72}" height="${rr * 0.05}" fill="${H ? "#d0d0d0" : "#efc85c"}"/>`);
    if (!H) {
      svg.add(`<circle cx="${c}" cy="${c}" r="${rr}" fill="${svg.radialGradient([[0, "#fff5c8", 0.18], [0.7, "#000", 0], [1, "#5a3a00", 0.25]])}"/>`);
    }
    // Reeded edge strip (right half).
    for (let x = size / 2; x < size; x += 8) {
      svg.rect(x, 0, 4, size / 2, H ? "#b0b0b0" : "#e2b54c");
      svg.rect(x + 4, 0, 4, size / 2, H ? "#5a5a5a" : "#b88a2a");
    }
  };
  face(height, "height");
  face(albedo, "albedo");
  const blur = height.id("b");
  height.def(`<filter id="${blur}"><feGaussianBlur stdDeviation="1.4"/></filter>`);
  height.body = [`<g filter="url(#${blur})">${height.body.join("")}</g>`];
  return { albedo: await svgToWebp(albedo, { quality: 90 }), normal: await svgToNormalMap(height, { strength: 4.5 }) };
}

function coinPart() {
  const part = new Part("coin:aureus", { kit: "coin" });
  const radius = 0.34;
  const half = 0.05;
  const faceUv = (g, mirror) => {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * (mirror ? -1 : 1);
      const y = pos.getY(i);
      uv.setXY(i, 0.25 + (x / radius) * 0.25, 0.5 - (y / radius) * 0.5);
    }
    return g;
  };
  const front = faceUv(new THREE.CircleGeometry(radius, 40), false);
  part.add("gold", front, { p: [0, 0, half] });
  const back = faceUv(new THREE.CircleGeometry(radius, 40), true);
  part.add("gold", back, { p: [0, 0, -half], r: [0, Math.PI, 0] });
  const edge = new THREE.CylinderGeometry(radius, radius, half * 2, 40, 1, true);
  const uv = edge.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.5 * 0.999, uv.getY(i));
  part.add("gold", edge, { r: [Math.PI / 2, 0, 0] });
  return part;
}

async function shieldTexture() {
  const svg = new Svg(512, 512);
  svg.rect(0, 0, 512, 512, "#1f5fd1");
  svg.rect(0, 0, 512, 512, svg.radialGradient([[0, "#5a9cff", 0.6], [1, "#0c2a6b", 0.6]]));
  // Golden wings and thunderbolts of the legionary scutum.
  const gold = "#f2c64e";
  svg.add(`<circle cx="256" cy="256" r="70" fill="${gold}"/>`);
  for (const s of [-1, 1]) {
    svg.add(`<path d="M ${256 + s * 60} 240 C ${256 + s * 140} 170, ${256 + s * 200} 190, ${256 + s * 230} 120 C ${256 + s * 210} 230, ${256 + s * 150} 270, ${256 + s * 60} 280 Z" fill="${gold}"/>`);
    svg.add(`<path d="M ${256 + s * 60} 270 C ${256 + s * 130} 300, ${256 + s * 190} 330, ${256 + s * 220} 400 C ${256 + s * 160} 360, ${256 + s * 120} 330, ${256 + s * 60} 300 Z" fill="${gold}"/>`);
    svg.add(`<polygon points="${256 + s * 8},330 ${256 + s * 40},420 ${256 + s * 18},420 ${256 + s * 48},500 ${256 - s * 4},400 ${256 + s * 22},400 ${256 - s * 6},330" fill="${gold}"/>`);
    svg.add(`<polygon points="${256 + s * 8},182 ${256 + s * 40},92 ${256 + s * 18},92 ${256 + s * 48},12 ${256 - s * 4},112 ${256 + s * 22},112 ${256 - s * 6},182" fill="${gold}"/>`);
  }
  svg.rect(12, 12, 488, 488, "none", 'stroke="#f2c64e" stroke-width="14" rx="30"');
  svg.noise(0, 0, 512, 512, { freq: "0.04", seed: 71, color: "#06142e", opacity: 0.25 });
  return svgToWebp(svg, { quality: 88 });
}

function wreathPart() {
  const part = new Part("power:multiplier", { kit: "power" });
  const r = rng(12);
  const radius = 0.34;
  part.add("gloss", new THREE.TorusGeometry(radius, 0.022, 8, 40, Math.PI * 1.72), { r: [0, 0, -Math.PI / 2 + 0.28 * Math.PI], color: 0x7a5a1c });
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const a = -Math.PI / 2 + 0.28 * Math.PI + t * Math.PI * 1.72;
    for (const out of [-1, 1]) {
      const x = Math.cos(a) * (radius + out * 0.05);
      const y = Math.sin(a) * (radius + out * 0.05);
      part.add("gloss", new THREE.SphereGeometry(0.05, 8, 6), {
        p: [x, y, r.range(-0.015, 0.015)],
        r: [0, 0, a + out * 0.7],
        s: [0.55, 1.5, 0.35],
        color: r.pick([0x2f9d4a, 0x3fb35a, 0x268a3f]),
      });
    }
    if (i % 4 === 2) part.add("gloss", new THREE.SphereGeometry(0.025, 8, 6), { p: [Math.cos(a) * radius, Math.sin(a) * radius, 0.035], color: 0xf2c64e });
  }
  // Ribbon tails and central emerald medallion.
  for (const s of [-1, 1]) part.add("gloss", new THREE.BoxGeometry(0.06, 0.2, 0.012), { p: [s * 0.08, -0.42, 0.01], r: [0, 0, s * 0.35], color: 0xc8232c });
  part.add("gloss", new THREE.CylinderGeometry(0.16, 0.16, 0.05, 28), { r: [Math.PI / 2, 0, 0], color: 0xf2c64e });
  part.add("gem", new THREE.OctahedronGeometry(0.11, 0), { p: [0, 0, 0.04], s: [1, 1, 0.6] });
  part.add("gem", new THREE.OctahedronGeometry(0.11, 0), { p: [0, 0, -0.04], s: [1, 1, 0.6] });
  return part;
}

function magnetPart() {
  const part = new Part("power:magnet", { kit: "power" });
  const path = new THREE.CurvePath();
  const legs = 0.2;
  const rad = 0.2;
  path.add(new THREE.LineCurve3(new THREE.Vector3(-rad, -legs, 0), new THREE.Vector3(-rad, 0, 0)));
  path.add(new THREE.CatmullRomCurve3(
    Array.from({ length: 13 }, (_, k) => {
      const a = Math.PI - (k / 12) * Math.PI;
      return new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0);
    }),
  ));
  path.add(new THREE.LineCurve3(new THREE.Vector3(rad, 0, 0), new THREE.Vector3(rad, -legs, 0)));
  part.add("gloss", new THREE.TubeGeometry(path, 40, 0.085, 14, false), { p: [0, 0.08, 0], color: 0xd2232a });
  for (const s of [-1, 1]) {
    part.add("gloss", new THREE.CylinderGeometry(0.088, 0.088, 0.12, 14), { p: [s * rad, 0.08 - legs - 0.06, 0], color: 0xe2e5e8 });
    part.add("gloss", new THREE.CylinderGeometry(0.06, 0.06, 0.005, 14), { p: [s * rad, 0.08 - legs - 0.123, 0], color: 0x9aa0a6 });
  }
  return part;
}

function shieldPart() {
  const part = new Part("power:shield", { kit: "power" });
  const radius = 0.85;
  const arc = 0.66;
  const height = 0.78;
  const front = new THREE.CylinderGeometry(radius, radius, height, 18, 1, true, Math.PI - arc / 2, arc);
  const uv = front.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - (Math.PI - arc / 2) / (Math.PI * 2)) / (arc / (Math.PI * 2)), 1 - uv.getY(i));
  // Cylinder slice faces -Z by default: rotate so the painted face looks +Z.
  part.add("shieldPaint", front, { p: [0, 0, -(radius - 0.05)], r: [0, Math.PI, 0] });
  const back = new THREE.CylinderGeometry(radius - 0.03, radius - 0.03, height, 18, 1, true, Math.PI - arc / 2, arc);
  part.add("gloss", back, { p: [0, 0, -(radius - 0.05)], r: [0, Math.PI, 0], color: 0x5a3a1f, flip: true });
  const edgePts = [];
  for (let k = 0; k <= 18; k++) {
    const a = -arc / 2 + (k / 18) * arc;
    edgePts.push([Math.sin(a) * radius, Math.cos(a) * radius - radius + 0.05]);
  }
  for (const y of [-height / 2, height / 2]) {
    for (let k = 0; k < edgePts.length - 1; k++) {
      const [x0, z0] = edgePts[k];
      const [x1, z1] = edgePts[k + 1];
      part.rod("gloss", [x0, y, z0], [x1, y, z1], 0.022, 0xf2c64e, 8);
    }
  }
  for (const k of [0, edgePts.length - 1]) {
    const [x, z] = edgePts[k];
    part.rod("gloss", [x, -height / 2, z], [x, height / 2, z], 0.022, 0xf2c64e, 8);
  }
  part.add("gloss", new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0, 0.06], r: [Math.PI / 2, 0, 0], color: 0xf2c64e });
  return part;
}

export async function buildPickups() {
  const coin = await coinTextures();
  const materials = {
    gold: { map: coin.albedo, normalMap: coin.normal, roughness: 0.26, metalness: 1, emissive: 0x3a2600, envIntensity: 1.5, kit: "gold" },
    gloss: { color: 0xffffff, roughness: 0.3, metalness: 0.45, vertexColors: true, envIntensity: 1.3, kit: "gloss" },
    gem: { color: 0x34d36b, emissive: 0x0f7a35, roughness: 0.1, metalness: 0.2, envIntensity: 1.6, kit: "gem" },
    shieldPaint: { map: await shieldTexture(), roughness: 0.35, metalness: 0.25, emissive: 0x0b1f4a, envIntensity: 1.1, doubleSided: false, kit: "shieldPaint" },
  };
  return { materials, parts: [coinPart(), wreathPart(), magnetPart(), shieldPart()], extras: {} };
}
