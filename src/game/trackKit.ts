import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Runtime side of the Rome Rail Kit (public/assets/models/kit). The GLBs are
 * authored by scripts/build-rome-rail-kit.mjs as modular parts; this class
 * loads them once, applies shared PBR settings, and composes gameplay-fitted
 * trains, obstacles and pickups that all share GPU geometry and materials.
 */

const KIT_FILES = ["rail-track", "trains", "track-obstacles", "pickups"] as const;
export const KIT_SEGMENT_LENGTH = 6;
const BAY_LENGTH = 2.1;
const FREIGHT_GAP = 0.3;
const MIN_BOGIE_SPACING = 2.6;

export type PassengerStyle = "metro" | "regional" | "littorina" | "express";
export type TrainStyle = PassengerStyle | "freight";
export type BarrierVariant = "works" | "travertine" | "crates";
export type GateVariant = "crossing" | "column" | "scaffold";
export type PowerKind = "multiplier" | "magnet" | "shield";

export const PARKED_STYLES: TrainStyle[] = ["metro", "regional", "freight", "littorina", "regional", "freight", "metro"];
export const ONCOMING_STYLES: TrainStyle[] = ["express", "metro", "express", "regional"];
export const BARRIER_VARIANTS: BarrierVariant[] = ["works", "travertine", "crates"];
export const GATE_VARIANTS: GateVariant[] = ["crossing", "column", "scaffold"];

/** Integer hash for stable, well-mixed per-entity variety. */
export function kitHash(n: number) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function trainStyleFor(id: number, oncoming: boolean): TrainStyle {
  const list = oncoming ? ONCOMING_STYLES : PARKED_STYLES;
  return list[kitHash(id) % list.length];
}

interface KitPrimitive {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

export interface KitPart {
  name: string;
  primitives: KitPrimitive[];
  extras: Record<string, unknown>;
}

interface PassengerMeta {
  cab: number;
  pattern: string[];
}

export interface FreightPlanEntry {
  part: "freight:boxcar" | "freight:boxcarShort" | "freight:tank";
  length: number;
}

const WAGON_LENGTHS = { long: 8, short: 5.6 } as const;

/**
 * Picks a long/short wagon mix whose shared stretch factor stays close to 1.
 * Near-equal fits are chosen by seed so consists (and tank wagons) vary.
 */
export function planFreight(length: number, seed: number): { wagons: FreightPlanEntry[]; scale: number } {
  const options: Array<{ long: number; short: number; error: number; scale: number }> = [];
  for (let long = 0; long <= 3; long++) {
    for (let short = 0; short <= 3; short++) {
      const count = long + short;
      if (!count) continue;
      const authored = long * WAGON_LENGTHS.long + short * WAGON_LENGTHS.short;
      const scale = (length - FREIGHT_GAP * (count - 1)) / authored;
      if (scale <= 0) continue;
      options.push({ long, short, error: Math.abs(Math.log(scale)), scale });
    }
  }
  options.sort((a, b) => a.error - b.error);
  // Allow alternatives only while every wagon stays within ~12% of authored length.
  const tolerance = Math.max(options[0].error, Math.min(options[0].error + 0.09, 0.12));
  const near = options.filter((option) => option.error <= tolerance);
  const h = kitHash(seed);
  const best = near[h % near.length];
  const wagons: FreightPlanEntry[] = [];
  for (let i = 0; i < best.long; i++) {
    const part = ((h >>> (4 + i * 3)) & 7) < 3 ? "freight:tank" : "freight:boxcar";
    wagons.push({ part, length: WAGON_LENGTHS.long * best.scale });
  }
  for (let i = 0; i < best.short; i++) wagons.push({ part: "freight:boxcarShort", length: WAGON_LENGTHS.short * best.scale });
  // Rotate the order so short wagons are not always last.
  const shift = wagons.length ? (h >>> 11) % wagons.length : 0;
  return { wagons: [...wagons.slice(shift), ...wagons.slice(0, shift)], scale: best.scale };
}

/** Splits the body behind the cab into whole bays with one shared stretch factor. */
export function planBays(length: number, cab: number) {
  const available = Math.max(BAY_LENGTH * 0.6, length - cab);
  const count = Math.max(1, Math.round(available / BAY_LENGTH));
  return { count, scale: available / (count * BAY_LENGTH) };
}

export class TrackKit {
  readonly parts = new Map<string, KitPart>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly passenger = new Map<string, PassengerMeta>();
  private readonly blinkers: THREE.MeshStandardMaterial[] = [];
  private readonly signals: THREE.MeshStandardMaterial[] = [];
  private litLamp: THREE.MeshStandardMaterial | null = null;
  private envMap: THREE.Texture | null = null;
  private shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private shadowMaterial: THREE.MeshBasicMaterial;
  private glowMaterial: THREE.SpriteMaterial;
  private beamMaterial: THREE.MeshBasicMaterial;
  private disposed = false;

  private constructor() {
    this.shadowGeometry.rotateX(-Math.PI / 2);
    const shadowTexture = this.ownTexture(this.gradientTexture(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.2, "rgba(0,0,0,0.75)");
      g.addColorStop(0.8, "rgba(0,0,0,0.75)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const fade = ctx.createLinearGradient(0, 0, 0, h);
      fade.addColorStop(0, "rgba(255,255,255,1)");
      fade.addColorStop(0.04, "rgba(255,255,255,0)");
      fade.addColorStop(0.96, "rgba(255,255,255,0)");
      fade.addColorStop(1, "rgba(255,255,255,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
    }));
    this.shadowMaterial = this.ownMaterial(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 }));
    this.shadowMaterial.polygonOffset = true;
    this.shadowMaterial.polygonOffsetFactor = -2;
    const glowTexture = this.ownTexture(this.gradientTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,250,232,1)");
      g.addColorStop(0.18, "rgba(255,236,190,0.75)");
      g.addColorStop(0.5, "rgba(255,210,140,0.18)");
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }));
    this.glowMaterial = this.ownMaterial(new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const beamTexture = this.ownTexture(this.gradientTexture(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "rgba(255,226,160,0.9)");
      g.addColorStop(1, "rgba(255,226,160,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, "rgba(255,255,255,1)");
      side.addColorStop(0.3, "rgba(255,255,255,0)");
      side.addColorStop(0.7, "rgba(255,255,255,0)");
      side.addColorStop(1, "rgba(255,255,255,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, w, h);
    }));
    this.beamMaterial = this.ownMaterial(new THREE.MeshBasicMaterial({ map: beamTexture, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.geometries.add(this.shadowGeometry);
  }

  static async load(loader: GLTFLoader, baseUrl: string, renderer: THREE.WebGLRenderer) {
    const kit = new TrackKit();
    try {
      const scenes = await Promise.all(KIT_FILES.map((file) => loader.loadAsync(`${baseUrl}${file}.glb`)));
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      kit.envMap = pmrem.fromScene(room, 0.035).texture;
      room.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
        }
      });
      pmrem.dispose();
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      for (const gltf of scenes) kit.ingest(gltf.scene, anisotropy);
      const passenger = scenes[1].scene.userData.passenger as Record<string, PassengerMeta> | undefined;
      for (const [style, meta] of Object.entries(passenger ?? {})) kit.passenger.set(style, meta);
      return kit;
    } catch (error) {
      kit.dispose();
      throw error;
    }
  }

  private gradientTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!, w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private ownTexture<T extends THREE.Texture>(texture: T) {
    this.textures.add(texture);
    return texture;
  }

  private ownMaterial<T extends THREE.Material>(material: T) {
    this.materials.add(material);
    return material;
  }

  private ingest(root: THREE.Object3D, anisotropy: number) {
    root.updateMatrixWorld(true);
    for (const node of root.children) {
      const primitives: KitPrimitive[] = [];
      node.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = this.prepareMaterial(mesh.material as THREE.Material, anisotropy);
        this.geometries.add(mesh.geometry);
        primitives.push({ geometry: mesh.geometry, material, matrix: mesh.matrixWorld.clone() });
      });
      // GLTFLoader sanitises ":" out of node names, so the generator stores the id in extras.
      const name = String(node.userData.part ?? node.name);
      if (primitives.length) this.parts.set(name, { name, primitives, extras: { ...node.userData } });
    }
  }

  private prepareMaterial(material: THREE.Material, anisotropy: number) {
    if (this.materials.has(material)) return material;
    this.materials.add(material);
    const standard = material as THREE.MeshStandardMaterial;
    const kind = String(material.userData.kit ?? "");
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) {
        value.anisotropy = anisotropy;
        this.textures.add(value);
      }
    }
    if (standard.isMeshStandardMaterial) {
      standard.envMap = this.envMap;
      standard.envMapIntensity = Number(material.userData.envIntensity ?? 1) * 0.85;
      if (kind === "glass") {
        // Cab windscreens are overlaid 6 mm proud of the nose; bias them forward.
        standard.polygonOffset = true;
        standard.polygonOffsetFactor = -1;
        standard.polygonOffsetUnits = -2;
      }
      if (kind === "lamp") {
        standard.emissiveIntensity = 0.35;
        this.litLamp = this.ownMaterial(standard.clone());
        this.litLamp.emissiveIntensity = 3.2;
        this.litLamp.toneMapped = false;
      }
      if (kind === "beacon") this.blinkers.push(standard);
      if (kind === "signal") this.signals.push(standard);
      if (kind === "gold" || kind === "gem") standard.emissiveIntensity = 0.6;
      if (kind === "shieldPaint") standard.emissiveIntensity = 0.8;
    }
    return material;
  }

  /** Instantiates a part as lightweight meshes that share kit resources. */
  instance(name: string, lit = false) {
    const part = this.parts.get(name);
    const group = new THREE.Group();
    group.name = name;
    if (!part) return group;
    for (const primitive of part.primitives) {
      const useLit = lit && this.litLamp && primitive.material.userData.kit === "lamp";
      const mesh = new THREE.Mesh(primitive.geometry, useLit ? this.litLamp! : primitive.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(primitive.matrix);
      group.add(mesh);
    }
    return group;
  }

  hasPart(name: string) {
    return this.parts.has(name);
  }

  get trackParts() {
    // Variant index = position: clean 0, worn 1, far LOD 2.
    return ["track:clean", "track:worn", "track:far"].map((name) => this.parts.get(name) ?? null);
  }

  get coin() {
    return this.parts.get("coin:aureus")?.primitives[0] ?? null;
  }

  private addShadow(group: THREE.Group, length: number, width = 2.5) {
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.scale.set(width, 1, length + 0.5);
    shadow.position.set(0, 0.012, -length / 2);
    shadow.renderOrder = -1;
    group.add(shadow);
  }

  private addBogie(group: THREE.Group, name: string, z: number) {
    const bogie = this.instance(name);
    bogie.position.z = z;
    group.add(bogie);
  }

  /** Builds a train whose front face sits at z = 0 and that ends at z = -length. */
  createTrain(style: TrainStyle, length: number, oncoming: boolean, seed: number) {
    if (style === "freight" || !this.passenger.has(style)) return this.createFreight(length, seed);
    const meta = this.passenger.get(style)!;
    const group = new THREE.Group();
    const cab = this.instance(`${style}:cab`, oncoming);
    group.add(cab);
    const cabPart = this.parts.get(`${style}:cab`)!;
    const bogies = [Number(cabPart.extras.bogieAt ?? -1.5)];
    const { count, scale } = planBays(length, meta.cab);
    for (let i = 0; i < count; i++) {
      const key = meta.pattern[i % meta.pattern.length];
      const bay = this.instance(`${style}:bay${key}`);
      const z = -(meta.cab + i * BAY_LENGTH * scale);
      bay.position.z = z;
      bay.scale.z = scale;
      group.add(bay);
      if (key === "J") bogies.push(z);
    }
    const tail = this.instance(`${style}:tail`);
    tail.position.z = -length;
    group.add(tail);
    bogies.push(-(length - 1.45));
    let last = Infinity;
    for (const z of bogies.sort((a, b) => b - a)) {
      if (last - z < MIN_BOGIE_SPACING) continue;
      this.addBogie(group, "bogie:passenger", z);
      last = z;
    }
    this.addShadow(group, length);
    if (oncoming) this.addHeadlightGlow(group, cabPart);
    group.userData.trainStyle = style;
    return group;
  }

  private addHeadlightGlow(group: THREE.Group, cabPart: KitPart) {
    const lamps = (cabPart.extras.lamps as number[][] | undefined) ?? [];
    for (const [x, y, z] of lamps) {
      const glow = new THREE.Sprite(this.glowMaterial);
      glow.position.set(x, y, z + 0.08);
      glow.scale.setScalar(1.15);
      group.add(glow);
    }
    // Headlight wash on the sleepers ahead warns of an oncoming train.
    const beam = new THREE.Mesh(this.shadowGeometry, this.beamMaterial);
    beam.scale.set(2.3, 1, 7);
    beam.position.set(0, 0.03, 3.6);
    group.add(beam);
  }

  private createFreight(length: number, seed: number) {
    const group = new THREE.Group();
    const { wagons, scale } = planFreight(length, seed);
    let cursor = 0;
    for (const wagon of wagons) {
      const part = this.parts.get(wagon.part);
      const node = this.instance(wagon.part);
      node.position.z = -cursor;
      node.scale.z = scale;
      group.add(node);
      const gear = String(part?.extras.gear ?? "bogie:freight");
      const offset = Number(part?.extras.gearOffset ?? 1.5) * scale;
      this.addBogie(group, gear, -(cursor + offset));
      this.addBogie(group, gear, -(cursor + wagon.length - offset));
      cursor += wagon.length + FREIGHT_GAP;
    }
    this.addShadow(group, length);
    group.userData.trainStyle = "freight";
    return group;
  }

  createBarrier(variant: BarrierVariant) {
    const group = this.instance(`barrier:${variant}`);
    this.addShadow(group, 0.7, 2.3);
    group.children.at(-1)!.position.z = -0.3;
    return group;
  }

  createGate(variant: GateVariant) {
    const group = this.instance(`gate:${variant}`);
    this.addShadow(group, 0.8, 2.6);
    group.children.at(-1)!.position.z = -0.3;
    return group;
  }

  createPower(kind: PowerKind) {
    return this.instance(`power:${kind}`);
  }

  /** Animates shared emissive materials (works beacons, crossing signals). */
  update(time: number, reducedMotion: boolean) {
    const beacon = reducedMotion ? 1.6 : 0.6 + Math.max(0, Math.sin(time * 7)) * 2.6;
    for (const m of this.blinkers) m.emissiveIntensity = beacon;
    const alternate = reducedMotion ? 1.4 : Math.sin(time * 5) > 0 ? 2.4 : 0.25;
    for (const m of this.signals) m.emissiveIntensity = alternate;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.envMap?.dispose();
    this.parts.clear();
  }
}

export { BAY_LENGTH };
