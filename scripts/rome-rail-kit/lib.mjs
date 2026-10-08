/**
 * Shared helpers for the Rome Rail Kit generator: deterministic randomness,
 * vertex-coloured geometry assembly, procedural lofts, SVG/height-map textures
 * and a compact glTF writer (WebP textures + meshopt compression).
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

export { THREE };

/* ------------------------------------------------------------------ random */

export function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/* ------------------------------------------------------------------ colour */

const tmpColor = new THREE.Color();
/** sRGB hex -> linear RGB triple (glTF factors and COLOR_0 are linear). */
export function linear(hex) {
  tmpColor.setHex(hex, THREE.SRGBColorSpace);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

export function shade(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c.getHex();
}

export function mix(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/* ---------------------------------------------------------------- geometry */

/** Normalise a geometry to non-indexed position/normal/uv/color attributes. */
export function prepare(geometry, { color = 0xffffff, uvRect = null, matrix = null, flip = false } = {}) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const count = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  if (uvRect) {
    const uv = g.attributes.uv;
    const [u0, v0, u1, v1] = uvRect;
    for (let i = 0; i < count; i++) {
      uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
    }
  }
  if (!g.attributes.color) {
    const [r, gg, b] = linear(color);
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) data.set([r, gg, b], i * 3);
    g.setAttribute("color", new THREE.Float32BufferAttribute(data, 3));
  }
  if (matrix) {
    g.applyMatrix4(matrix);
    // Mirrored transforms flip winding; restore outward-facing triangles.
    if (matrix.determinant() < 0) flipWinding(g);
  }
  if (flip) {
    flipWinding(g);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return g;
}

export function flipWinding(g) {
  for (const name of Object.keys(g.attributes)) {
    const attr = g.attributes[name];
    const size = attr.itemSize;
    const arr = attr.array;
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < size; k++) {
        const a = (i + 1) * size + k;
        const b = (i + 2) * size + k;
        const t = arr[a];
        arr[a] = arr[b];
        arr[b] = t;
      }
    }
    attr.needsUpdate = true;
  }
  return g;
}

export function trs(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
  m.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  return m;
}

/** A named model part: material key -> list of prepared geometries. */
export class Part {
  constructor(name, extras = {}) {
    this.name = name;
    this.extras = extras;
    this.buckets = new Map();
  }

  add(material, geometry, opts = {}) {
    const matrix = opts.matrix ?? (opts.p || opts.r || opts.s ? trs(opts.p, opts.r, opts.s) : null);
    const g = prepare(geometry, { color: opts.color, uvRect: opts.uvRect, matrix, flip: opts.flip });
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    return this;
  }

  /** Box with min/max extents (fast path for hard-surface detailing). */
  box(material, min, max, color, uvRect) {
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    return this.add(material, g, { color, uvRect });
  }

  /** Cylinder between two points. */
  rod(material, a, b, radius, color, segments = 10, radiusB = radius) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const length = dir.length();
    const g = new THREE.CylinderGeometry(radiusB, radius, length, segments, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(material, g, { matrix: m, color });
  }

  merged() {
    const out = new Map();
    for (const [material, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      // Weld coincident vertices with identical attributes to shrink the GLB.
      out.set(material, mergeVertices(merged, 1e-5));
    }
    return out;
  }

  triangleCount() {
    let total = 0;
    for (const list of this.buckets.values()) for (const g of list) total += g.attributes.position.count / 3;
    return total;
  }
}

/* -------------------------------------------------------------------- loft */

/**
 * Builds an open (or closed) profile polyline with cumulative arc length.
 * `points` are [x, y]; `closed` repeats the first point at the end.
 */
export function makeProfile(points, closed = false) {
  const pts = points.map((p) => [...p]);
  if (closed) pts.push([...pts[0]]);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, S: s[s.length - 1], closed };
}

/**
 * Sweeps a profile along -Z through `stations` (z values). `ring(z, [x,y], i)`
 * may reshape each ring (noses, domes). `uv(sNorm, z)` maps texture coords.
 * `classify(sMid, zMid)` routes each quad to a material bucket key.
 * Normals are averaged across the whole surface so split materials stay seamless.
 */
export function loft({ profile, stations, ring = (z, p) => p, uv, classify = () => "body" }) {
  const P = profile.pts.length;
  const R = stations.length;
  const pos = [];
  for (let r = 0; r < R; r++) {
    for (let i = 0; i < P; i++) {
      const [x, y] = ring(stations[r], profile.pts[i], i, profile);
      pos.push(new THREE.Vector3(x, y, stations[r]));
    }
  }
  // Orientation check: first quad normal should point away from the ring centre.
  const centre = new THREE.Vector3();
  for (let i = 0; i < P; i++) centre.add(pos[i]);
  centre.divideScalar(P);
  const quadNormal = (a, b, c) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  let flip = false;
  {
    const mid = Math.floor((P - 1) / 2);
    const a = pos[mid];
    const b = pos[P + mid];
    const c = pos[mid + 1];
    const n = quadNormal(a, b, c);
    const out = new THREE.Vector3().subVectors(a, new THREE.Vector3(centre.x, centre.y, a.z));
    flip = n.dot(out) < 0;
  }
  // Smooth vertex normals over the full grid.
  const normals = pos.map(() => new THREE.Vector3());
  const tri = (ia, ib, ic) => {
    const n = quadNormal(pos[ia], pos[ib], pos[ic]);
    if (flip) n.negate();
    normals[ia].add(n);
    normals[ib].add(n);
    normals[ic].add(n);
  };
  for (let r = 0; r < R - 1; r++) {
    for (let i = 0; i < P - 1; i++) {
      const a = r * P + i;
      const b = (r + 1) * P + i;
      const c = a + 1;
      const d = b + 1;
      tri(a, b, c);
      tri(c, b, d);
    }
  }
  if (profile.closed) {
    for (let r = 0; r < R; r++) {
      const n = normals[r * P].clone().add(normals[r * P + P - 1]);
      normals[r * P].copy(n);
      normals[r * P + P - 1].copy(n);
    }
  }
  for (const n of normals) n.lengthSq() > 0 ? n.normalize() : n.set(0, 1, 0);

  const buckets = new Map();
  const push = (key, ids, uvs) => {
    if (!buckets.has(key)) buckets.set(key, { p: [], n: [], t: [] });
    const b = buckets.get(key);
    const order = flip ? [0, 2, 1, 2, 3, 1] : [0, 1, 2, 2, 1, 3];
    for (const k of order) {
      const v = pos[ids[k]];
      const n = normals[ids[k]];
      b.p.push(v.x, v.y, v.z);
      b.n.push(n.x, n.y, n.z);
      b.t.push(uvs[k][0], uvs[k][1]);
    }
  };
  for (let r = 0; r < R - 1; r++) {
    for (let i = 0; i < P - 1; i++) {
      const a = r * P + i;
      const b = (r + 1) * P + i;
      const c = a + 1;
      const d = b + 1;
      const sMid = (profile.s[i] + profile.s[i + 1]) / 2;
      const zMid = (stations[r] + stations[r + 1]) / 2;
      const key = classify(sMid, zMid, i);
      if (!key) continue;
      const uvA = uv(profile.s[i] / profile.S, stations[r], key);
      const uvB = uv(profile.s[i] / profile.S, stations[r + 1], key);
      const uvC = uv(profile.s[i + 1] / profile.S, stations[r], key);
      const uvD = uv(profile.s[i + 1] / profile.S, stations[r + 1], key);
      push(key, [a, b, c, d], [uvA, uvB, uvC, uvD]);
    }
  }
  const out = new Map();
  for (const [key, b] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.t, 2));
    out.set(key, g);
  }
  return out;
}

/** Planar cap from a ring of [x,y] points at `z`. `facing` = +1 (+Z) or -1. */
export function cap(points, z, facing, uvOf) {
  const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
  if (contour.length > 2 && contour[0].distanceTo(contour[contour.length - 1]) < 1e-6) contour.pop();
  let tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const p = [];
  const n = [];
  const t = [];
  for (const [a, b, c] of tris) {
    let ids = [a, b, c];
    const A = contour[a];
    const B = contour[b];
    const C = contour[c];
    const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if ((cross > 0) !== facing > 0) ids = [a, c, b];
    for (const id of ids) {
      const v = contour[id];
      p.push(v.x, v.y, z);
      n.push(0, 0, facing);
      const [u, w] = uvOf(v.x, v.y);
      t.push(u, w);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2));
  return g;
}

/** Sutherland–Hodgman clip of a polygon to an axis-aligned rectangle. */
export function clipRect(points, xmin, xmax, ymin, ymax) {
  const clip = (pts, inside, intersect) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (pi) out.push(intersect(prev, cur));
    }
    return out;
  };
  const lerpX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const lerpY = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  let pts = points.map((p) => [...p]);
  pts = clip(pts, (p) => p[0] >= xmin, (a, b) => lerpX(a, b, xmin));
  pts = clip(pts, (p) => p[0] <= xmax, (a, b) => lerpX(a, b, xmax));
  pts = clip(pts, (p) => p[1] >= ymin, (a, b) => lerpY(a, b, ymin));
  pts = clip(pts, (p) => p[1] <= ymax, (a, b) => lerpY(a, b, ymax));
  return pts;
}

/** Rounded-rectangle outline points (for panels, plaques, shields). */
export function roundedRect(w, h, r, segments = 4) {
  const pts = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= segments; k++) {
      const a = a0 + (k / segments) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/* ---------------------------------------------------------------- textures */

export class Svg {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.defs = [];
    this.body = [];
    this.ids = 0;
  }

  id(prefix = "d") {
    return `${prefix}${this.ids++}`;
  }

  def(markup) {
    this.defs.push(markup);
    return this;
  }

  add(markup) {
    this.body.push(markup);
    return this;
  }

  rect(x, y, w, h, fill, extra = "") {
    return this.add(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0, w).toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" fill="${fill}" ${extra}/>`);
  }

  poly(points, fill, extra = "") {
    return this.add(`<polygon points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="${fill}" ${extra}/>`);
  }

  /** Fractal noise used as grime/wear: dark speckle with given opacity. */
  noiseFilter({ freq = "0.03", octaves = 4, seed = 1, color = "#000", opacity = 0.35, contrast = 2.2 } = {}) {
    const id = this.id("noise");
    const c = new THREE.Color(color);
    this.def(`<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch" result="t"/>
<feColorMatrix in="t" type="matrix" values="0 0 0 0 ${c.r.toFixed(3)} 0 0 0 0 ${c.g.toFixed(3)} 0 0 0 0 ${c.b.toFixed(3)} ${contrast} 0 0 0 ${(-contrast * 0.5 + 0.1).toFixed(2)}" result="a"/>
<feComponentTransfer in="a"><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer>
</filter>`);
    return id;
  }

  noise(x, y, w, h, opts) {
    const id = this.noiseFilter(opts);
    return this.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" filter="url(#${id})"/>`);
  }

  linearGradient(stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
    const id = this.id("lg");
    this.def(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
      .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
      .join("")}</linearGradient>`);
    return `url(#${id})`;
  }

  radialGradient(stops) {
    const id = this.id("rg");
    this.def(`<radialGradient id="${id}">${stops
      .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
      .join("")}</radialGradient>`);
    return `url(#${id})`;
  }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><defs>${this.defs.join("")}</defs>${this.body.join("")}</svg>`;
  }
}

export async function svgToWebp(svg, { quality = 84, lossless = false, file = null } = {}) {
  const raster = sharp(Buffer.from(svg.toString()), { density: 72 });
  const buf = await raster.webp({ quality, lossless, effort: 5 }).toBuffer();
  if (file) await sharp(Buffer.from(svg.toString())).png().toFile(file);
  return buf;
}

/** Height (SVG greyscale) -> tangent-space normal map WebP. */
export async function svgToNormalMap(svg, { strength = 2.5, quality = 92 } = {}) {
  const { data, info } = await sharp(Buffer.from(svg.toString())).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => data[(((y + height) % height) * width + ((x + width) % width)) * channels] / 255;
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // glTF normal maps are +Y up in texture space (v grows downward in image).
      const n = new THREE.Vector3(-dx, dy, 1).normalize();
      const i = (y * width + x) * 3;
      out[i] = Math.round((n.x * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).webp({ quality, effort: 5 }).toBuffer();
}

export async function savePreview(webp, file) {
  await sharp(webp).png().toFile(file);
}

/* ------------------------------------------------------------------- glTF */

/**
 * materials: key -> { name, color, roughness, metalness, emissive, map, normalMap,
 *   alpha: "OPAQUE" | "BLEND" | "MASK", doubleSided, vertexColors }
 * parts: Part[] (each becomes a named node with one mesh)
 */
export async function writeGlb(file, { materials, parts, extras = {} }) {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = doc.createBuffer();
  const scene = doc.createScene("kit");
  scene.setExtras(extras);
  const gltfMaterials = new Map();
  const textureCache = new Map();
  const texture = (key, image) => {
    if (!image) return null;
    if (textureCache.has(image)) return textureCache.get(image);
    const tex = doc.createTexture(key).setImage(image).setMimeType("image/webp");
    textureCache.set(image, tex);
    return tex;
  };
  const getMaterial = (key) => {
    if (gltfMaterials.has(key)) return gltfMaterials.get(key);
    const spec = materials[key];
    if (!spec) throw new Error(`Unknown material ${key}`);
    const color = spec.color ?? 0xffffff;
    const [r, g, b] = linear(color);
    const m = doc
      .createMaterial(spec.name ?? key)
      .setBaseColorFactor([r, g, b, spec.opacity ?? 1])
      .setRoughnessFactor(spec.roughness ?? 0.6)
      .setMetallicFactor(spec.metalness ?? 0)
      .setDoubleSided(Boolean(spec.doubleSided))
      .setAlphaMode(spec.alpha ?? "OPAQUE");
    if (spec.emissive !== undefined) m.setEmissiveFactor(linear(spec.emissive));
    if (spec.map) m.setBaseColorTexture(texture(`${key}-albedo`, spec.map));
    if (spec.normalMap) m.setNormalTexture(texture(`${key}-normal`, spec.normalMap));
    if (spec.alpha === "MASK") m.setAlphaCutoff(spec.alphaCutoff ?? 0.5);
    m.setExtras({ kit: spec.kit ?? key, envIntensity: spec.envIntensity ?? 1 });
    gltfMaterials.set(key, m);
    return m;
  };

  let triangles = 0;
  for (const part of parts) {
    const mesh = doc.createMesh(part.name);
    for (const [matKey, geometry] of part.merged()) {
      const spec = materials[matKey];
      const prim = doc.createPrimitive().setMaterial(getMaterial(matKey));
      const accessor = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buffer);
      prim.setAttribute("POSITION", accessor(new Float32Array(geometry.attributes.position.array), "VEC3"));
      prim.setAttribute("NORMAL", accessor(new Float32Array(geometry.attributes.normal.array), "VEC3"));
      if (spec.map || spec.normalMap) prim.setAttribute("TEXCOORD_0", accessor(new Float32Array(geometry.attributes.uv.array), "VEC2"));
      if (spec.vertexColors) prim.setAttribute("COLOR_0", accessor(new Float32Array(geometry.attributes.color.array), "VEC3"));
      const index = geometry.index.array;
      const count = geometry.attributes.position.count;
      prim.setIndices(accessor(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), "SCALAR"));
      triangles += index.length / 3;
      mesh.addPrimitive(prim);
    }
    const node = doc.createNode(part.name).setMesh(mesh).setExtras({ ...part.extras, part: part.name });
    scene.addChild(node);
  }

  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
  await io.write(file, doc);
  return { triangles };
}
