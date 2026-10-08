import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { TrackKit, KIT_SEGMENT_LENGTH, type TrainStyle } from "./game/trackKit";
import { GameRenderer } from "./game/renderer";
import { World } from "./game/world";

/**
 * Dev-only showroom for the Rome Rail Kit (open /kit-preview.html?view=...).
 * Uses the game's lighting so screenshots match in-game appearance.
 * `view=gameplay&seed=3&s=180` drives the real GameRenderer with a
 * fast-forwarded, invulnerable World to check in-game integration.
 */
const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "lineup";
function gameplay() {
  const container = document.createElement("div");
  container.style.cssText = "width:430px;height:760px;position:relative;overflow:hidden";
  document.body.style.margin = "0";
  document.body.appendChild(container);
  const game = new GameRenderer(container);
  const world = new World(Number(params.get("seed") ?? 3));
  const target = Number(params.get("s") ?? 160);
  const lane = Number(params.get("lane") ?? 0);
  const step = () => {
    world.invulnerableTime = 999;
    world.update(1 / 60);
  };
  while (world.player.s < target && world.status === "running") step();
  world.player.x = lane * 2.4;
  game.resize();
  const frame = () => {
    game.render(world, 1 / 60, false);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __kitReady: boolean }).__kitReady = true;
}

async function showroom() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc9d9);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x4f493d, 1.7));
  const sun = new THREE.DirectionalLight(0xffe2ae, 2.1);
  sun.position.set(-18, 20, 10);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xc5a270, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const kit = await TrackKit.load(loader, `${import.meta.env.BASE_URL}assets/models/kit/`, renderer);

  function track(x: number, from: number, to: number) {
    for (let z = from, k = 0; z > to; z -= KIT_SEGMENT_LENGTH, k++) {
      const seg = kit.instance(k % 3 === 2 ? "track:worn" : "track:clean");
      seg.position.set(x, 0, z);
      scene.add(seg);
    }
  }

  const place = (object: THREE.Object3D, x: number, z: number, ry = 0) => {
    object.position.set(x, 0, z);
    object.rotation.y = ry;
    scene.add(object);
    return object;
  };

  const styles: Array<[TrainStyle, boolean]> = [["metro", false], ["regional", false], ["littorina", false], ["express", true], ["freight", false]];

  if (view === "lineup" || view === "side") {
    for (let i = 0; i < 2; i++) track(-4.8 + i * 7.2, 6, -60);
    styles.forEach(([style, lit], i) => place(kit.createTrain(style, 14 + (i % 2) * 4, lit, i + 3), -7.2 + i * 2.4, 0));
    if (view === "lineup") {
      camera.position.set(9, 6.5, 13);
      camera.lookAt(-2, 1.2, -4);
    } else {
      camera.position.set(14, 3.2, -9);
      camera.lookAt(-2, 1.4, -9);
    }
  } else if (view === "fronts") {
    for (let i = 0; i < 2; i++) track(-4.8 + i * 7.2, 6, -60);
    styles.forEach(([style, lit], i) => place(kit.createTrain(style, 12, lit, i + 11), -7.2 + i * 2.4, 0));
    camera.position.set(-1, 2.2, 10.5);
    camera.lookAt(-2.2, 1.5, 0);
  } else if (view === "freight") {
    track(0, 6, -60);
    [9, 14, 20].forEach((length, i) => place(kit.createTrain("freight", length, false, 40 + i), (i - 1) * 2.4, 0));
    camera.position.set(8, 4.5, 8);
    camera.lookAt(0, 1.2, -6);
  } else if (view === "props") {
    track(0, 6, -40);
    track(7.2, 6, -40);
    const barriers = ["works", "travertine", "crates"] as const;
    const gates = ["crossing", "column", "scaffold"] as const;
    barriers.forEach((v, i) => place(kit.createBarrier(v), (i - 1) * 2.4, 0));
    gates.forEach((v, i) => place(kit.createGate(v), 7.2 + (i - 1) * 2.4, -1.6));
    const coin = kit.coin!;
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(coin.geometry, coin.material);
      mesh.position.set(3.6, 0.9, 2.8 - i * 1.4);
      mesh.rotation.y = 0.5 + i * 0.35;
      scene.add(mesh);
    }
    (["multiplier", "magnet", "shield"] as const).forEach((kind, i) => {
      const power = kit.createPower(kind);
      power.position.set(1.2 + i * 1.2, 1.0, 4.4);
      power.rotation.y = 0.35;
      scene.add(power);
    });
    camera.position.set(3.6, 4.2, 10.5);
    camera.lookAt(3.6, 0.9, -0.8);
  } else if (view === "pickups") {
    const coin = kit.coin!;
    const mesh = new THREE.Mesh(coin.geometry, coin.material);
    mesh.position.set(-1.3, 0.9, 0);
    mesh.rotation.y = 0.35;
    scene.add(mesh);
    (["multiplier", "magnet", "shield"] as const).forEach((kind, i) => {
      const power = kit.createPower(kind);
      power.position.set(-0.2 + i * 1.0, 0.9, 0);
      power.rotation.y = 0.3;
      scene.add(power);
    });
    camera.position.set(0, 1.4, 3.6);
    camera.lookAt(0, 0.9, 0);
  } else {
    // Game camera framing with a typical obstacle row.
    track(-2.4 - 2.4, 12, -200);
    track(2.4, 12, -200);
    place(kit.createTrain("regional", 16, false, 2), -2.4, -14);
    place(kit.createTrain("express", 9, true, 5), 0, -34);
    place(kit.createTrain("freight", 18, false, 6), 2.4, -30);
    place(kit.createBarrier("works"), 0, -12);
    place(kit.createGate("column"), 2.4, -9);
    const coin = kit.coin!;
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(coin.geometry, coin.material);
      mesh.position.set(0, 0.9, -2 - i * 1.6);
      mesh.rotation.y = i * 0.5;
      scene.add(mesh);
    }
    scene.fog = new THREE.Fog(0x8fc9d9, 68, 185);
    camera.fov = 62;
    camera.position.set(0, 4.4, 7.2);
    camera.lookAt(0, 1.2, -10);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  let t = 0;
  renderer.setAnimationLoop(() => {
    t += 1 / 60;
    kit.update(t, false);
    renderer.render(scene, camera);
  });
  (window as unknown as { __kitReady: boolean }).__kitReady = true;
  const info = renderer.info;
  setTimeout(() => console.log(`kit preview ${view}: ${info.render.calls} calls, ${info.render.triangles} tris`), 500);
}

if (view === "gameplay") gameplay();
else void showroom();
