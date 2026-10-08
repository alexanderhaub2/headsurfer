/**
 * Modular Italian-inspired rolling stock. Passenger trains are composed at
 * runtime from a cab, repeatable 2.1 m bays (door / window / joint), a tail cap
 * and unscaled bogies. Freight consists mix long boxcars, short two-axle
 * boxcars and tank wagons. Every module faces +Z with its front at z = 0.
 */
import { Part, Svg, THREE, cap, clipRect, loft, makeProfile, rng, svgToWebp } from "./lib.mjs";

const BAY = 2.1;
const AXLE_Y = 0.142 + 0.32;
const ATLAS = 1024;
const COL = 0.75;

/* ------------------------------------------------------------ running gear */

function wheelset(part, z, { gauge = 0.55, radius = 0.32, hub = 0x3a3c3f, tread = 0x8d9196 } = {}) {
  for (const side of [-1, 1]) {
    const x = side * gauge;
    part.add("trim", new THREE.CylinderGeometry(radius, radius, 0.1, 22), { p: [x, AXLE_Y, z], r: [0, 0, Math.PI / 2], color: tread });
    part.add("trim", new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.12, 16), { p: [x - side * 0.01, AXLE_Y, z], r: [0, 0, Math.PI / 2], color: hub });
    part.add("trim", new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), { p: [x + side * 0.08, AXLE_Y, z], r: [0, 0, Math.PI / 2], color: 0x2a2b2d });
  }
  part.rod("trim", [-gauge, AXLE_Y, z], [gauge, AXLE_Y, z], 0.055, 0x3b3d40, 8);
}

function passengerBogie() {
  const part = new Part("bogie:passenger", { kit: "bogie" });
  const frame = 0x2b2d31;
  for (const z of [-0.9, 0.9]) wheelset(part, z);
  for (const side of [-1, 1]) {
    const x = side * 0.68;
    part.box("trim", [x - 0.06, 0.4, -1.25], [x + 0.06, 0.62, 1.25], frame);
    part.box("trim", [x - 0.07, 0.36, -0.42], [x + 0.07, 0.66, 0.42], 0x24262a);
    for (const z of [-0.9, 0.9]) {
      part.box("trim", [x - 0.08, AXLE_Y - 0.1, z - 0.13], [x + 0.08, AXLE_Y + 0.1, z + 0.13], 0x3d4045);
      for (const dz of [-0.17, 0.17]) part.add("trim", new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), { p: [x, 0.62, z + dz], color: 0x9a3a2a });
    }
    // Air-spring secondary suspension.
    part.add("trim", new THREE.CylinderGeometry(0.13, 0.12, 0.1, 16), { p: [x, 0.7, 0], color: 0x161718 });
    // Brake calipers.
    const inner = side > 0 ? [x - 0.19, x - 0.08] : [x + 0.08, x + 0.19];
    for (const z of [-0.9, 0.9]) part.box("trim", [inner[0], AXLE_Y - 0.05, z - 0.36], [inner[1], AXLE_Y + 0.08, z - 0.24], 0x45484d);
  }
  part.box("trim", [-0.68, 0.46, -0.16], [0.68, 0.6, 0.16], frame);
  part.box("trim", [-0.32, 0.3, -0.62], [0.32, 0.56, -0.22], 0x33363a);
  part.box("trim", [-0.32, 0.3, 0.22], [0.32, 0.56, 0.62], 0x33363a);
  return part;
}

function freightBogie() {
  const part = new Part("bogie:freight", { kit: "bogie" });
  const frame = 0x2c2a27;
  for (const z of [-0.9, 0.9]) wheelset(part, z, { hub: 0x34312d, tread: 0x8a8580 });
  for (const side of [-1, 1]) {
    const x = side * 0.7;
    part.box("trim", [x - 0.055, 0.42, -1.18], [x + 0.055, 0.6, 1.18], frame);
    part.box("trim", [x - 0.05, 0.3, -0.3], [x + 0.05, 0.62, 0.3], frame);
    for (const z of [-0.9, 0.9]) {
      part.box("trim", [x - 0.08, AXLE_Y - 0.11, z - 0.12], [x + 0.08, AXLE_Y + 0.1, z + 0.12], 0x3a3733);
      for (const dz of [-0.07, 0.07]) part.add("trim", new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8), { p: [x, 0.62, z + dz], color: 0xb48a2a });
    }
  }
  part.box("trim", [-0.7, 0.44, -0.18], [0.7, 0.6, 0.18], frame);
  return part;
}

function freightAxle() {
  const part = new Part("axle:freight", { kit: "bogie" });
  wheelset(part, 0, { hub: 0x34312d, tread: 0x8a8580 });
  for (const side of [-1, 1]) {
    const x = side * 0.7;
    // Leaf spring pack and W-iron axle guard.
    for (let k = 0; k < 5; k++) {
      const half = 0.62 - k * 0.1;
      part.box("trim", [x - 0.05, 0.6 + k * 0.025, -half], [x + 0.05, 0.622 + k * 0.025, half], k % 2 ? 0x3b3833 : 0x2e2b27);
    }
    part.box("trim", [x - 0.06, 0.36, -0.2], [x + 0.06, 0.74, -0.14], 0x2a2724);
    part.box("trim", [x - 0.06, 0.36, 0.14], [x + 0.06, 0.74, 0.2], 0x2a2724);
    part.box("trim", [x - 0.08, AXLE_Y - 0.1, -0.12], [x + 0.08, AXLE_Y + 0.1, 0.12], 0x3a3733);
  }
  return part;
}

/* -------------------------------------------------------- passenger bodies */

function passengerProfile(h) {
  const { yb, y1, y2, y3, y4, y5, top } = h;
  const left = [[-0.97, yb], [-1.03, y1], [-1.05, y2], [-1.05, y3], [-1.045, y4], [-1.0, y5]];
  const roof = [];
  for (let k = 1; k <= 9; k++) {
    const phi = Math.PI - (k / 10) * Math.PI;
    roof.push([Math.cos(phi) * 1.0, y5 + (top - y5) * Math.pow(Math.sin(phi), 0.75)]);
  }
  const right = left.slice().reverse().map(([x, y]) => [-x, y]);
  const profile = makeProfile([...left, ...roof, ...right]);
  // Arc length of a left-side height (sides are monotonic in y).
  profile.sAt = (y) => {
    for (let i = 0; i < 5; i++) {
      const [, ya] = left[i];
      const [, yb2] = left[i + 1];
      if (y <= yb2 || i === 4) {
        const t = Math.min(1, Math.max(0, (y - ya) / (yb2 - ya)));
        return profile.s[i] + t * (profile.s[i + 1] - profile.s[i]);
      }
    }
    return profile.s[5];
  };
  profile.h = h;
  return profile;
}

const TYPES = {
  metro: {
    label: "Metro Roma",
    heights: { yb: 0.7, y1: 0.86, y2: 1.3, y3: 1.46, y4: 2.26, y5: 2.54, top: 2.98 },
    nose: { N: 0.5, sx0: 0.95, sy0: 0.93, fx: (t) => t, fy: (t) => t },
    C: 3.5,
    capGlass: { yA: 1.42, yB: 2.4, inset: 0.14 },
    cabWindows: [[-0.72, -1.22], [-1.9, -3.2]],
    cabDoor: [-0.62, -1.4],
    bays: {
      D: { door: [-0.45, -1.65], windows: [[-0.56, -1.03], [-1.07, -1.54]] },
      W: { windows: [[-0.22, -1.88]] },
      J: { seam: true, windows: [[-0.36, -1.88]] },
    },
    pattern: ["D", "W", "J"],
    pantograph: true,
    lamps: [
      { kind: "rect", x: 0.6, y: 1.06, w: 0.3, h: 0.11 },
      { kind: "round", x: 0.52, y: 2.58, r: 0.035 },
    ],
    buffers: false,
    body: { roughness: 0.3, metalness: 0.62 },
    livery: {
      base: "#c5c9cd", brushed: true, lower: null,
      stripes: [{ from: 1.16, to: 1.34, color: "#b3262d" }],
      windowBand: { color: "#2b3036", pad: 0.06 },
      roof: "#6f757b", skirt: "#24272b",
      door: { color: "#b3262d", frame: "#1d1f22" },
      frontBase: "#b3262d", frontUpper: "#c5c9cd",
    },
  },
  regional: {
    label: "Regionale Vesuvio",
    heights: { yb: 0.7, y1: 0.86, y2: 1.3, y3: 1.48, y4: 2.22, y5: 2.52, top: 2.98 },
    nose: { N: 1.25, sx0: 0.76, sy0: 0.8, fx: (t) => Math.sin((t * Math.PI) / 2), fy: (t) => Math.pow(t, 0.75) },
    C: 4.1,
    windscreen: { z: [-0.06, -0.98], from: "y3" },
    capGlass: { yA: 1.48, yB: 2.52, inset: 0.09 },
    cabWindows: [[-1.42, -1.9], [-2.55, -3.85]],
    cabDoor: [-1.32, -2.0],
    bays: {
      D: { door: [-0.5, -1.6], windows: [[-0.6, -1.03], [-1.07, -1.5]] },
      W: { windows: [[-0.25, -1.85]] },
      J: { seam: true, windows: [[-0.4, -1.85]] },
    },
    pattern: ["D", "W", "J"],
    pantograph: true,
    lamps: [
      { kind: "round", x: 0.46, y: 1.02, r: 0.085 },
      { kind: "round", x: 0, y: "top", r: 0.06 },
    ],
    buffers: true,
    body: { roughness: 0.4, metalness: 0.12 },
    livery: {
      base: "#efe7d4", lower: { to: 1.36, color: "#b5583a" },
      stripes: [{ from: 1.36, to: 1.43, color: "#2f7771" }, { from: 2.3, to: 2.36, color: "#2f7771" }],
      windowBand: { color: "#262b2f", pad: 0.05 },
      roof: "#7d7a74", skirt: "#2a2b2d",
      door: { color: "#2f7771", frame: "#1f2a2a" },
      frontBase: "#efe7d4", frontChin: "#b5583a",
    },
  },
  littorina: {
    label: "Littorina 1930s",
    heights: { yb: 0.72, y1: 0.88, y2: 1.34, y3: 1.56, y4: 2.16, y5: 2.48, top: 2.9 },
    nose: { N: 1.6, sx0: 0.6, sy0: 0.82, fx: (t) => Math.sqrt(t), fy: (t) => Math.pow(t, 0.45) },
    C: 4.0,
    capGlass: { yA: 1.56, yB: 2.16, inset: 0.07, panes: 3 },
    windscreen: { z: [-0.1, -0.72], from: "band" },
    cabWindows: [[-1.0, -1.45], [-2.0, -2.6], [-2.85, -3.45]],
    cabDoor: [-1.72, -1.9],
    bays: {
      D: { door: [-0.3, -1.12], windows: [[-0.42, -1.0], [-1.32, -1.9]] },
      W: { windows: [[-0.2, -0.95], [-1.15, -1.9]] },
      J: { seam: true, windows: [[-0.3, -0.98], [-1.18, -1.9]] },
    },
    pattern: ["W", "D", "J"],
    pantograph: false,
    lamps: [
      { kind: "round", x: 0.34, y: 1.04, r: 0.11 },
      { kind: "round", x: 0, y: "top", r: 0.065 },
    ],
    buffers: true,
    body: { roughness: 0.38, metalness: 0.1 },
    livery: {
      base: "#d8c39a", lower: { to: 1.42, color: "#5b3a29" },
      stripes: [{ from: 1.42, to: 1.46, color: "#d9d9d6" }, { from: 2.33, to: 2.37, color: "#5b3a29" }],
      windowBand: null, frames: "#c9c7c2",
      roof: "#6e6a63", skirt: "#2a2420",
      door: { color: "#5b3a29", frame: "#2a1c14" },
      frontBase: "#d8c39a", frontChin: "#5b3a29", whiskers: "#d9d9d6",
    },
  },
  express: {
    label: "Notte Express",
    heights: { yb: 0.62, y1: 0.8, y2: 1.28, y3: 1.5, y4: 2.24, y5: 2.54, top: 2.98 },
    nose: { N: 2.6, sx0: 0.62, sy0: 0.47, fx: (t) => Math.pow(t, 0.55), fy: (t) => Math.pow(t, 0.9) },
    C: 4.9,
    windscreen: { z: [-0.82, -2.08], from: "y3" },
    cabWindows: [[-2.5, -2.95], [-3.35, -4.75]],
    cabDoor: [-2.36, -3.05],
    bays: {
      D: { door: [-0.6, -1.5], windows: [[-0.7, -1.4]] },
      W: { windows: [[-0.15, -1.95]] },
      J: { seam: true, windows: [[-0.3, -1.95]] },
    },
    pattern: ["W", "J", "D", "W", "J"],
    pantograph: true,
    lamps: [
      { kind: "rect", x: 0.36, y: 1.02, w: 0.28, h: 0.065 },
      { kind: "rect", x: 0.22, y: 1.3, w: 0.16, h: 0.04 },
    ],
    buffers: false,
    body: { roughness: 0.28, metalness: 0.28 },
    livery: {
      base: "#1d2a4a", lower: null,
      stripes: [{ from: 1.36, to: 1.46, color: "#e0a33a" }, { from: 1.3, to: 1.33, color: "#f2efe6" }],
      windowBand: { color: "#12161d", pad: 0.06 },
      roof: "#9a9fa6", skirt: "#141820",
      door: { color: "#26375c", frame: "#0d121b" },
      frontBase: "#1d2a4a", frontStripe: "#e0a33a",
    },
  },
};

function noseRing(spec) {
  const { N, sx0, sy0, fx, fy } = spec.nose;
  const yb = spec.heights.yb;
  return (z, [x, y]) => {
    const t = Math.min(1, Math.max(0, -z / N));
    const sx = sx0 + (1 - sx0) * fx(t);
    const sy = sy0 + (1 - sy0) * fy(t);
    return [x * sx, yb + (y - yb) * sy];
  };
}

function stationsFor(boundaries, length, maxGap = 0.32, dense = null) {
  const set = new Set([0, -length, ...boundaries.map((z) => Math.max(-length, Math.min(0, z)))]);
  if (dense) for (let k = 1; k <= 14; k++) set.add(-dense * Math.pow(k / 14, 1.35));
  let list = [...set].sort((a, b) => b - a);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(list[i]);
    if (i < list.length - 1) {
      const gap = list[i] - list[i + 1];
      const n = Math.ceil(gap / maxGap);
      for (let k = 1; k < n; k++) out.push(list[i] - (gap * k) / n);
    }
  }
  return [...new Set(out.map((v) => Math.round(v * 1e5) / 1e5))].sort((a, b) => b - a);
}

/** Classifies loft quads into body or glass for a module's window layout. */
function glassClassifier(profile, { windows = [], windscreen = null }) {
  const { sAt, S, h } = profile;
  const bandL = [sAt(h.y3), sAt(h.y4)];
  const bandR = [S - bandL[1], S - bandL[0]];
  const inBand = (s) => (s > bandL[0] && s < bandL[1]) || (s > bandR[0] && s < bandR[1]);
  return (s, z) => {
    if (windscreen) {
      const [z0, z1] = windscreen.z;
      if (z < z0 && z > z1) {
        if (windscreen.from === "band" ? inBand(s) : s > sAt(h.y3) && s < S - sAt(h.y3)) return "glass";
      }
    }
    if (inBand(s)) for (const [z0, z1] of windows) if (z < z0 && z > z1) return "glass";
    return "body";
  };
}

/* ------------------------------------------------------------ atlas paint */

function makePainter(svg, profile, spec) {
  const { sAt, S, h } = profile;
  const X = (sn) => sn * ATLAS * COL;
  const regions = {
    D: [0, 1 / 6], W: [1 / 6, 2 / 6], J: [2 / 6, 3 / 6], cab: [0.5, 1],
  };
  const lengthOf = (region) => (region === "cab" ? spec.C : BAY);
  const Y = (region, z) => {
    const [v0, v1] = regions[region];
    return (v0 + (v1 - v0) * (-z / lengthOf(region))) * ATLAS;
  };
  const sideRects = (yA, yB) => [
    [sAt(yA) / S, sAt(yB) / S],
    [1 - sAt(yB) / S, 1 - sAt(yA) / S],
  ];
  return {
    regions,
    Y,
    X,
    band(region, yA, yB, fill, z0 = 0, z1 = -lengthOf(region), extra = "") {
      for (const [a, b] of sideRects(yA, yB)) svg.rect(X(a), Y(region, z0), X(b) - X(a), Y(region, z1) - Y(region, z0), fill, extra);
    },
    roof(region, fill, extra = "") {
      const a = sAt(h.y5) / S;
      svg.rect(X(a), Y(region, 0), X(1 - a) - X(a), Y(region, -lengthOf(region)) - Y(region, 0), fill, extra);
    },
    span(region, sA, sB, z0, z1, fill, extra = "") {
      svg.rect(X(sA / S), Y(region, z0), X(sB / S) - X(sA / S), Y(region, z1) - Y(region, z0), fill, extra);
    },
    sAt,
    S,
    h,
  };
}

function paintSide(svg, p, region, spec, layout) {
  const L = spec.livery;
  const h = p.h;
  const len = region === "cab" ? spec.C : BAY;
  const [v0, v1] = p.regions[region];
  const top = v0 * ATLAS;
  const height = (v1 - v0) * ATLAS;
  svg.rect(0, top, ATLAS * COL, height, L.base);
  if (L.brushed) {
    svg.noise(0, top, ATLAS * COL, height, { freq: "0.35 0.004", octaves: 2, seed: 11 + top, color: "#ffffff", opacity: 0.35 });
    svg.noise(0, top, ATLAS * COL, height, { freq: "0.25 0.006", octaves: 2, seed: 17 + top, color: "#5d6268", opacity: 0.3 });
  }
  if (L.lower) p.band(region, h.yb, L.lower.to, L.lower.color);
  for (const stripe of L.stripes) p.band(region, stripe.from, stripe.to, stripe.color);
  p.roof(region, L.roof);
  if (region === "cab" && spec.nose.N > 1.5) {
    // Streamlined hoods keep the livery colour instead of the roof grey.
    const a = p.sAt(h.y5);
    p.span(region, a, p.S - a, 0, -spec.nose.N * 0.92, L.noseRoof ?? L.base);
  }
  p.band(region, h.yb, h.y1, L.skirt);
  if (L.windowBand) p.band(region, h.y3 - L.windowBand.pad, h.y4 + L.windowBand.pad, L.windowBand.color);

  if (layout.door) {
    const [z0, z1] = layout.door;
    p.band(region, h.y1 - 0.02, h.y4 + 0.14, L.door.frame, z0 + 0.03, z1 - 0.03);
    p.band(region, h.y1, h.y4 + 0.11, L.door.color, z0, z1);
    const mid = (z0 + z1) / 2;
    p.band(region, h.y1, h.y4 + 0.11, L.door.frame, mid + 0.012, mid - 0.012);
    // Door push-button plates and warning lamp.
    p.band(region, 1.55, 1.63, "#e8c24a", mid + 0.09, mid + 0.05);
    p.band(region, h.y4 + 0.15, h.y4 + 0.2, "#ff9a3c", mid + 0.05, mid - 0.05);
    for (const [zA, zB] of layout.doorGlass ?? []) {
      p.band(region, h.y3 - 0.035, h.y4 + 0.035, "#121417", zA + 0.035, zB - 0.035, 'rx="4"');
    }
  }
  const frameColor = L.frames ?? "#15171a";
  for (const [z0, z1] of layout.windows ?? []) {
    p.band(region, h.y3 - 0.045, h.y4 + 0.045, frameColor, z0 + 0.045, z1 - 0.045, 'rx="5"');
    p.band(region, h.y3 - 0.012, h.y4 + 0.012, "#0e1115", z0 + 0.012, z1 - 0.012);
  }
  if (layout.seam) {
    p.band(region, h.yb, p.h.top, "#101113", 0, -0.035);
    svg.rect(0, top, ATLAS * COL, 4, "#101113");
  }
  if (region !== "cab") {
    // Bay-end panel lines keep repeated bays readable.
    svg.rect(0, top + height - 1.5, ATLAS * COL, 1.5, "#000000", 'opacity="0.18"');
  }
  // Underframe grime and roof soot.
  const grime = svg.linearGradient(
    [
      [0, "#1b1712", 0.55], [0.1, "#1b1712", 0.12], [0.3, "#1b1712", 0], [0.5, "#2a241d", 0.22], [0.7, "#1b1712", 0], [0.9, "#1b1712", 0.12], [1, "#1b1712", 0.55],
    ],
    { x1: 0, y1: 0, x2: 1, y2: 0 },
  );
  svg.rect(0, top, ATLAS * COL, height, grime);
  svg.noise(0, top, ATLAS * COL, height, { freq: "0.02 0.05", seed: 41 + top, color: "#2b2117", opacity: 0.32 });
  void len;
}

function paintFront(svg, spec, capBox, ringAtFront) {
  const L = spec.livery;
  const { xmin, xmax, ymin, ymax } = capBox;
  const FX = (x) => ATLAS * COL + ((x - xmin) / (xmax - xmin)) * ATLAS * (1 - COL);
  const FY = (y) => ((ymax - y) / (ymax - ymin)) * ATLAS * 0.25;
  const rect = (x0, y0, x1, y1, fill, extra = "") => svg.rect(FX(x0), FY(y1), FX(x1) - FX(x0), FY(y0) - FY(y1), fill, extra);
  const Yf = (y) => ringAtFront([0, y])[1];
  rect(xmin, ymin, xmax, ymax, L.frontUpper ?? L.frontBase ?? L.base);
  if (L.lower) rect(xmin, ymin, xmax, Yf(L.lower.to), L.lower.color);
  for (const stripe of L.stripes) rect(xmin, Yf(stripe.from), xmax, Yf(stripe.to), stripe.color);
  if (L.frontBase && L.frontUpper) rect(xmin, ymin, xmax, Yf(1.38), L.frontBase);
  if (L.frontChin) {
    svg.poly(
      [[FX(xmin), FY(Yf(1.0))], [FX(0), FY(Yf(1.3))], [FX(xmax), FY(Yf(1.0))], [FX(xmax), FY(ymin)], [FX(xmin), FY(ymin)]],
      L.frontChin,
    );
  }
  if (L.frontStripe) {
    svg.poly(
      [[FX(xmin), FY(Yf(1.36))], [FX(0), FY(Yf(1.0))], [FX(xmax), FY(Yf(1.36))], [FX(xmax), FY(Yf(1.46))], [FX(0), FY(Yf(1.12))], [FX(xmin), FY(Yf(1.46))]],
      L.frontStripe,
    );
  }
  if (L.whiskers) {
    for (let k = 0; k < 3; k++) {
      const y = Yf(1.12 + k * 0.08);
      svg.poly([[FX(xmin), FY(y)], [FX(-0.18), FY(y)], [FX(0), FY(y - 0.05)], [FX(0.18), FY(y)], [FX(xmax), FY(y)], [FX(xmax), FY(y - 0.025)], [FX(0.18), FY(y - 0.025)], [FX(0), FY(y - 0.075)], [FX(-0.18), FY(y - 0.025)], [FX(xmin), FY(y - 0.025)]], L.whiskers);
    }
  }
  const capGlass = spec.capGlass;
  if (capGlass) {
    const inset = capGlass.inset;
    const yA = Yf(capGlass.yA);
    const yB = Math.min(ymax - 0.04, Yf(capGlass.yB));
    rect(xmin + inset - 0.05, yA - 0.05, xmax - inset + 0.05, yB + 0.05, "#111316", 'rx="6"');
    if (spec === TYPES.metro) {
      // Destination display (abstract LED segments, no text).
      rect(-0.55, yB + 0.06, 0.55, Math.min(ymax - 0.03, yB + 0.2), "#0b0c0e", 'rx="3"');
      for (let i = 0; i < 18; i++) rect(-0.48 + i * 0.054, yB + 0.11, -0.455 + i * 0.054, yB + 0.15, "#ffb238", 'opacity="0.85"');
    }
  }
  for (const lamp of spec.lamps) {
    const y = lamp.y === "top" ? ymax - 0.16 : Yf(lamp.y);
    for (const side of lamp.x === 0 ? [0] : [-1, 1]) {
      const x = side * lamp.x;
      if (lamp.kind === "rect") rect(x - lamp.w / 2 - 0.04, y - lamp.h / 2 - 0.04, x + lamp.w / 2 + 0.04, y + lamp.h / 2 + 0.04, "#16181b", 'rx="5"');
      else svg.add(`<circle cx="${FX(x)}" cy="${FY(y)}" r="${((lamp.r + 0.035) / (xmax - xmin)) * ATLAS * (1 - COL)}" fill="#16181b"/>`);
    }
  }
  rect(xmin, ymin, xmax, Yf(spec.heights.y1), L.skirt);
  const grime = svg.linearGradient([[0, "#000", 0], [0.7, "#1b1712", 0.05], [1, "#1b1712", 0.5]]);
  svg.rect(ATLAS * COL, 0, ATLAS * (1 - COL), ATLAS * 0.25, grime);
  svg.noise(ATLAS * COL, 0, ATLAS * (1 - COL), ATLAS * 0.25, { freq: "0.04", seed: 51, color: "#2b2117", opacity: 0.28 });
}

function paintTail(svg, spec) {
  const L = spec.livery;
  const x0 = ATLAS * COL;
  const w = ATLAS * (1 - COL);
  const y0 = ATLAS * 0.25;
  svg.rect(x0, y0, w, ATLAS * 0.25, L.base);
  if (L.lower) svg.rect(x0, y0 + ATLAS * 0.25 * 0.55, w, ATLAS * 0.25 * 0.45, L.lower.color);
  svg.rect(x0 + w * 0.32, y0 + 40, w * 0.36, ATLAS * 0.25 - 70, "#1d1f22", 'rx="8"');
  for (const side of [0.14, 0.86]) svg.add(`<circle cx="${x0 + w * side}" cy="${y0 + ATLAS * 0.25 * 0.72}" r="9" fill="#b81d1d"/>`);
  svg.rect(x0, y0 + ATLAS * 0.25 - 24, w, 24, L.skirt);
  // Plain livery swatch for small attached body-coloured parts.
  svg.rect(x0, ATLAS * 0.5, w, ATLAS * 0.125, L.base);
}

/* ------------------------------------------------------------- assemblies */

function addLamps(part, spec, ringAtFront, capBox, z = 0) {
  const anchors = [];
  for (const lamp of spec.lamps) {
    const y = lamp.y === "top" ? capBox.ymax - 0.16 : ringAtFront([0, lamp.y])[1];
    for (const side of lamp.x === 0 ? [0] : [-1, 1]) {
      const x = side * lamp.x;
      if (lamp === spec.lamps[0]) anchors.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, z + 0.04]);
      if (lamp.kind === "rect") {
        part.box("trim", [x - lamp.w / 2 - 0.025, y - lamp.h / 2 - 0.025, z - 0.01], [x + lamp.w / 2 + 0.025, y + lamp.h / 2 + 0.025, z + 0.018], 0xb9bdc2);
        part.box("lamp", [x - lamp.w / 2, y - lamp.h / 2, z], [x + lamp.w / 2, y + lamp.h / 2, z + 0.03]);
      } else {
        part.add("trim", new THREE.CylinderGeometry(lamp.r + 0.025, lamp.r + 0.03, 0.04, 18), { p: [x, y, z + 0.008], r: [Math.PI / 2, 0, 0], color: 0xc9ccd0 });
        part.add("lamp", new THREE.SphereGeometry(lamp.r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { p: [x, y, z + 0.02], r: [Math.PI / 2, 0, 0], s: [1, 0.45, 1] });
      }
    }
  }
  return anchors;
}

function addPantograph(part, z, roofY) {
  const metal = 0xbfc3c8;
  for (const [x, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    part.add("trim", new THREE.CylinderGeometry(0.045, 0.06, 0.16, 10), { p: [x, roofY + 0.08, z + dz], color: 0xe6e1d4 });
    for (let k = 0; k < 3; k++) part.add("trim", new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), { p: [x, roofY + 0.04 + k * 0.045, z + dz], color: 0xd9d3c4 });
  }
  part.box("trim", [-0.5, roofY + 0.16, z - 0.5], [0.5, roofY + 0.2, z - 0.4], 0x3a3d41);
  part.box("trim", [-0.5, roofY + 0.16, z + 0.4], [0.5, roofY + 0.2, z + 0.5], 0x3a3d41);
  part.box("trim", [-0.48, roofY + 0.16, z - 0.5], [-0.4, roofY + 0.2, z + 0.5], 0x3a3d41);
  part.box("trim", [0.4, roofY + 0.16, z - 0.5], [0.48, roofY + 0.2, z + 0.5], 0x3a3d41);
  // Folded arms (lowered pantograph) and collector head with horns.
  part.rod("trim", [-0.18, roofY + 0.22, z - 0.35], [-0.12, roofY + 0.38, z + 0.55], 0.025, metal, 8);
  part.rod("trim", [0.18, roofY + 0.22, z - 0.35], [0.12, roofY + 0.38, z + 0.55], 0.025, metal, 8);
  part.rod("trim", [-0.12, roofY + 0.38, z + 0.55], [0, roofY + 0.44, z - 0.6], 0.02, metal, 8);
  part.rod("trim", [0.12, roofY + 0.38, z + 0.55], [0, roofY + 0.44, z - 0.6], 0.02, metal, 8);
  part.box("trim", [-0.72, roofY + 0.43, z - 0.66], [0.72, roofY + 0.47, z - 0.56], 0x2b2c2e);
  for (const side of [-1, 1]) part.rod("trim", [side * 0.72, roofY + 0.45, z - 0.61], [side * 0.86, roofY + 0.38, z - 0.61], 0.018, 0x2b2c2e, 6);
  part.add("trim", new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), { p: [0, roofY + 0.24, z - 0.35], r: [0, 0, Math.PI / 2], color: 0x2f3236 });
}

function addRoofUnit(part, z, roofY, color) {
  part.add("trim", new THREE.BoxGeometry(1.22, 0.2, 1.36, 1, 1, 1), { p: [0, roofY + 0.06, z], color });
  for (const dz of [-0.33, 0.33]) {
    part.add("trim", new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18), { p: [0, roofY + 0.165, z + dz], color: 0x2a2d31 });
    part.add("trim", new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), { p: [0, roofY + 0.175, z + dz], color: 0x5b6067 });
  }
  for (const side of [-1, 1]) part.box("trim", [side * 0.61 - 0.01, roofY + 0.0, z - 0.6], [side * 0.61 + 0.01, roofY + 0.13, z + 0.6], 0x3d4146);
}

function buildPassenger(key, spec, materials) {
  const profile = passengerProfile(spec.heights);
  const h = spec.heights;
  const ring = noseRing(spec);
  const bodyKey = `${key}Body`;
  const parts = [];
  const roofY = h.top - 0.02;
  const uvFor = (region, length) => {
    const v0 = { D: 0, W: 1 / 6, J: 2 / 6, cab: 0.5 }[region];
    const span = region === "cab" ? 0.5 : 1 / 6;
    return (sn, z) => [sn * COL, v0 + span * Math.min(1, Math.max(0, -z / length))];
  };

  /* Cab */
  const cab = new Part(`${key}:cab`, { kit: "cab", length: spec.C, bogieAt: -(spec.nose.N + 0.95), label: spec.label });
  const windowBounds = spec.cabWindows.flat();
  const ws = spec.windscreen;
  const cabStations = stationsFor([...windowBounds, ...(ws ? ws.z : []), ...spec.cabDoor], spec.C, 0.3, spec.nose.N);
  const cabSurface = loft({
    profile,
    stations: cabStations,
    ring,
    uv: uvFor("cab", spec.C),
    classify: glassClassifier(profile, { windows: spec.cabWindows, windscreen: ws }),
  });
  cab.add(bodyKey, cabSurface.get("body"));
  if (cabSurface.get("glass")) cab.add("glass", cabSurface.get("glass"));

  const capPts = profile.pts.map((pt) => ring(0, pt));
  const xs = capPts.map((p) => p[0]);
  const ys = capPts.map((p) => p[1]);
  const capBox = { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
  const frontUv = (x, y) => [COL + ((x - capBox.xmin) / (capBox.xmax - capBox.xmin)) * (1 - COL), ((capBox.ymax - y) / (capBox.ymax - capBox.ymin)) * 0.25];
  cab.add(bodyKey, cap(capPts, 0, 1, frontUv));
  const ringAtFront = (p) => ring(0, p);
  if (spec.capGlass) {
    const g = spec.capGlass;
    const yA = ringAtFront([0, g.yA])[1];
    const yB = Math.min(capBox.ymax - 0.04, ringAtFront([0, g.yB])[1]);
    const x0 = capBox.xmin + g.inset;
    const x1 = capBox.xmax - g.inset;
    const panes = g.panes ?? 1;
    const pillar = 0.035;
    for (let k = 0; k < panes; k++) {
      const a = x0 + ((x1 - x0) * k) / panes + (k ? pillar : 0);
      const b = x0 + ((x1 - x0) * (k + 1)) / panes - (k < panes - 1 ? pillar : 0);
      const poly = clipRect(capPts, a, b, yA, yB);
      if (poly.length >= 3) cab.add("glass", cap(poly, 0.006, 1, () => [0, 0]));
    }
    // Wipers parked on the windscreen.
    for (const side of [-1, 1]) {
      cab.add("trim", new THREE.BoxGeometry(0.42, 0.018, 0.012), { p: [side * 0.26, yA + 0.12, 0.016], r: [0, 0, side * 0.32], color: 0x121315 });
    }
  }
  cab.extras.lamps = addLamps(cab, spec, ringAtFront, capBox);
  // Pilot, coupler and (for Italian locomotive-hauled stock) side buffers.
  const pilotHalf = Math.min(capBox.xmax - 0.06, 0.92);
  cab.box("trim", [-pilotHalf, 0.3, -0.32], [pilotHalf, h.yb + 0.04, 0.02], 0x25272b);
  for (let k = 0; k < 4; k++) cab.box("trim", [-pilotHalf + 0.06, 0.34 + k * 0.08, 0.02], [pilotHalf - 0.06, 0.37 + k * 0.08, 0.05], 0x34373b);
  cab.rod("trim", [0, 0.62, -0.1], [0, 0.62, 0.22], 0.07, 0x2c2e31, 10);
  cab.box("trim", [-0.12, 0.54, 0.2], [0.12, 0.7, 0.3], 0x1f2023);
  if (spec.buffers) {
    const bx = Math.min(0.72, capBox.xmax - 0.18);
    for (const side of [-1, 1]) {
      cab.rod("trim", [side * bx, 0.86, -0.05], [side * bx, 0.86, 0.26], 0.06, 0x2a2b2e, 10);
      cab.add("trim", new THREE.CylinderGeometry(0.115, 0.115, 0.035, 18), { p: [side * bx, 0.86, 0.27], r: [Math.PI / 2, 0, 0], color: 0x5f6266 });
    }
  }
  // Cab-door grab rails and steps.
  const doorMid = (spec.cabDoor[0] + spec.cabDoor[1]) / 2;
  for (const side of [-1, 1]) {
    for (const dz of [spec.cabDoor[0] + 0.05, spec.cabDoor[1] - 0.05]) cab.rod("trim", [side * 1.075, 1.0, dz], [side * 1.075, 1.95, dz], 0.016, 0xd3d6d9, 6);
    cab.box("trim", [side * 1.0 - 0.1, 0.5, doorMid - 0.3], [side * 1.0 + 0.1, 0.54, doorMid + 0.3], 0x2a2b2e);
  }
  // Roof details: horns, pantograph or (littorina) radiator and exhaust.
  for (const side of [-1, 1]) cab.rod("trim", [side * 0.22, roofY - 0.02, -spec.nose.N - 0.25], [side * 0.22, roofY + 0.04, -spec.nose.N - 0.05], 0.035, 0x9ea3a8, 8, 0.05);
  if (spec.pantograph) addPantograph(cab, -(spec.C - 1.05), roofY);
  else {
    cab.box("trim", [-0.55, roofY - 0.04, -spec.C + 0.25], [0.55, roofY + 0.16, -spec.C + 1.35], 0x55524c);
    for (let k = 0; k < 9; k++) cab.box("trim", [-0.5, roofY + 0.16, -spec.C + 0.32 + k * 0.115], [0.5, roofY + 0.19, -spec.C + 0.37 + k * 0.115], 0x23211e);
    cab.rod("trim", [0.3, roofY + 0.1, -spec.C + 1.6], [0.3, roofY + 0.45, -spec.C + 1.6], 0.06, 0x1e1d1b, 10);
  }
  parts.push(cab);

  /* Bays */
  for (const [bayKey, layout] of Object.entries(spec.bays)) {
    const bay = new Part(`${key}:bay${bayKey}`, { kit: "bay", length: BAY, joint: Boolean(layout.seam) });
    const windows = [...(layout.windows ?? [])];
    const bounds = [...windows.flat(), ...(layout.door ?? [])];
    const surface = loft({
      profile,
      stations: stationsFor(bounds, BAY, 0.3),
      uv: uvFor(bayKey, BAY),
      classify: glassClassifier(profile, { windows }),
    });
    bay.add(bodyKey, surface.get("body"));
    if (surface.get("glass")) bay.add("glass", surface.get("glass"));
    if (bayKey === "W") addRoofUnit(bay, -BAY / 2, roofY, key === "express" ? 0x9ea4ab : 0x878d93);
    if (key === "littorina") for (const dz of [-0.55, -1.55]) bay.add("trim", new THREE.CylinderGeometry(0.11, 0.13, 0.12, 12), { p: [0, roofY + 0.04, dz], color: 0x6f6b64 });
    // Underframe equipment kept clear of joint bogies.
    const equip = bayKey === "D" ? [-0.4, -1.7] : bayKey === "W" ? [-0.15, -0.72] : [-1.42, -1.95];
    bay.box("trim", [-0.82, 0.32, equip[1]], [0.82, h.yb + 0.02, equip[0]], 0x2c2f33);
    bay.box("trim", [-0.74, 0.26, equip[1] + 0.08], [-0.2, 0.34, equip[0] - 0.08], 0x3a3e43);
    if (layout.door) {
      for (const side of [-1, 1]) bay.box("trim", [side * 1.0 - 0.08, 0.52, layout.door[1] + 0.1], [side * 1.0 + 0.08, 0.56, layout.door[0] - 0.1], 0x2a2b2e);
    }
    parts.push(bay);
  }

  /* Tail cap */
  const tail = new Part(`${key}:tail`, { kit: "tail" });
  const tailUv = (x, y) => [COL + ((x + 1.05) / 2.1) * (1 - COL), 0.25 + ((h.top - y) / (h.top - h.yb)) * 0.25];
  tail.add(bodyKey, cap(profile.pts, 0, -1, tailUv));
  parts.push(tail);

  return { parts, profile, capBox, ringAtFront };
}

async function passengerAtlas(key, spec, built) {
  const svg = new Svg(ATLAS, ATLAS);
  const p = makePainter(svg, built.profile, spec);
  for (const [bayKey, layout] of Object.entries(spec.bays)) {
    paintSide(svg, p, bayKey, spec, { windows: layout.windows, door: layout.door, doorGlass: layout.door ? layout.windows : null, seam: layout.seam });
  }
  paintSide(svg, p, "cab", spec, { windows: spec.cabWindows, door: spec.cabDoor });
  // Windscreen surround paint on the nose loft.
  if (spec.windscreen) {
    const [z0, z1] = spec.windscreen.z;
    const h = spec.heights;
    if (spec.windscreen.from === "band") p.band("cab", h.y3 - 0.05, h.y4 + 0.05, "#121417", z0 + 0.05, z1 - 0.05);
    else p.span("cab", p.sAt(h.y3) - 0.05, p.S - p.sAt(h.y3) + 0.05, z0 + 0.05, z1 - 0.05, "#121417");
  }
  // Light nose grime and bug splatter near the front edge.
  svg.rect(0, ATLAS * 0.5, ATLAS * COL, 26, "#2b2117", 'opacity="0.18"');
  paintFront(svg, spec, built.capBox, built.ringAtFront);
  paintTail(svg, spec);
  return svgToWebp(svg, { quality: 86 });
}

/* ----------------------------------------------------------------- freight */

const WAGON_LONG = 8.0;
const WAGON_SHORT = 5.6;

function boxcarProfile() {
  const left = [[-1.0, 1.0], [-1.04, 1.06], [-1.04, 1.9], [-1.04, 2.8], [-0.98, 2.9]];
  const roof = [];
  for (let k = 1; k <= 7; k++) {
    const phi = Math.PI - (k / 8) * Math.PI;
    roof.push([Math.cos(phi) * 0.98, 2.9 + 0.17 * Math.sin(phi)]);
  }
  const right = left.slice().reverse().map(([x, y]) => [-x, y]);
  return makeProfile([...left, ...roof, ...right]);
}

function addBuffersAndCoupler(part, z, facing) {
  part.box("trim", [-1.02, 0.76, z - (facing > 0 ? 0.16 : 0)], [1.02, 1.02, z + (facing > 0 ? 0 : 0.16)], 0x2b2724);
  for (const side of [-1, 1]) {
    part.rod("trim", [side * 0.78, 0.9, z], [side * 0.78, 0.9, z + facing * 0.26], 0.065, 0x2a2724, 10);
    part.add("trim", new THREE.CylinderGeometry(0.14, 0.14, 0.035, 18), { p: [side * 0.78, 0.9, z + facing * 0.27], r: [Math.PI / 2, 0, 0], color: 0x56524d });
  }
  part.box("trim", [-0.07, 0.84, z + (facing > 0 ? 0 : -0.2)], [0.07, 0.96, z + (facing > 0 ? 0.2 : 0)], 0x24211e);
  part.add("trim", new THREE.TorusGeometry(0.07, 0.016, 6, 12), { p: [0, 0.82, z + facing * 0.22], r: [0, Math.PI / 2, 0], color: 0x2e2a26 });
}

function buildBoxcar(name, length) {
  const part = new Part(name, { kit: "wagon", length, gear: length > 6.5 ? "bogie:freight" : "axle:freight", gearOffset: length > 6.5 ? 1.55 : 1.45 });
  const profile = boxcarProfile();
  const end = 0.1;
  const bodyLen = length - 2 * end;
  const surface = loft({
    profile,
    stations: stationsFor([], bodyLen, 0.6).map((z) => z - end),
    uv: (sn, z) => [sn * 0.625, ((-z - end) / bodyLen) * 0.5],
  });
  part.add("freightBody", surface.get("body"));
  const endUv = (x, y) => [0.625 + ((x + 1.04) / 2.08) * 0.25, ((3.07 - y) / 2.07) * 0.25];
  const closed = profile.pts;
  part.add("freightBody", cap(closed, -end, 1, endUv));
  part.add("freightBody", cap(closed, -length + end, -1, endUv));
  const plain = [0.875, 0, 1, 0.125];
  // Side ribs and sliding doors.
  const ribs = Math.round(bodyLen / 0.62);
  const doorHalf = 0.95;
  for (let i = 1; i < ribs; i++) {
    const z = -end - (i * bodyLen) / ribs;
    if (Math.abs(z + length / 2) < doorHalf + 0.05) continue;
    for (const side of [-1, 1]) part.box("freightBody", [side * 1.04 - 0.03, 1.06, z - 0.045], [side * 1.04 + 0.03, 2.82, z + 0.045], 0xffffff, plain);
  }
  for (const side of [-1, 1]) {
    part.box("freightBody", [side * 1.07 - 0.025, 1.08, -length / 2 - doorHalf], [side * 1.07 + 0.025, 2.74, -length / 2 + doorHalf], 0xffffff, [0.625, 0.25, 0.875, 0.5]);
    part.box("trim", [side * 1.08 - 0.03, 2.74, -length / 2 - doorHalf * 2.05], [side * 1.08 + 0.03, 2.8, -length / 2 + doorHalf * 1.1], 0x2b2724);
    part.box("trim", [side * 1.08 - 0.03, 1.02, -length / 2 - doorHalf * 2.05], [side * 1.08 + 0.03, 1.08, -length / 2 + doorHalf * 1.1], 0x2b2724);
    part.box("trim", [side * 1.02 - 0.03, 0.82, -length + end], [side * 1.02 + 0.03, 1.02, -end], 0x2b2724);
  }
  // End-wall ribs, ladder and brake wheel on the leading end.
  for (const y of [1.45, 1.95, 2.45]) part.box("freightBody", [-1.0, y - 0.04, -end], [1.0, y + 0.04, -end + 0.05], 0xffffff, plain);
  for (const y of [1.45, 1.95, 2.45]) part.box("freightBody", [-1.0, y - 0.04, -length + end - 0.05], [1.0, y + 0.04, -length + end], 0xffffff, plain);
  for (const side of [-1, 1]) part.rod("trim", [0.62 * side, 1.05, -end + 0.09], [0.62 * side, 2.7, -end + 0.09], 0.016, 0xd6d0c4, 6);
  for (let k = 0; k < 6; k++) part.rod("trim", [-0.62, 1.2 + k * 0.28, -end + 0.09], [-0.36, 1.2 + k * 0.28, -end + 0.09], 0.014, 0xd6d0c4, 6);
  part.rod("trim", [-0.36, 1.05, -end + 0.09], [-0.36, 2.7, -end + 0.09], 0.016, 0xd6d0c4, 6);
  part.add("trim", new THREE.TorusGeometry(0.17, 0.02, 6, 18), { p: [0.55, 2.2, -end + 0.12], color: 0x2a2724 });
  part.rod("trim", [0.55, 2.2, -end + 0.05], [0.55, 2.2, -end + 0.12], 0.02, 0x2a2724, 6);
  addBuffersAndCoupler(part, -end, 1);
  addBuffersAndCoupler(part, -length + end, -1);
  return part;
}

function buildTank(name) {
  const length = WAGON_LONG;
  const part = new Part(name, { kit: "wagon", length, gear: "bogie:freight", gearOffset: 1.55 });
  const radius = 0.9;
  const cy = 1.98;
  const ringPts = [];
  const seg = 28;
  for (let k = 0; k < seg; k++) {
    const a = -Math.PI / 2 + (k / seg) * Math.PI * 2;
    ringPts.push([Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  const profile = makeProfile(ringPts, true);
  const z0 = -0.38;
  const z1 = -length + 0.38;
  const dome = 0.42;
  const stations = [];
  for (let k = 0; k <= 8; k++) stations.push(z0 - dome * (1 - Math.cos((k / 8) * (Math.PI / 2))));
  const mid = stationsFor([], z0 - dome - (z1 + dome), 0.7).map((z) => z + z0 - dome);
  for (const z of mid) stations.push(z);
  for (let k = 8; k >= 0; k--) stations.push(z1 + dome * (1 - Math.cos((k / 8) * (Math.PI / 2))));
  const uniq = [...new Set(stations.map((v) => Math.round(v * 1e5) / 1e5))].sort((a, b) => b - a);
  const surface = loft({
    profile,
    stations: uniq,
    ring: (z, [x, y]) => {
      const fromFront = z0 - z;
      const fromBack = z - z1;
      const d = Math.min(fromFront, fromBack);
      const t = d >= dome ? 1 : Math.max(0.06, Math.sqrt(1 - Math.pow(1 - d / dome, 2)));
      return [x * t, cy + (y - cy) * t];
    },
    uv: (sn, z) => [sn * 0.625, 0.5 + ((z0 - z) / (z0 - z1)) * 0.5],
  });
  part.add("freightBody", surface.get("body"));
  const tip = ringPts.map(([x, y]) => [x * 0.06, cy + (y - cy) * 0.06]);
  part.add("freightBody", cap(tip, z0, 1, () => [0.3, 0.75]));
  part.add("freightBody", cap(tip, z1, -1, () => [0.3, 0.75]));
  // Underframe deck, cradles, bands, dome and walkway.
  part.box("trim", [-1.04, 0.8, -length + 0.1], [1.04, 1.0, -0.1], 0x2a2725);
  for (const z of [-1.5, -length + 1.5, -length / 2]) part.box("trim", [-0.7, 1.0, z - 0.12], [0.7, 1.28, z + 0.12], 0x2a2725);
  for (const z of [-1.0, -2.6, -length + 2.6, -length + 1.0]) part.add("trim", new THREE.TorusGeometry(radius + 0.006, 0.022, 6, 32), { p: [0, cy, z], color: 0x3a3936 });
  part.add("trim", new THREE.CylinderGeometry(0.3, 0.32, 0.2, 20), { p: [0, cy + radius + 0.06, -length / 2], color: 0xb9bcbf });
  part.add("trim", new THREE.CylinderGeometry(0.33, 0.33, 0.04, 20), { p: [0, cy + radius + 0.17, -length / 2], color: 0x8d9094 });
  part.box("trim", [-0.62, cy + radius - 0.02, -length / 2 - 0.7], [0.62, cy + radius + 0.01, -length / 2 + 0.7], 0x4a4744);
  for (const side of [-1, 1]) {
    for (const dz of [-0.7, 0, 0.7]) part.rod("trim", [side * 0.6, cy + radius, -length / 2 + dz], [side * 0.6, cy + radius + 0.42, -length / 2 + dz], 0.015, 0xe0c24a, 6);
    part.rod("trim", [side * 0.6, cy + radius + 0.42, -length / 2 - 0.7], [side * 0.6, cy + radius + 0.42, -length / 2 + 0.7], 0.015, 0xe0c24a, 6);
    // Side ladders up to the walkway.
    for (const dz of [-0.2, 0.2]) part.rod("trim", [side * 1.0, 1.0, -length / 2 + dz], [side * 0.62, cy + radius, -length / 2 + dz], 0.016, 0xe0c24a, 6);
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const x = side * (1.0 - 0.38 * t);
      const y = 1.0 + (cy + radius - 1.0) * t;
      part.rod("trim", [x, y, -length / 2 - 0.2], [x, y, -length / 2 + 0.2], 0.013, 0xe0c24a, 6);
    }
    part.box("trim", [side * 1.02 - 0.03, 0.82, -length + 0.12], [side * 1.02 + 0.03, 1.02, -0.12], 0x2b2724);
  }
  addBuffersAndCoupler(part, -0.1, 1);
  addBuffersAndCoupler(part, -length + 0.1, -1);
  return part;
}

async function freightAtlas() {
  const svg = new Svg(ATLAS, ATLAS);
  const r = rng(808);
  // Boxcar sides (0..640 x 0..512): oxide red with rust streaks and stencil blocks.
  svg.rect(0, 0, 640, 512, "#7b3426");
  svg.noise(0, 0, 640, 512, { freq: "0.02 0.04", seed: 61, color: "#3d1a12", opacity: 0.5 });
  for (let i = 0; i < 70; i++) {
    const x = r.range(0, 640);
    const y = r.range(0, 512);
    svg.rect(x, y, r.range(30, 120), r.range(1.5, 4), r.chance(0.5) ? "#5a2617" : "#9a5a32", 'opacity="0.45"');
  }
  // Lower grime gradient (image x maps to profile arc).
  svg.rect(0, 0, 640, 512, svg.linearGradient([[0, "#1d140e", 0.6], [0.16, "#1d140e", 0.1], [0.5, "#3a2a20", 0.15], [0.84, "#1d140e", 0.1], [1, "#1d140e", 0.6]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
  for (const [x, flip] of [[110, false], [530, true]]) {
    svg.rect(x - 34, 40, 68, 70, "#e9e2d0", 'opacity="0.85"');
    svg.rect(x - 28, 48, 56, 6, "#7b3426");
    svg.rect(x - 28, 62, 40, 4, "#7b3426");
    svg.rect(x - 28, 74, 50, 4, "#7b3426");
    svg.rect(x - 34, 420, 68, 50, "#e9e2d0", 'opacity="0.8"');
    svg.rect(x - 24, 430, 20, 30, "#d8b23a");
    void flip;
  }
  // Boxcar end wall (640..896 x 0..256).
  svg.rect(640, 0, 256, 256, "#74311f");
  svg.noise(640, 0, 256, 256, { freq: "0.03", seed: 62, color: "#3a170e", opacity: 0.55 });
  svg.rect(640, 200, 256, 56, "#1d140e", 'opacity="0.35"');
  // Plain oxide swatch (896..1024 x 0..128).
  svg.rect(896, 0, 128, 128, "#7e3627");
  svg.noise(896, 0, 128, 128, { freq: "0.05", seed: 63, color: "#3a170e", opacity: 0.45 });
  // Sliding door (640..896 x 256..512): vertical planks/ribs.
  svg.rect(640, 256, 256, 256, "#80392a");
  for (let k = 0; k < 9; k++) svg.rect(640 + 10 + k * 28, 256, 6, 256, "#5a2618", 'opacity="0.7"');
  svg.rect(640, 256, 256, 12, "#3a1a10");
  svg.rect(640, 500, 256, 12, "#3a1a10");
  svg.rect(752, 360, 30, 46, "#2a1810");
  svg.noise(640, 256, 256, 256, { freq: "0.03", seed: 64, color: "#2a120a", opacity: 0.45 });
  // Tank (0..640 x 512..1024): image x maps the circumference starting underneath.
  svg.rect(0, 512, 640, 512, "#c4c7c9");
  svg.noise(0, 512, 640, 512, { freq: "0.01 0.03", seed: 65, color: "#6e6a64", opacity: 0.4 });
  for (const centre of [160, 480]) svg.rect(centre - 18, 512, 36, 512, "#d8772b");
  svg.rect(0, 512, 640, 512, svg.linearGradient([[0, "#2a241e", 0.7], [0.18, "#2a241e", 0.12], [0.5, "#3a3530", 0.05], [0.82, "#2a241e", 0.12], [1, "#2a241e", 0.7]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
  for (let i = 0; i < 40; i++) svg.rect(r.range(250, 390), r.range(512, 1024), r.range(40, 140), r.range(1.5, 3), "#5d554b", 'opacity="0.35"');
  for (const x of [160, 480]) {
    svg.rect(x - 60, 700, 46, 60, "#f2efe8");
    svg.rect(x + 14, 700, 46, 60, "#f2efe8");
    svg.rect(x - 52, 710, 30, 6, "#3a3a3a");
    svg.rect(x + 22, 710, 30, 6, "#3a3a3a");
  }
  return svgToWebp(svg, { quality: 86 });
}

/* ------------------------------------------------------------------- build */

export async function buildTrains() {
  const materials = {
    glass: { color: 0x1e2a33, roughness: 0.06, metalness: 0.15, envIntensity: 1.6, kit: "glass" },
    trim: { color: 0xffffff, roughness: 0.5, metalness: 0.5, vertexColors: true, envIntensity: 0.6, kit: "trim" },
    lamp: { color: 0xfff3d6, emissive: 0xfff0c8, roughness: 0.2, metalness: 0, envIntensity: 0.5, kit: "lamp" },
  };
  const parts = [];
  for (const [key, spec] of Object.entries(TYPES)) {
    const built = buildPassenger(key, spec, materials);
    const atlas = await passengerAtlas(key, spec, built);
    materials[`${key}Body`] = { map: atlas, roughness: spec.body.roughness, metalness: spec.body.metalness, envIntensity: 0.55, kit: "body" };
    parts.push(...built.parts);
  }
  materials.freightBody = { map: await freightAtlas(), roughness: 0.72, metalness: 0.2, envIntensity: 0.6, kit: "body" };
  parts.push(buildBoxcar("freight:boxcar", WAGON_LONG), buildBoxcar("freight:boxcarShort", WAGON_SHORT), buildTank("freight:tank"));
  parts.push(passengerBogie(), freightBogie(), freightAxle());
  const extras = {
    passenger: Object.fromEntries(Object.entries(TYPES).map(([k, s]) => [k, { label: s.label, cab: s.C, pattern: s.pattern, bay: BAY }])),
  };
  return { materials, parts, extras };
}
