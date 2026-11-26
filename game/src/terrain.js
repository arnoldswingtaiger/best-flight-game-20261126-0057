// The valley the courier flies over: rolling hills, an eastern mountain
// ridge, a winding river, patchwork fields, two roads, a little town and
// one runway, all from a seed so every visit looks the same.
//
// Coordinates are metres: x east, z north, y up. Heading 0 is north (+z).

import { RUNWAY } from './config.js';
import { hash2, noise2 } from './random.js';

const SEED = 20261126;
const TOWN = { x: -200, z: 520, radius: 130 };
const ROAD_NS_X = -200;
const ROAD_EW_Z = 1200;

/** The river's centreline at a given z: it snakes down the valley. */
export function riverCentre(z) {
  return 240 + 140 * Math.sin(z * 0.0011 + 0.8) + 60 * Math.sin(z * 0.0029 + 2.1);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Ground height in metres at (x, z). The runway strip is flat. */
export function groundHeightAt(x, z) {
  let height = 10 * noise2(x * 0.004, z * 0.004, SEED);
  height += 6 * noise2(x * 0.013 + 40, z * 0.013, SEED + 5);
  // Western hills and the northern rise.
  height += 110 * smoothstep(-560, -950, x);
  height += 150 * smoothstep(2600, 3400, z);
  // The eastern ridge: the Mountain Pass mission climbs through it.
  height += 210 * smoothstep(520, 900, x);
  height += 40 * noise2(x * 0.006 + 9, z * 0.006, SEED + 11) * smoothstep(500, 800, x);
  // The town sits on a low built-up mound.
  const townDist = Math.hypot(x - TOWN.x, z - TOWN.z);
  height += 7 * (1 - smoothstep(60, TOWN.radius, townDist));
  // The river cuts a shallow channel.
  const riverDist = Math.abs(x - riverCentre(z));
  height = height * smoothstep(18, 60, riverDist) + 1.5 * (1 - smoothstep(18, 60, riverDist));
  // Flatten the runway strip so takeoffs and landings are level.
  const across = Math.abs(x - RUNWAY.x);
  const along = z > RUNWAY.zStart - 60 && z < RUNWAY.zEnd + 60;
  if (along) {
    const flat = 1 - smoothstep(RUNWAY.halfWidth + 6, RUNWAY.halfWidth + 60, across);
    height *= 1 - flat;
  }
  return Math.max(0, height);
}

/**
 * What the ground is at (x, z): water, runway, road, town, forest,
 * rock, field or grass. The renderer colours each kind on its own.
 */
export function landKindAt(x, z) {
  const riverDist = Math.abs(x - riverCentre(z));
  if (riverDist < 22) return 'water';
  if (riverDist < 30) return 'sand';
  const across = Math.abs(x - RUNWAY.x);
  if (across < RUNWAY.halfWidth && z > RUNWAY.zStart && z < RUNWAY.zEnd) return 'runway';
  if (Math.abs(x - ROAD_NS_X) < 5 && z > -400 && z < 3200) return 'road';
  if (Math.abs(z - ROAD_EW_Z) < 5 && x > -700 && x < 900) return 'road';
  const townDist = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (townDist < TOWN.radius && hash2(Math.floor(x / 24), Math.floor(z / 24), SEED + 21) < 0.55) return 'town';
  const height = groundHeightAt(x, z);
  if (height > 120) return 'rock';
  const patch = hash2(Math.floor(x / 150), Math.floor(z / 150), SEED + 33);
  if (patch < 0.16) return 'forest';
  if (patch < 0.72) return 'field';
  return 'grass';
}

/** The palette index of a field patch, so neighbouring fields differ. */
export function fieldShade(x, z) {
  return hash2(Math.floor(x / 150), Math.floor(z / 150), SEED + 47);
}

/** A fixed set of clouds, placed by seed in world space. */
export function makeClouds(count) {
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    const cx = (hash2(i, 3, SEED + 61) - 0.5) * 4200;
    const cz = hash2(i, 7, SEED + 61) * 3800 - 400;
    const cy = 380 + hash2(i, 11, SEED + 61) * 220;
    const size = 90 + hash2(i, 13, SEED + 61) * 160;
    clouds.push({ x: cx, y: cy, z: cz, size });
  }
  return clouds;
}
