#!/usr/bin/env node
/**
 * Offline generator for the Rome Rail Kit: authored, gameplay-fitted GLBs for
 * the track bed, trains, track obstacles, coins and power-ups.
 *
 * Outputs are committed to public/assets/models/kit, so neither npm ci nor the
 * Docker build installs these tools. One-off setup outside the app dependencies:
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 \
 *     @gltf-transform/functions@4 meshoptimizer sharp
 * Usage: node scripts/build-rome-rail-kit.mjs [track|trains|props ...]
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { writeGlb } from "./rome-rail-kit/lib.mjs";

const OUT = path.resolve("public/assets/models/kit");
const only = new Set(process.argv.slice(2));
const wanted = (name) => only.size === 0 || only.has(name);

await mkdir(OUT, { recursive: true });

async function emit(file, build) {
  const started = Date.now();
  const { materials, parts, extras } = await build();
  const target = path.join(OUT, file);
  const { triangles } = await writeGlb(target, { materials, parts, extras });
  const { size } = await stat(target);
  const names = parts.map((p) => p.name).join(", ");
  console.log(`${file}: ${parts.length} parts, ${Math.round(triangles).toLocaleString()} tris, ${(size / 1024).toFixed(0)} KB, ${Date.now() - started} ms`);
  console.log(`  ${names}`);
}

if (wanted("track")) {
  const { buildTrack } = await import("./rome-rail-kit/track.mjs");
  await emit("rail-track.glb", buildTrack);
}
if (wanted("trains")) {
  const { buildTrains } = await import("./rome-rail-kit/trains.mjs");
  await emit("trains.glb", buildTrains);
}
if (wanted("props")) {
  const { buildObstacles, buildPickups } = await import("./rome-rail-kit/props.mjs");
  await emit("track-obstacles.glb", buildObstacles);
  await emit("pickups.glb", buildPickups);
}
