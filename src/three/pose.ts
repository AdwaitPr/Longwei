import * as THREE from "three";
import { DEG, TAU, clamp, lerp, sstep, smoother } from "./utils";

/* ------------------------------------------------------------------ */
/* Scroll envelopes — every beat of the page in one place              */
/* ------------------------------------------------------------------ */

/** ring -> dragon morph amount */
export const morphT = (p: number) => smoother(sstep(0.045, 0.168, p));

/** flame-breath burst envelope (transition into Festivals) */
export const flameEnv = (p: number) => {
  const a = sstep(0.752, 0.772, p);
  const r = 1 - sstep(0.786, 0.812, p);
  return clamp(a * r, 0, 1);
};

/** wormhole activation */
export const wormholeT = (p: number) => sstep(0.882, 0.93, p);

/** dragon shrink into wormhole */
export const diveShrink = (p: number) => lerp(1, 0.34, sstep(0.95, 0.997, p));

/** dragon dissolve at the very end */
export const vanishT = (p: number) => sstep(0.982, 0.9999, p);

/** pearl leads the dragon into the tunnel slightly earlier */
export const pearlDiveT = (p: number) => sstep(0.935, 0.975, p);

/**
 * Inscription ignition — the ring's hidden script flares awake an instant
 * before the transformation, simmers while the dragon travels, and flares
 * once more as the dragon plunges into the wormhole.
 */
export const runeGlowEnv = (p: number) => {
  const ignite = sstep(0.014, 0.05, p); // fire finds the script just before the morph
  const surge = Math.exp(-Math.pow((p - 0.055) / 0.028, 2)) * 0.7; // ignition flash
  const simmer = lerp(1.0, 0.22, sstep(0.1, 0.2, p)); // cools as the creature wakes
  const finaleFlare = sstep(0.92, 0.945, p) * (1 - sstep(0.965, 0.995, p)) * 0.9;
  return ignite * simmer + surge + finaleFlare;
};

/* ------------------------------------------------------------------ */
/* Serpent spine — parametric snake generator                          */
/* ------------------------------------------------------------------ */

export const SPINE_N = 22;

/** world position of the wormhole mouth (used by dragon + pearl dive) */
export const WORMHOLE_POS = new THREE.Vector3(0, 0.18, -8.5);

export interface PoseParams {
  origin: [number, number, number];
  yaw: number; // base walk-heading azimuth (deg) — body trails along heading
  pitch: number; // base walk-heading pitch (deg)
  coil: number; // constant yaw rate (deg / control point)
  yawAmp: number;
  yawFreq: number;
  yawPhase: number;
  pitchAmp: number;
  pitchFreq: number;
  pitchPhase: number;
}

const segLen = 0.82;

const KEYFRAMES: { at: number; pose: PoseParams }[] = [
  // birth — head breaks from the top of the ring, diving down-back
  { at: 0.02, pose: { origin: [0, 2.55, 0.4], yaw: 178, pitch: -52, coil: 1.2, yawAmp: 6.5, yawFreq: 1.0, yawPhase: 0.4, pitchAmp: 12, pitchFreq: 0.8, pitchPhase: 0 } },
  // fully stretched S — swimming toward the first section
  { at: 0.15, pose: { origin: [0.6, 3.2, 1.7], yaw: 192, pitch: -26, coil: -1.4, yawAmp: 8.5, yawFreq: 1.7, yawPhase: 1.3, pitchAmp: 14, pitchFreq: 1.1, pitchPhase: 0.8 } },
  // ORIGINS — sweeps from the left, crosses between the two panels
  { at: 0.26, pose: { origin: [-2.5, 3.1, 1.0], yaw: 158, pitch: -34, coil: 1.8, yawAmp: 7.5, yawFreq: 1.4, yawPhase: 2.1, pitchAmp: 16, pitchFreq: 1.0, pitchPhase: 2.4 } },
  // INNOVATION — re-enters from the right, deeper
  { at: 0.41, pose: { origin: [2.6, 2.9, -1.0], yaw: 203, pitch: -30, coil: -2.0, yawAmp: 8.0, yawFreq: 2.0, yawPhase: 4.1, pitchAmp: 13, pitchFreq: 1.3, pitchPhase: 1.0 } },
  // ART — coils around the centre like a living border
  { at: 0.565, pose: { origin: [0.2, 3.5, 2.3], yaw: 172, pitch: -24, coil: 2.8, yawAmp: 6.0, yawFreq: 1.1, yawPhase: 0.6, pitchAmp: 17, pitchFreq: 0.9, pitchPhase: 3.7 } },
  // ARCHITECTURE — travels left, low and deep
  { at: 0.7, pose: { origin: [-2.8, 2.7, -0.4], yaw: 188, pitch: -22, coil: -1.2, yawAmp: 7.0, yawFreq: 1.6, yawPhase: 5.1, pitchAmp: 12, pitchFreq: 1.1, pitchPhase: 2.0 } },
  // FLAME — head rears up, facing the viewer
  { at: 0.7680, pose: { origin: [-0.7, 1.7, 2.8], yaw: 181, pitch: 14, coil: 0.6, yawAmp: 5.0, yawFreq: 1.4, yawPhase: 3.0, pitchAmp: 13, pitchFreq: 0.75, pitchPhase: 4.4 } },
  // FESTIVALS — widest, most celebratory swirl
  { at: 0.845, pose: { origin: [0.9, 3.3, 1.4], yaw: 166, pitch: -32, coil: -2.4, yawAmp: 9.0, yawFreq: 2.2, yawPhase: 0.9, pitchAmp: 15, pitchFreq: 1.2, pitchPhase: 2.2 } },
  // PRE-DIVE — banks toward the deep centre, already aligning with the tunnel
  { at: 0.905, pose: { origin: [-2.2, 2.1, -1.2], yaw: 38, pitch: -18, coil: 2.0, yawAmp: 6.0, yawFreq: 1.6, yawPhase: 1.6, pitchAmp: 12, pitchFreq: 1.0, pitchPhase: 0.5 } },
  // DIVE — straightens into an arrow aimed at the wormhole
  { at: 0.952, pose: { origin: [0.0, 0.75, -5.0], yaw: 4, pitch: 5, coil: 0, yawAmp: 1.6, yawFreq: 1.1, yawPhase: 0, pitchAmp: 2.0, pitchFreq: 0.9, pitchPhase: 0 } },
  // ENTERED — nose inside the tunnel
  { at: 1.0, pose: { origin: [0.0, 0.5, -7.0], yaw: 2, pitch: 3, coil: 0, yawAmp: 1.0, yawFreq: 1.0, yawPhase: 0, pitchAmp: 1.5, pitchFreq: 0.9, pitchPhase: 0 } },
];

const _h = new THREE.Vector3();
const _side = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function lerpParams(a: PoseParams, b: PoseParams, t: number): PoseParams {
  const L = (x: number, y: number) => lerp(x, y, t);
  return {
    origin: [L(a.origin[0], b.origin[0]), L(a.origin[1], b.origin[1]), L(a.origin[2], b.origin[2])],
    yaw: L(a.yaw, b.yaw), pitch: L(a.pitch, b.pitch), coil: L(a.coil, b.coil),
    yawAmp: L(a.yawAmp, b.yawAmp), yawFreq: L(a.yawFreq, b.yawFreq), yawPhase: L(a.yawPhase, b.yawPhase),
    pitchAmp: L(a.pitchAmp, b.pitchAmp), pitchFreq: L(a.pitchFreq, b.pitchFreq), pitchPhase: L(a.pitchPhase, b.pitchPhase),
  };
}

let _cacheKey = -1;
const _cacheParams: PoseParams = { ...KEYFRAMES[0].pose };

/** interpolated pose params at progress p */
function paramsAt(p: number): PoseParams {
  const k = Math.round(p * 4000);
  if (k === _cacheKey) return _cacheParams;
  _cacheKey = k;
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1].at < p) i++;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const t = smoother(clamp((p - a.at) / (b.at - a.at), 0, 1));
  Object.assign(_cacheParams, lerpParams(a.pose, b.pose, t));
  return _cacheParams;
}

/** write spine control points (n = out.length) for progress p */
export function snakePoints(p: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const prm = paramsAt(p);
  const n = out.length;
  const pos = new THREE.Vector3(prm.origin[0], prm.origin[1], prm.origin[2]);
  _h.set(
    Math.sin(prm.yaw * DEG) * Math.cos(prm.pitch * DEG),
    Math.sin(prm.pitch * DEG),
    Math.cos(prm.yaw * DEG) * Math.cos(prm.pitch * DEG)
  ).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) pos.addScaledVector(_h, segLen);
    out[i].copy(pos);
    // rotate heading for the next segment
    const f = i / (n - 1);
    const yawRate = (prm.coil + prm.yawAmp * Math.sin(f * prm.yawFreq * TAU + prm.yawPhase)) * DEG;
    const pitchRate = prm.pitchAmp * Math.sin(f * prm.pitchFreq * TAU + prm.pitchPhase) * DEG;
    _side.crossVectors(_h, UP);
    if (_side.lengthSq() < 1e-5) _side.set(1, 0, 0);
    _side.normalize();
    _q.setFromAxisAngle(UP, yawRate);
    _h.applyQuaternion(_q);
    _q.setFromAxisAngle(_side, pitchRate);
    _h.applyQuaternion(_q).normalize();
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ring state — slightly tilted horizontal ellipse, duplicated ends    */
/* ------------------------------------------------------------------ */

export function ringPoints(n: number, time: number, out: THREE.Vector3[]): THREE.Vector3[] {
  const rx = 2.5;
  const ry = 2.3;
  const breathe = 1 + Math.sin(time * 1.4) * 0.012;
  const e = new THREE.Euler(-8 * DEG, 14 * DEG, 0);
  const arc = TAU * 0.9974; // hairline gap at the seam (covered by the pearl) — keeps centripetal CR stable
  for (let i = 0; i < n; i++) {
    const th = Math.PI / 2 + (i / (n - 1)) * arc; // index 0 at the top, running clockwise
    out[i].set(Math.cos(th) * rx * breathe, Math.sin(th) * ry * breathe, 0).applyEuler(e);
    out[i].y += 0.1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Camera track                                                        */
/* ------------------------------------------------------------------ */

const CAM_KEYS: { at: number; pos: [number, number, number]; look: [number, number, number] }[] = [
  { at: 0.0, pos: [0, 0, 8.6], look: [0, 0, 0] },
  { at: 0.1, pos: [0.3, 0.1, 8.4], look: [0, 0.3, 0] },
  { at: 0.26, pos: [-1.5, 0.5, 8.2], look: [-0.4, 0.1, -0.6] },
  { at: 0.41, pos: [1.6, -0.2, 8.4], look: [0.4, 0, -1.2] },
  { at: 0.565, pos: [0, 0.85, 7.9], look: [0, -0.1, -0.5] },
  { at: 0.7, pos: [-1.0, 0.2, 7.6], look: [-0.4, 0.5, -0.4] },
  { at: 0.778, pos: [0.25, 0.4, 6.9], look: [0, 0.7, 0.4] },
  { at: 0.845, pos: [0.9, 0.3, 8.1], look: [0, 0, -1] },
  { at: 0.92, pos: [0, 0.25, 7.9], look: [0, 0.2, -4] },
  { at: 1.0, pos: [0, 0.1, 6.6], look: [0, 0, -9] },
];

export function sampleCamera(
  p: number,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
  zOffset: number
) {
  let i = 0;
  while (i < CAM_KEYS.length - 2 && CAM_KEYS[i + 1].at < p) i++;
  const a = CAM_KEYS[i];
  const b = CAM_KEYS[i + 1];
  const t = smoother(clamp((p - a.at) / (b.at - a.at), 0, 1));
  outPos.set(
    lerp(a.pos[0], b.pos[0], t),
    lerp(a.pos[1], b.pos[1], t),
    lerp(a.pos[2], b.pos[2], t) + zOffset
  );
  outLook.set(
    lerp(a.look[0], b.look[0], t),
    lerp(a.look[1], b.look[1], t),
    lerp(a.look[2], b.look[2], t) + zOffset * 0.4
  );
}
