/** Three-lane 6 m track segments (clean concrete and worn jointed variants). */
import { Part, Svg, THREE, loft, makeProfile, rng, shade, svgToWebp } from "./lib.mjs";

export const SEGMENT_LENGTH = 6;
const LANE = 2.4;
const LANES = [-1, 0, 1];
const GAUGE_HALF = 0.55;
const SLEEPER_SPACING = 0.6;
const BED_HALF = 4.0;
const TEX_W = 1024;
const TEX_H = 768;

const px = (x) => ((x + BED_HALF) / (BED_HALF * 2)) * TEX_W;
const py = (z) => (-z / SEGMENT_LENGTH) * TEX_H;

async function ballastTexture() {
  const r = rng(77);
  const svg = new Svg(TEX_W, TEX_H);
  svg.rect(0, 0, TEX_W, TEX_H, "#55514b");
  svg.noise(0, 0, TEX_W, TEX_H, { freq: "0.012", seed: 4, color: "#2a2520", opacity: 0.55 });
  const stones = [];
  for (let i = 0; i < 9800; i++) {
    const x = r.range(0, TEX_W);
    const y = r.range(0, TEX_H);
    const rad = r.range(4.2, 9.5);
    const tone = r.range(0, 1);
    const grey = r.int(96, 150);
    const warm = r.int(-6, 10);
    const base = tone < 0.12 ? [r.int(150, 172), r.int(132, 150), r.int(110, 126)] : [grey + warm, grey + Math.round(warm / 2), grey - 4];
    const verts = [];
    const n = r.int(5, 7);
    const rot = r.range(0, Math.PI * 2);
    const squash = r.range(0.65, 1);
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + r.range(-0.25, 0.25);
      const rr = rad * r.range(0.72, 1.08);
      verts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
    }
    stones.push({ x, y, verts, base });
  }
  const draw = (dx, dy) => {
    for (const s of stones) {
      const ox = s.x + dx;
      const oy = s.y + dy;
      if (oy < -12 || oy > TEX_H + 12) continue;
      const pts = s.verts.map(([vx, vy]) => [ox + vx, oy + vy]);
      const [rr, gg, bb] = s.base;
      svg.poly(pts.map(([x, y]) => [x + 1.6, y + 1.8]), "#15120f", 'opacity="0.55"');
      svg.poly(pts, `rgb(${rr},${gg},${bb})`);
      svg.poly(
        s.verts.map(([vx, vy]) => [ox + vx * 0.55 - 1.2, oy + vy * 0.55 - 1.4]),
        `rgb(${Math.min(255, rr + 34)},${Math.min(255, gg + 32)},${Math.min(255, bb + 28)})`,
        'opacity="0.55"',
      );
    }
  };
  // Duplicate stones across the v edges so the 6 m segment tiles seamlessly.
  draw(0, 0);
  draw(0, TEX_H);
  draw(0, -TEX_H);
  // Rust and brake dust gathered between and beside each pair of rails.
  for (const lane of LANES) {
    const cx = lane * LANE;
    const grime = svg.linearGradient(
      [
        [0, "#3b2416", 0],
        [0.18, "#4a2c1a", 0.45],
        [0.5, "#2e2119", 0.32],
        [0.82, "#4a2c1a", 0.45],
        [1, "#3b2416", 0],
      ],
      { x1: 0, y1: 0, x2: 1, y2: 0 },
    );
    svg.rect(px(cx - 0.85), 0, px(cx + 0.85) - px(cx - 0.85), TEX_H, grime);
    for (const side of [-1, 1]) {
      const rx = cx + side * GAUGE_HALF;
      svg.rect(px(rx - 0.11), 0, px(rx + 0.11) - px(rx - 0.11), TEX_H, "#1b130d", 'opacity="0.42"');
    }
  }
  // Soft contact shadows around every sleeper.
  const blur = svg.id("blur");
  svg.def(`<filter id="${blur}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>`);
  for (const lane of LANES) {
    for (let i = 0; i < SEGMENT_LENGTH / SLEEPER_SPACING; i++) {
      const z = -SLEEPER_SPACING / 2 - i * SLEEPER_SPACING;
      svg.rect(px(lane * LANE - 1.02), py(z) - 20, px(lane * LANE + 1.02) - px(lane * LANE - 1.02), 40, "#0d0a08", `opacity="0.55" filter="url(#${blur})"`);
    }
  }
  svg.noise(0, 0, TEX_W, TEX_H, { freq: "0.05", seed: 9, color: "#000", opacity: 0.25 });
  return svgToWebp(svg, { quality: 82 });
}

async function sleeperTexture() {
  const svg = new Svg(512, 256);
  // Concrete monoblock (top half).
  svg.rect(0, 0, 512, 128, "#a3a099");
  svg.noise(0, 0, 512, 128, { freq: "0.09", seed: 21, color: "#4a4741", opacity: 0.55 });
  svg.noise(0, 0, 512, 128, { freq: "0.02", seed: 22, color: "#5a3a26", opacity: 0.3 });
  const r = rng(5);
  for (let i = 0; i < 380; i++) svg.rect(r.range(0, 512), r.range(0, 128), r.range(1, 3), r.range(1, 3), r.chance(0.5) ? "#cfcbc2" : "#6c6860", 'opacity="0.7"');
  svg.rect(0, 0, 512, 6, "#6f6b64", 'opacity="0.6"');
  svg.rect(0, 122, 512, 6, "#6f6b64", 'opacity="0.6"');
  // Creosoted timber (bottom half).
  svg.rect(0, 128, 512, 128, "#3e2a1d");
  for (let i = 0; i < 26; i++) {
    const y = 130 + i * 4.8 + r.range(-1, 1);
    svg.rect(0, y, 512, r.range(0.8, 2.2), i % 3 ? "#2b1c13" : "#57402e", 'opacity="0.75"');
  }
  svg.noise(0, 128, 512, 128, { freq: "0.004 0.12", seed: 23, color: "#1a0f09", opacity: 0.7 });
  return svgToWebp(svg, { quality: 84 });
}

async function travertineTexture() {
  const svg = new Svg(512, 256);
  svg.rect(0, 0, 512, 256, "#d8c8a6");
  const bands = svg.linearGradient([
    [0, "#cdb994"],
    [0.3, "#e3d6ba"],
    [0.55, "#cbb58f"],
    [0.8, "#e0d1b1"],
    [1, "#cfbc97"],
  ]);
  svg.rect(0, 0, 512, 256, bands, 'opacity="0.7"');
  svg.noise(0, 0, 512, 256, { freq: "0.006 0.06", seed: 31, color: "#8c7652", opacity: 0.6 });
  const r = rng(31);
  for (let i = 0; i < 420; i++) {
    const w = r.range(2, 9);
    svg.rect(r.range(0, 512), r.range(0, 256), w, r.range(0.8, 2), "#7d6a4d", 'opacity="0.55" rx="1"');
  }
  svg.noise(0, 0, 512, 256, { freq: "0.05", seed: 32, color: "#5a4a35", opacity: 0.3 });
  return svgToWebp(svg, { quality: 84 });
}

function railGeometry() {
  const s = new THREE.Shape();
  const pts = [
    [-0.06, 0.012], [0.06, 0.012], [0.06, 0.026], [0.014, 0.036], [0.011, 0.042], [0.011, 0.098],
    [0.033, 0.106], [0.034, 0.13], [0.026, 0.142], [-0.026, 0.142], [-0.034, 0.13], [-0.033, 0.106],
    [-0.011, 0.098], [-0.011, 0.042], [-0.014, 0.036], [-0.06, 0.026],
  ];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  const g = new THREE.ExtrudeGeometry(s, { depth: SEGMENT_LENGTH, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -SEGMENT_LENGTH);
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const pos = ng.attributes.position;
  const nor = ng.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const polished = new THREE.Color(0xd8dbdd).convertSRGBToLinear();
  const worn = new THREE.Color(0x8b7d72).convertSRGBToLinear();
  const rust = new THREE.Color(0x6a4632).convertSRGBToLinear();
  for (let i = 0; i < pos.count; i += 3) {
    let y = 0;
    let ny = 0;
    let nx = 0;
    for (let k = 0; k < 3; k++) {
      y += pos.getY(i + k) / 3;
      ny += nor.getY(i + k) / 3;
      nx += Math.abs(nor.getX(i + k)) / 3;
    }
    const c = y > 0.135 && ny > 0.5 ? polished : y > 0.103 && nx > 0.5 ? worn : rust;
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  ng.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return ng;
}

function sleeperGeometry(length, height, depth, taper = 0.82) {
  const g = new THREE.BoxGeometry(length, height, depth, 1, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setZ(i, pos.getZ(i) * taper);
  g.translate(0, -height / 2, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * @param lite distant-LOD segment: same silhouette (bed, sleepers, rails, curbs)
 *   without fastenings, joints or weeds, for slots beyond ~54 m.
 */
function buildSegment(name, worn, lite = false) {
  const r = rng(worn ? 902 : 301);
  const part = new Part(name, { length: SEGMENT_LENGTH, kit: "track" });

  // Ballast bed with shoulders tucked under the travertine curbs.
  const bed = makeProfile([
    [-BED_HALF, -0.12], [-3.72, -0.045], [-1.25, -0.03], [1.25, -0.03], [3.72, -0.045], [BED_HALF, -0.12],
  ]);
  const bedMesh = loft({
    profile: bed,
    stations: [0, -SEGMENT_LENGTH],
    uv: (s, z) => [s, -z / SEGMENT_LENGTH],
  });
  part.add("ballast", bedMesh.get("body"));

  const sleeperGeo = sleeperGeometry(1.9, 0.17, 0.25);
  const timberGeo = sleeperGeometry(2.02, 0.15, 0.23, 0.96);
  const railGeo = railGeometry();
  const count = SEGMENT_LENGTH / SLEEPER_SPACING;
  for (const lane of LANES) {
    const cx = lane * LANE;
    for (let i = 0; i < count; i++) {
      const z = -SLEEPER_SPACING / 2 - i * SLEEPER_SPACING;
      const timber = worn && ((lane === -1 && i === 4) || (lane === 1 && i === 7));
      const tint = timber ? shade(0xffffff, r.range(0.8, 0.95)) : shade(r.chance(0.12) ? 0xf0e4d4 : 0xffffff, r.range(0.86, 1.04));
      const skew = r.range(-0.02, 0.02);
      part.add("sleeper", timber ? timberGeo : sleeperGeo, {
        p: [cx + r.range(-0.02, 0.02), timber ? -0.012 : 0, z + r.range(-0.012, 0.012)],
        r: [0, skew, 0],
        color: tint,
        uvRect: timber ? [0, 0.5, 1, 1] : [0, 0, 1, 0.5],
      });
      if (lite) continue;
      for (const side of [-1, 1]) {
        const rx = cx + side * GAUGE_HALF;
        part.box("rail", [rx - 0.095, 0, z - 0.085], [rx + 0.095, 0.013, z + 0.085], 0x3b3531);
        // Spring clips gripping the rail foot.
        for (const k of [-1, 1]) {
          const clipX = rx + k * 0.072;
          part.box("rail", [clipX - 0.02, 0.012, z - 0.04], [clipX + 0.02, 0.04, z + 0.04], 0x34362f);
        }
      }
    }
    for (const side of [-1, 1]) {
      part.add("rail", railGeo, { p: [cx + side * GAUGE_HALF, 0, 0] });
      if (worn && !lite) {
        // Bolted fishplate joint at mid-segment.
        const rx = cx + side * GAUGE_HALF;
        for (const k of [-1, 1]) {
          part.box("rail", [rx + k * 0.012 - 0.007, 0.05, -3.32], [rx + k * 0.012 + 0.007, 0.1, -2.68], 0x4b3527);
          for (const bz of [-3.22, -3.08, -2.92, -2.78]) {
            part.rod("rail", [rx + k * 0.03, 0.075, bz], [rx + k * 0.012, 0.075, bz], 0.011, 0x2d2b28, 6);
          }
        }
      }
    }
  }

  // Travertine curbs hide the bed/ground seam at the corridor edge.
  for (const side of [-1, 1]) {
    const blocks = lite ? 2 : 4;
    const blockLength = SEGMENT_LENGTH / blocks;
    for (let i = 0; i < blocks; i++) {
      const z0 = -i * blockLength - 0.006;
      const z1 = z0 - blockLength + 0.012;
      const cx = side * BED_HALF;
      part.box("curb", [cx - 0.17, -0.26, z1], [cx + 0.17, 0.035, z0], shade(0xffffff, r.range(0.86, 1.02)));
    }
  }

  if (worn && !lite) {
    // Hardy weeds pushing through the ballast shoulders and lane gaps.
    const spots = [
      [-3.45, -0.8], [-3.5, -4.4], [-1.2, -2.2], [1.22, -5.1], [3.48, -1.6], [3.4, -3.9], [-1.18, -5.4], [1.2, -0.7],
    ];
    for (const [x, z] of spots) {
      const blades = r.int(6, 9);
      for (let b = 0; b < blades; b++) {
        const h = r.range(0.12, 0.28);
        const blade = new THREE.ConeGeometry(r.range(0.018, 0.03), h, 4, 1);
        blade.translate(0, h / 2, 0);
        part.add("foliage", blade, {
          p: [x + r.range(-0.12, 0.12), -0.035, z + r.range(-0.12, 0.12)],
          r: [r.range(-0.5, 0.5), r.range(0, Math.PI), r.range(-0.5, 0.5)],
          color: r.pick([0x5f7a33, 0x6f8a3a, 0x4d6a2b, 0x8a8f3c]),
        });
      }
    }
  }
  return part;
}

export async function buildTrack() {
  const [ballast, sleeper, curb] = await Promise.all([ballastTexture(), sleeperTexture(), travertineTexture()]);
  const materials = {
    ballast: { map: ballast, roughness: 0.96, metalness: 0, envIntensity: 0.25 },
    sleeper: { map: sleeper, roughness: 0.88, metalness: 0, vertexColors: true, envIntensity: 0.3 },
    rail: { color: 0xffffff, roughness: 0.38, metalness: 0.78, vertexColors: true, envIntensity: 1.1 },
    curb: { map: curb, roughness: 0.82, metalness: 0, vertexColors: true, envIntensity: 0.35 },
    foliage: { color: 0xffffff, roughness: 0.85, metalness: 0, vertexColors: true, envIntensity: 0.2 },
  };
  // Order matters: the runtime indexes variants as clean = 0, worn = 1, far = 2.
  const parts = [buildSegment("track:clean", false), buildSegment("track:worn", true), buildSegment("track:far", false, true)];
  return { materials, parts, textures: { ballast, sleeper, curb } };
}

// Exported for reuse by obstacle textures.
export { travertineTexture };
