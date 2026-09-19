import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TAU, clamp, lerp, sstep, smoother, damp, hash } from "./utils";
import {
  SPINE_N,
  morphT,
  ringPoints,
  snakePoints,
  flameEnv,
  vanishT,
  pearlDiveT,
  WORMHOLE_POS,
  runeGlowEnv,
} from "./pose";
import { makeScaleMaps, makeRuneTexture } from "./maps";

/* ------------------------------------------------------------------ */
/* shared glow sprite texture                                          */
/* ------------------------------------------------------------------ */

let _glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,244,220,0.55)");
  g.addColorStop(0.62, "rgba(255,220,160,0.14)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

/* ------------------------------------------------------------------ */
/* anatomy                                                             */
/* ------------------------------------------------------------------ */

/** body length — matches the coiled ring's circumference so one becomes the other */
export const BODY_LEN = TAU * 2.32;

/** dragon radius profile: thick chest behind the head, sinuous taper to a whip tail */
export function bodyRadius(u: number): number {
  let r = 0.235;
  // neck swells into the chest
  r += 0.055 * sstep(0.015, 0.1, u) * (1 - sstep(0.1, 0.5, u));
  // long even trunk with a slight belly
  r += 0.02 * Math.sin(Math.PI * clamp((u - 0.12) / 0.6, 0, 1));
  // whip taper from mid-body to tail
  const ts = 0.48;
  if (u > ts) {
    const k = (u - ts) / (1 - ts);
    r *= Math.pow(1 - k, 1.32);
    r += 0.014;
  }
  // muzzle junction closes gently toward the head
  r *= 0.72 + 0.28 * sstep(0, 0.02, u);
  // rib-like muscular ripple (~2.5% amplitude, frequency matches bone count)
  // tapers off toward the tail tip so the thin whip end stays clean
  const ribFreq = 44; // matches typical bone count
  const ribAmp = 0.025 * (1 - sstep(0.75, 1.0, u));
  r *= 1.0 + Math.sin(u * ribFreq * Math.PI) * ribAmp;
  return r;
}

const GRAD_STOPS: [number, THREE.Color][] = [
  [0.0, new THREE.Color("#f8d47c")],
  [0.22, new THREE.Color("#d9b04e")],
  [0.45, new THREE.Color("#2f9c72")],
  [0.68, new THREE.Color("#c9202c")],
  [1.0, new THREE.Color("#5f0c12")],
];

export function spineColor(u: number, out: THREE.Color): THREE.Color {
  let i = 0;
  while (i < GRAD_STOPS.length - 2 && GRAD_STOPS[i + 1][0] < u) i++;
  const [u0, c0] = GRAD_STOPS[i];
  const [u1, c1] = GRAD_STOPS[i + 1];
  return out.copy(c0).lerp(c1, clamp((u - u0) / (u1 - u0), 0, 1));
}

/* ------------------------------------------------------------------ */
/* shader injection — aged metal at rest, living scales when awake     */
/* ------------------------------------------------------------------ */

export interface DragonUniforms {
  [k: string]: THREE.IUniform;
  uWake: THREE.IUniform;
  uRuneGlow: THREE.IUniform;
  uTime: THREE.IUniform;
  uVanish: THREE.IUniform;
}

function dragonUniforms(): DragonUniforms {
  return {
    uWake: { value: 0 },
    uRuneGlow: { value: 0 },
    uTime: { value: 0 },
    uVanish: { value: 0 },
    uRuneMap: { value: makeRuneTexture() },
    uAgedMetal: { value: new THREE.Color("#77602e") },
    uRuneColor: { value: new THREE.Color("#ff6a1e") },
  };
}

function injectDragonShader(mat: THREE.MeshStandardMaterial, U: DragonUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aU; varying float vAU;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\n\tvAU = aU;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uWake; uniform float uRuneGlow; uniform float uTime; uniform float uVanish;
        uniform sampler2D uRuneMap; uniform vec3 uAgedMetal; uniform vec3 uRuneColor;
        varying float vAU;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float pat = 0.5;
          #ifdef USE_ROUGHNESSMAP
            pat = texture2D( roughnessMap, vRoughnessMapUv ).g;
          #endif
          vec3 aged = uAgedMetal * (0.5 + 0.95 * pat);
          aged += vec3(0.55, 0.42, 0.2) * pow( pat, 3.0 ) * 0.55; // polished high spots on old metal
          diffuseColor.rgb = mix( aged, diffuseColor.rgb, uWake );
        }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        {
          float pat2 = 0.5;
          #ifdef USE_ROUGHNESSMAP
            pat2 = texture2D( roughnessMap, vRoughnessMapUv ).g;
          #endif
          roughnessFactor = mix( 0.28 + pat2 * 0.32, roughnessFactor, uWake );
        }`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = mix( 0.92, metalnessFactor, uWake );`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float runeMask = 0.0;
          #ifdef USE_ROUGHNESSMAP
            // body uv.y is tiled 6x around the tube — normalise to one trip around
            // so the two glyph strips read as two carved bands (inner + outer face)
            runeMask = texture2D( uRuneMap, vec2( fract( vAU * 3.0 ), vRoughnessMapUv.y / 6.0 ) ).r;
          #endif
          float shimmer = 0.62 + 0.38 * sin( uTime * 2.2 - vAU * 40.0 );
          totalEmissiveRadiance += uRuneColor * runeMask * uRuneGlow * shimmer;
          float bio = uWake * 0.045 * (0.5 + 0.5 * sin( uTime * 1.6 - vAU * 22.0 ));
          totalEmissiveRadiance += diffuseColor.rgb * bio;
        }`
      )
      .replace(
        "#include <dithering_fragment>",
        `gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3(0.039, 0.016, 0.02), uVanish );
        #include <dithering_fragment>`
      );
  };
}

/* ------------------------------------------------------------------ */
/* geometry part helpers (everything binds to one skeleton)            */
/* ------------------------------------------------------------------ */

const _c1 = new THREE.Color();

function setScalarAttr(geo: THREE.BufferGeometry, name: string, value: number, itemSize = 1) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * itemSize);
  arr.fill(value);
  geo.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
}

function setColorAttr(geo: THREE.BufferGeometry, hex: string, mul = 1) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c1.set(hex).multiplyScalar(mul);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c1.r;
    arr[i * 3 + 1] = _c1.g;
    arr[i * 3 + 2] = _c1.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
}

function setSkin(geo: THREE.BufferGeometry, bone: number) {
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone;
    sw[i * 4] = 1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
}

/** two-bone blended skinning for geometry that follows the spine between bones */
function setSkin2(geo: THREE.BufferGeometry, bone0: number, bone1: number, w0: number, w1: number) {
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone0;
    si[i * 4 + 1] = bone1;
    sw[i * 4] = w0;
    sw[i * 4 + 1] = w1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
}

function prep(
  geoIn: THREE.BufferGeometry,
  hex: string,
  aU: number,
  bone: number,
  m?: THREE.Matrix4,
  mul = 1
) {
  let geo = geoIn;
  if (geo.index) geo = geo.toNonIndexed(); // mergeGeometries needs uniform indexing
  if (m) geo.applyMatrix4(m);
  setColorAttr(geo, hex, mul);
  setScalarAttr(geo, "aU", aU);
  setSkin(geo, bone);
  return geo;
}

const mat4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) => {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
  return m;
};

/** static tapered tube along a point list (antlers / whiskers) */
function tubeAlong(pts: THREE.Vector3[], r0: number, r1: number, rings: number, radial: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.6);
  const frames = curve.computeFrenetFrames(rings, false);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const t = (i: number) => i / rings;
  for (let i = 0; i <= rings; i++) {
    curve.getPoint(t(i), P);
    const r = lerp(r0, r1, t(i));
    const N = frames.normals[Math.min(i, rings - 1)];
    const B = frames.binormals[Math.min(i, rings - 1)];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * TAU;
      const nx = N.x * Math.cos(th) + B.x * Math.sin(th);
      const ny = N.y * Math.cos(th) + B.y * Math.sin(th);
      const nz = N.z * Math.cos(th) + B.z * Math.sin(th);
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nrm.push(nx, ny, nz);
      uv.push(t(i), j / radial);
      if (i < rings && j < radial) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ */
/* pearl                                                               */
/* ------------------------------------------------------------------ */

const pearlMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float fr = pow(1.0 - max(dot(normalize(vN), v), 0.0), 1.6);
        float pulse = 0.85 + 0.15 * sin(uTime * 2.4);
        vec3 col = mix(vec3(0.10, 0.42, 0.32), vec3(0.78, 1.0, 0.9), fr) * pulse;
        col += vec3(1.0, 0.92, 0.7) * pow(fr, 3.5) * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

/* ------------------------------------------------------------------ */
/* quality                                                             */
/* ------------------------------------------------------------------ */

export interface DragonQuality {
  rings: number;
  radial: number;
  bones: number;
  fins: number;
  whiskerBones: number;
  reduced: boolean;
}

interface DragonUpdate {
  progress: number;
  time: number;
  dt: number;
  xScale: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _e1 = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const Z_FWD = new THREE.Vector3(0, 0, 1);

/* ------------------------------------------------------------------ */
/* Dragon — one skinned body on a skeletal spine rig                   */
/* ------------------------------------------------------------------ */

export class Dragon {
  group = new THREE.Group();
  armature = new THREE.Group();

  private bodyBones: THREE.Bone[] = [];
  private headBone!: THREE.Bone;
  private jawBone!: THREE.Bone;
  private whiskBones: THREE.Bone[][] = [[], []];
  private finBones: THREE.Bone[] = [];
  private skeleton!: THREE.Skeleton;

  private uniforms = dragonUniforms();
  private curve = new THREE.CatmullRomCurve3([], false, "centripetal", 0.5);

  private ringPts: THREE.Vector3[] = [];
  private snakePts: THREE.Vector3[] = [];
  private ctrl: THREE.Vector3[] = [];

  private finProfile: number[] = [];
  private whiskSim: { pos: THREE.Vector3[] }[] = [];
  private whiskLen = [0.44, 0.44, 0.42];
  private bodyMat!: THREE.MeshStandardMaterial;

  private pearl = new THREE.Group();
  private pearlMat: THREE.ShaderMaterial;
  private pearlGlow: THREE.Sprite;

  private quality: DragonQuality;
  private prevP = 0;
  private swimVel = 0;
  private headPosL = new THREE.Vector3();
  private headQuatL = new THREE.Quaternion();

  readonly mouthPos = new THREE.Vector3(); // group-local
  readonly mouthDir = new THREE.Vector3(0, 0, 1);
  readonly headPos = new THREE.Vector3();
  burstPoint = new THREE.Vector3(); // world, for the flame light

  constructor(q: DragonQuality) {
    this.quality = q;
    this.group.add(this.armature);

    for (let i = 0; i < SPINE_N; i++) {
      this.ringPts.push(new THREE.Vector3());
      this.snakePts.push(new THREE.Vector3());
      this.ctrl.push(new THREE.Vector3());
    }
    this.curve.points = this.ctrl;

    /* ---------------- skeleton ---------------- */
    const NB = q.bones;
    const ds = BODY_LEN / (NB - 1);
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.position.set(0, 0, -i * ds);
      this.bodyBones.push(b);
      this.armature.add(b);
    }
    this.headBone = new THREE.Bone();
    this.headBone.position.set(0, 0, 0.02);
    this.armature.add(this.headBone);
    this.jawBone = new THREE.Bone();
    this.jawBone.position.set(0, -0.1, 0.14);
    this.armature.add(this.jawBone);
    const HEAD = NB;
    const JAW = NB + 1;

    // whisker bind curves — rooted at the lip, streaming back past the skull
    const whiskBind = (s: number) => [
      new THREE.Vector3(s * 0.1, -0.05, 0.58),
      new THREE.Vector3(s * 0.3, -0.12, 0.36),
      new THREE.Vector3(s * 0.52, -0.24, 0.1),
      new THREE.Vector3(s * 0.68, -0.4, -0.2),
    ];
    const k = q.whiskerBones;
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const s = sIdx === 0 ? -1 : 1;
      const pts = whiskBind(s);
      for (let i = 0; i < k; i++) {
        const f = (i + 0.35) / k;
        const b = new THREE.Bone();
        const a = pts[Math.min(pts.length - 2, Math.floor(f * (pts.length - 1)))];
        const c = pts[Math.min(pts.length - 1, Math.floor(f * (pts.length - 1)) + 1)];
        b.position.lerpVectors(a, c, (f * (pts.length - 1)) % 1);
        this.whiskBones[sIdx].push(b);
        this.armature.add(b);
      }
      this.whiskSim.push({ pos: pts.map((p) => p.clone()) });
    }
    const W0 = NB + 2; // first whisker bone index

    // fin bones
    const us: number[] = [];
    for (let j = 0; j < q.fins; j++) us.push(0.035 + (j / (q.fins - 1)) * 0.84);
    us.forEach((u, j) => {
      const b = new THREE.Bone();
      b.position.set(0, bodyRadius(u) * 0.85, -u * BODY_LEN);
      this.finBones.push(b);
      this.armature.add(b);
      // mane: tall near the shoulders & neck, slender toward the tail
      const shoulder = Math.exp(-Math.pow((u - 0.2) * 5.2, 2));
      const neck = Math.exp(-Math.pow((u - 0.05) * 9.0, 2));
      this.finProfile.push(0.16 + shoulder * 0.34 + neck * 0.3 - u * 0.06);
      void j;
    });
    const F0 = W0 + k * 2;

    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton([
      ...this.bodyBones,
      this.headBone,
      this.jawBone,
      ...this.whiskBones[0],
      ...this.whiskBones[1],
      ...this.finBones,
    ]);

    /* ---------------- materials ---------------- */
    const maps = makeScaleMaps();
    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.34,
      roughness: 0.62,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: maps.rough,
      bumpMap: maps.rough,
      bumpScale: 0.15,
      side: THREE.DoubleSide,
    });
    injectDragonShader(bodyMat, this.uniforms);
    this.bodyMat = bodyMat;
    const headMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.5,
      roughness: 0.5,
      roughnessMap: maps.rough,
      side: THREE.DoubleSide,
    });
    injectDragonShader(headMat, this.uniforms);

    /* ---------------- body ---------------- */
    const bodyMesh = new THREE.SkinnedMesh(this.buildBodyGeometry(q), bodyMat);
    bodyMesh.frustumCulled = false;
    this.group.add(bodyMesh);

    /* ---------------- dorsal spike crest (multi-faceted, irregular heights) ---- */
    const finParts: THREE.BufferGeometry[] = [];
    us.forEach((u, j) => {
      // irregular height variation ±18% between adjacent spikes
      const heightVar = 1.0 + (hash(j * 37 + 11) - 0.5) * 0.36;
      const blade = this.finBlade(j);
      blade.scale(1, heightVar, 1);
      const g = prep(blade, "#e8c877", u, F0 + j);
      spineColor(u, _c1);
      const colAttr = g.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < colAttr.count; i++) {
        colAttr.setXYZ(i, _c1.r * 0.6 + 0.5, _c1.g * 0.6 + 0.38, _c1.b * 0.5 + 0.12);
      }
      g.applyMatrix4(mat4(0, bodyRadius(u) * 0.82, -u * BODY_LEN));
      finParts.push(g);
    });
    const finGeo = mergeGeometries(finParts, false)!;
    const finMesh = new THREE.SkinnedMesh(finGeo, bodyMat);
    finMesh.frustumCulled = false;
    this.group.add(finMesh);

    /* ---------------- secondary spike rows (flank + skull cluster + tail serrations) ---- */
    const spikeParts: THREE.BufferGeometry[] = [];

    // (a) lateral flank spikes — two rows per side, smaller, angled outward
    const nFlank = Math.max(6, Math.floor(q.fins * 0.6));
    for (let j = 0; j < nFlank; j++) {
      const u = 0.06 + (j / (nFlank - 1)) * 0.68;
      const r = bodyRadius(u);
      for (const side of [-1, 1]) {
        const seed = j * 100 + (side > 0 ? 50 : 0) + 200;
        const heightVar = 1.0 + (hash(seed * 7 + 3) - 0.5) * 0.3;
        const spike = this.finBlade(seed);
        const flankH = (0.06 + 0.04 * (1 - u)) * heightVar;
        spike.scale(0.6, flankH / 0.16, 0.6); // smaller than dorsal
        // position at ±55° from dorsal (dorsal = +Y)
        const angle = side * 0.96; // ~55 degrees in radians
        const px = Math.sin(angle) * r * 0.76;
        const py = Math.cos(angle) * r * 0.76;
        const g = spike;
        if (g.index) g.toNonIndexed();
        setColorAttr(g, "#d4a84a");
        spineColor(u, _c1);
        const ca = g.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < ca.count; i++) {
          ca.setXYZ(i, _c1.r * 0.55 + 0.4, _c1.g * 0.55 + 0.3, _c1.b * 0.45 + 0.1);
        }
        setScalarAttr(g, "aU", u);
        // skin to nearest body bone pair
        const fb = u * (q.bones - 1);
        const b0 = Math.min(q.bones - 2, Math.floor(fb));
        const w1 = fb - b0;
        setSkin2(g, b0, b0 + 1, 1 - w1, w1);
        g.applyMatrix4(mat4(px, py, -u * BODY_LEN, 0, 0, side * 0.45));
        spikeParts.push(g);
      }
    }

    // (b) skull / neck cluster — dense short spikes at the back of the skull
    const nSkull = 10;
    for (let i = 0; i < nSkull; i++) {
      const angle = (i / (nSkull - 1) - 0.5) * 2.4; // spread across the crown
      const seed = i + 500;
      const spike = this.finBlade(seed);
      const h = 0.04 + hash(seed * 11 + 1) * 0.05;
      spike.scale(0.45, h / 0.16, 0.45);
      const g = spike;
      if (g.index) g.toNonIndexed();
      setColorAttr(g, "#e3b95f");
      setScalarAttr(g, "aU", 0.02);
      setSkin(g, HEAD);
      // position across the back crown of the skull
      const cx = Math.sin(angle) * 0.18;
      const cy = 0.12 + Math.cos(angle) * 0.08;
      const cz = -0.12 - Math.abs(Math.sin(angle)) * 0.06;
      g.applyMatrix4(mat4(cx, cy, cz, -0.3 + hash(seed * 3) * 0.2, 0, angle * 0.15));
      spikeParts.push(g);
    }

    // (c) tail serrations — fine small spikes along the last 15% of the tail
    const nSerr = Math.max(8, Math.floor(q.fins * 0.5));
    for (let j = 0; j < nSerr; j++) {
      const u = 0.86 + (j / (nSerr - 1)) * 0.12;
      const r = bodyRadius(u);
      const seed = j + 700;
      const spike = this.finBlade(seed);
      // progressively smaller toward the tip
      const taper = 1 - (j / (nSerr - 1)) * 0.6;
      const h = (0.025 + hash(seed * 13 + 5) * 0.02) * taper;
      spike.scale(0.35, h / 0.16, 0.35);
      const g = spike;
      if (g.index) g.toNonIndexed();
      setColorAttr(g, "#c9a040");
      spineColor(u, _c1);
      const ca2 = g.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < ca2.count; i++) {
        ca2.setXYZ(i, _c1.r * 0.5 + 0.3, _c1.g * 0.5 + 0.2, _c1.b * 0.4 + 0.1);
      }
      setScalarAttr(g, "aU", u);
      const fb = u * (q.bones - 1);
      const b0 = Math.min(q.bones - 2, Math.floor(fb));
      const w1 = fb - b0;
      setSkin2(g, b0, b0 + 1, 1 - w1, w1);
      g.applyMatrix4(mat4(0, r * 0.78, -u * BODY_LEN));
      spikeParts.push(g);
    }

    if (spikeParts.length > 0) {
      const spikeGeo = mergeGeometries(spikeParts, false)!;
      const spikeMesh = new THREE.SkinnedMesh(spikeGeo, bodyMat);
      spikeMesh.frustumCulled = false;
      this.group.add(spikeMesh);
    }

    /* ---------------- head ---------------- */
    const headMesh = new THREE.SkinnedMesh(this.buildHeadGeometry(HEAD), headMat);
    headMesh.frustumCulled = false;
    this.group.add(headMesh);
    const jawMesh = new THREE.SkinnedMesh(this.buildJawGeometry(JAW), headMat);
    jawMesh.frustumCulled = false;
    this.group.add(jawMesh);

    // eyes ride the head bone
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 12, 10),
        new THREE.MeshStandardMaterial({
          color: "#201005",
          emissive: "#ffab2e",
          emissiveIntensity: 2.6,
          roughness: 0.3,
          metalness: 0,
        })
      );
      eye.position.set(s * 0.14, 0.085, 0.3);
      this.headBone.add(eye);
      const es = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: "#ffc46a",
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      es.position.copy(eye.position);
      es.scale.setScalar(0.42);
      this.headBone.add(es);
    }

    /* ---------------- whiskers ---------------- */
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const s = sIdx === 0 ? -1 : 1;
      const geo = tubeAlong(whiskBind(s), 0.023, 0.006, 18, 6);
      setColorAttr(geo, "#e9cf8e");
      setScalarAttr(geo, "aU", 0.02);
      // skin across this whisker's bone span
      const posAttr = geo.attributes.position;
      const si = new Uint16Array(posAttr.count * 4);
      const sw = new Float32Array(posAttr.count * 4);
      const zMin = -0.2, zMax = 0.58;
      for (let i = 0; i < posAttr.count; i++) {
        const f = clamp((posAttr.getZ(i) - zMin) / (zMax - zMin), 0, 0.999);
        const b = Math.floor(f * k);
        const w = (f * k) % 1;
        si[i * 4] = W0 + sIdx * k + b;
        si[i * 4 + 1] = W0 + sIdx * k + Math.min(k - 1, b + 1);
        sw[i * 4] = 1 - w;
        sw[i * 4 + 1] = w;
      }
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
      const wm = new THREE.SkinnedMesh(geo, headMat);
      wm.frustumCulled = false;
      this.group.add(wm);
    }

    /* bind everything to the shared skeleton */
    this.group.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        (o as THREE.SkinnedMesh).bind(this.skeleton);
      }
    });

    /* ---------------- pearl ---------------- */
    this.pearlMat = pearlMaterial();
    this.pearl.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18), this.pearlMat));
    this.pearlGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: "#7fe8c0",
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.pearlGlow.scale.setScalar(1.7);
    this.pearl.add(this.pearlGlow);
    this.pearl.visible = false;
    this.group.add(this.pearl);
  }

  /* ---------------- skinned body tube (bind pose along -Z) ---------------- */
  private buildBodyGeometry(q: DragonQuality): THREE.BufferGeometry {
    const { rings, radial, bones } = q;
    const verts = (rings + 1) * (radial + 1);
    const pos = new Float32Array(verts * 3);
    const nrm = new Float32Array(verts * 3);
    const col = new Float32Array(verts * 3);
    const au = new Float32Array(verts);
    const uv = new Float32Array(verts * 2);
    const si = new Uint16Array(verts * 4);
    const sw = new Float32Array(verts * 4);
    const idx: number[] = [];
    let v = 0;
    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      const r = bodyRadius(u);
      spineColor(u, _c1);
      const dim = lerp(1, 0.62, sstep(0.55, 1, u)); // tail sinks into shadow
      // skin blend across the two nearest spine bones
      const fb = u * (bones - 1);
      const b0 = Math.min(bones - 2, Math.floor(fb));
      const w1 = fb - b0;
      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * TAU;
        const cx = Math.cos(th);
        const sy = Math.sin(th);
        // asymmetric elliptical cross-section:
        //  - ventral (belly, sy < 0) compressed to ~82% of radius
        //  - dorsal (back, sy > 0) full radius with slight keel bulge
        //  - dorsal fin root ridge/valley break near th ≈ π/2 (top)
        const ventralFactor = sy < 0 ? (0.82 + 0.18 * (1 - sy * sy)) : 1.0;
        const dorsalBulge = sy > 0.7 ? 1.0 + 0.035 * Math.pow((sy - 0.7) / 0.3, 2) : 1.0;
        // narrow ridge/valley at the dorsal fin root (top of the body)
        const topness = Math.max(0, sy - 0.85) / 0.15; // 0..1 near the crown
        const ridgeBreak = 1.0 - topness * 0.06 + topness * topness * 0.09; // dip then bump
        const rx = cx * r;
        const ry = sy * r * ventralFactor * dorsalBulge * ridgeBreak;
        pos[v * 3] = rx;
        pos[v * 3 + 1] = ry;
        pos[v * 3 + 2] = -u * BODY_LEN;
        // analytically-adjusted normals for the elliptical shape
        const invRx = 1.0; // x scale factor is 1 (unchanged)
        const invRy = 1.0 / (ventralFactor * dorsalBulge * ridgeBreak);
        const nnx = cx * invRx;
        const nny = sy * invRy;
        const nl = Math.hypot(nnx, nny);
        nrm[v * 3] = nnx / nl;
        nrm[v * 3 + 1] = nny / nl;
        nrm[v * 3 + 2] = 0;
        col[v * 3] = _c1.r * dim;
        col[v * 3 + 1] = _c1.g * dim;
        col[v * 3 + 2] = _c1.b * dim;
        au[v] = u;
        uv[v * 2] = u * 26;
        uv[v * 2 + 1] = (j / radial) * 6;
        si[v * 4] = b0;
        si[v * 4 + 1] = b0 + 1;
        sw[v * 4] = 1 - w1;
        sw[v * 4 + 1] = w1;
        if (i < rings && j < radial) {
          const a = i * (radial + 1) + j;
          const b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        v++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aU", new THREE.BufferAttribute(au, 1));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    return g;
  }

  /* ---------------- multi-faceted dorsal spike (replaces old flat-triangle blade) ---- */
  /**
   * Tapered, twisted, faceted spike with ridged asymmetric cross-section.
   * 6 radial sides × 5 height rings → 144 vertices (non-indexed, flat-shaded).
   * - Sharp front leading edge, wider lateral faces
   * - Backward rake (spikes lean toward the tail)
   * - Slight twist per ring for organic irregularity
   * - seed parameter drives per-spike twist direction / shape variation
   */
  private finBlade(seed: number = 0): THREE.BufferGeometry {
    const sides = 6;

    // Asymmetric cross-section profile: [angle, radius_multiplier]
    // Sharp front edge (angle 0 = +Z = toward head), wide sides, narrower trailing
    const profile: [number, number][] = [
      [0, 0.38],              // front center — sharp leading edge
      [Math.PI * 0.33, 1.0],  // front-right — widest
      [Math.PI * 0.72, 0.80], // mid-right
      [Math.PI, 0.45],        // trailing center — narrower
      [Math.PI * 1.28, 0.80], // mid-left
      [Math.PI * 1.67, 1.0],  // front-left — widest
    ];

    const baseRx = 0.042;  // lateral half-width at base
    const baseRz = 0.034;  // front-back half-depth at base

    // Height rings: positions, taper, backward rake, twist
    const heights = [0, 0.14, 0.40, 0.70, 1.0];
    const tapers  = [1.0, 0.80, 0.48, 0.20, 0.0];
    const rakes   = [0, -0.025, -0.09, -0.19, -0.30];
    const twists  = [0, 0.065, 0.15, 0.22, 0.28];

    const twistSign = hash(seed * 13 + 3) > 0.5 ? 1 : -1;

    // Build ring vertex positions
    const rings: number[][] = [];
    for (let h = 0; h < heights.length; h++) {
      const ring: number[] = [];
      if (tapers[h] === 0) {
        // tip converges to a single point
        ring.push(0, heights[h], rakes[h]);
      } else {
        for (let s = 0; s < sides; s++) {
          const [a, rm] = profile[s];
          const angle = a + twists[h] * twistSign;
          const t = tapers[h];
          const x = Math.sin(angle) * baseRx * rm * t;
          const z = Math.cos(angle) * baseRz * rm * t + rakes[h];
          ring.push(x, heights[h], z);
        }
      }
      rings.push(ring);
    }

    const pos: number[] = [];
    const uvs: number[] = [];

    // Build faces (non-indexed for faceted/flat shading per face)
    for (let h = 0; h < heights.length - 1; h++) {
      const lo = rings[h];
      const hi = rings[h + 1];
      const isTip = hi.length === 3;

      for (let s = 0; s < sides; s++) {
        const s0 = s * 3;
        const s1 = ((s + 1) % sides) * 3;
        if (isTip) {
          // triangle fan to tip
          pos.push(lo[s0], lo[s0 + 1], lo[s0 + 2]);
          pos.push(lo[s1], lo[s1 + 1], lo[s1 + 2]);
          pos.push(hi[0], hi[1], hi[2]);
          uvs.push(s / sides, heights[h], (s + 1) / sides, heights[h], (s + 0.5) / sides, 1.0);
        } else {
          // quad → 2 triangles
          pos.push(lo[s0], lo[s0 + 1], lo[s0 + 2]);
          pos.push(lo[s1], lo[s1 + 1], lo[s1 + 2]);
          pos.push(hi[s0], hi[s0 + 1], hi[s0 + 2]);
          uvs.push(s / sides, heights[h], (s + 1) / sides, heights[h], s / sides, heights[h + 1]);
          pos.push(lo[s1], lo[s1 + 1], lo[s1 + 2]);
          pos.push(hi[s1], hi[s1 + 1], hi[s1 + 2]);
          pos.push(hi[s0], hi[s0 + 1], hi[s0 + 2]);
          uvs.push((s + 1) / sides, heights[h], (s + 1) / sides, heights[h + 1], s / sides, heights[h + 1]);
        }
      }
    }

    // base cap
    for (let s = 0; s < sides; s++) {
      const s0 = s * 3;
      const s1 = ((s + 1) % sides) * 3;
      pos.push(0, 0, rakes[0]);
      pos.push(rings[0][s1], rings[0][s1 + 1], rings[0][s1 + 2]);
      pos.push(rings[0][s0], rings[0][s0 + 1], rings[0][s0 + 2]);
      uvs.push(0.5, 0, (s + 1) / sides, 0, s / sides, 0);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

  /* ----------- lofted skull: continuous surface from back-of-skull to nose -------- */
  /**
   * Builds the main skull + snout as a single lofted mesh (no visible seams).
   * 8 cross-section stations × 24 radial segments × 28 longitudinal rings.
   * Each station has asymmetric width (rx), dorsal height (ryTop), ventral
   * depth (ryBot), center Y offset, plus local brow/ridge modulations.
   */
  private buildSkullLoft(HEAD: number, radial: number, longRings: number): THREE.BufferGeometry {
    // Cross-section stations from back of skull (t=0) to nose tip (t=1)
    // Each station: [z, rx, ryTop, ryBot, centerY]
    const stations: [number, number, number, number, number][] = [
      [-0.22, 0.19, 0.21, 0.17, 0.025],  // back of skull
      [-0.10, 0.26, 0.23, 0.19, 0.02],   // mid skull
      [0.05,  0.29, 0.21, 0.21, 0.01],    // eye level / brow
      [0.18,  0.22, 0.17, 0.18, 0.0],     // skull-snout junction
      [0.32,  0.16, 0.13, 0.14, -0.01],   // upper snout
      [0.44,  0.13, 0.10, 0.12, -0.015],  // mid snout
      [0.55,  0.11, 0.085, 0.10, -0.01],  // lower snout
      [0.62,  0.085, 0.065, 0.085, -0.005], // nose tip
    ];

    const verts = (longRings + 1) * (radial + 1);
    const pos = new Float32Array(verts * 3);
    const nrm = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    let v = 0;

    for (let i = 0; i <= longRings; i++) {
      const t = i / longRings; // 0 = back, 1 = front

      // interpolate station parameters
      const stF = t * (stations.length - 1);
      const stI = Math.min(stations.length - 2, Math.floor(stF));
      const stW = stF - stI;
      const sm = (a: number, b: number) => a + (b - a) * stW; // lerp shorthand
      const z = sm(stations[stI][0], stations[stI + 1][0]);
      let rx = sm(stations[stI][1], stations[stI + 1][1]);
      let ryT = sm(stations[stI][2], stations[stI + 1][2]);
      let ryB = sm(stations[stI][3], stations[stI + 1][3]);
      const cy = sm(stations[stI][4], stations[stI + 1][4]);

      // brow ridge modulation: widen laterally near the eye station (t≈0.25–0.4)
      const browZone = Math.exp(-Math.pow((t - 0.3) * 6, 2));

      // snout bridge ridge: slight dorsal bump along the snout (t > 0.4)
      const bridgeT = sstep(0.35, 0.8, t);

      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * TAU;
        const cx = Math.cos(th);
        const sy = Math.sin(th);

        // brow ridge bumps at ±45° angles
        const browBump = browZone * 0.04 * Math.exp(-Math.pow((th - 0.8) * 2.2, 2))
                       + browZone * 0.04 * Math.exp(-Math.pow((th - (TAU - 0.8)) * 2.2, 2));

        // snout bridge (top, th ≈ π/2)
        const bridgeBump = bridgeT * 0.012 * Math.exp(-Math.pow((th - Math.PI / 2) * 3, 2));

        const localRx = rx + browBump;
        const ry = sy > 0 ? ryT + bridgeBump : ryB;

        const px = cx * localRx;
        const py = sy * ry + cy;

        pos[v * 3] = px;
        pos[v * 3 + 1] = py;
        pos[v * 3 + 2] = z;

        // approximate normals
        const invRx = 1 / Math.max(0.001, localRx);
        const invRy = 1 / Math.max(0.001, ry);
        const nnx = cx * invRx;
        const nny = sy * invRy;
        const nl = Math.hypot(nnx, nny) || 1;
        nrm[v * 3] = nnx / nl;
        nrm[v * 3 + 1] = nny / nl;
        nrm[v * 3 + 2] = 0;

        uv[v * 2] = t;
        uv[v * 2 + 1] = j / radial;

        if (i < longRings && j < radial) {
          const a = i * (radial + 1) + j;
          const b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        v++;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);

    // add per-vertex color and skin
    const col = new Float32Array(verts * 3);
    const gold = new THREE.Color("#e3b95f");
    const goldDeep = new THREE.Color("#c99b3f");
    for (let i = 0; i < verts; i++) {
      const pz = pos[i * 3 + 2];
      const f = clamp((pz + 0.22) / 0.84, 0, 1); // 0 = back, 1 = nose
      _c1.copy(gold).lerp(goldDeep, f * 0.6);
      col[i * 3] = _c1.r;
      col[i * 3 + 1] = _c1.g;
      col[i * 3 + 2] = _c1.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    setScalarAttr(g, "aU", 0.03);
    setSkin(g, HEAD);
    return g;
  }

  /* ------------- sculpted head: lofted skull + high-poly detail parts ------------- */
  private buildHeadGeometry(HEAD: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const goldDeep = "#c99b3f";
    const crimson = "#c9202c";
    const ivory = "#efe0bd";

    // continuous skull+snout loft (24 radial × 28 longitudinal = 725 verts indexed)
    const skullLoft = this.buildSkullLoft(HEAD, 24, 28);
    if (skullLoft.index) parts.push(skullLoft.toNonIndexed());
    else parts.push(skullLoft);

    // nose plate — higher segments (16×12, was 10×8)
    parts.push(prep(new THREE.SphereGeometry(0.085, 16, 12), goldDeep, 0.04, HEAD,
      mat4(0, 0.045, 0.6).multiply(new THREE.Matrix4().makeScale(1.25, 0.7, 0.85))));

    // nostrils — higher segments (14×10, was 8×6)
    for (const s of [-1, 1]) {
      parts.push(prep(new THREE.SphereGeometry(0.028, 14, 10), "#7a1016", 0.04, HEAD,
        mat4(s * 0.06, 0.022, 0.615)));
    }

    // brow ridges — replaced BoxGeometry with ellipsoid SphereGeometry for organic silhouette
    for (const s of [-1, 1]) {
      const browGeo = new THREE.SphereGeometry(0.08, 16, 12);
      parts.push(prep(browGeo, crimson, 0.03, HEAD,
        mat4(s * 0.15, 0.16, 0.16, -0.22, 0, s * 0.3).multiply(
          new THREE.Matrix4().makeScale(1.8, 0.75, 1.4)
        )));
    }

    // nose hornlet — higher segments (12, was 6)
    parts.push(prep(new THREE.ConeGeometry(0.032, 0.12, 12), ivory, 0.045, HEAD,
      mat4(0, 0.105, 0.5, -0.85, 0, 0)));

    // cheek fins — now use multi-faceted spike with seed variation
    for (const s of [-1, 1]) {
      const fin = this.finBlade(s > 0 ? 900 : 901);
      fin.scale(1, 0.22, 1);
      parts.push(prep(fin, crimson, 0.028, HEAD, mat4(s * 0.27, 0.0, 0.02, 0, 0, s * 1.35)));
    }

    // deer antlers — main beam + two tines per side (radial bumped 6→10)
    for (const s of [-1, 1]) {
      const beam = tubeAlong(
        [
          new THREE.Vector3(s * 0.12, 0.14, -0.02),
          new THREE.Vector3(s * 0.21, 0.38, -0.16),
          new THREE.Vector3(s * 0.3, 0.6, -0.4),
          new THREE.Vector3(s * 0.4, 0.8, -0.66),
        ],
        0.045, 0.012, 16, 10
      );
      parts.push(prep(beam, ivory, 0.03, HEAD));
      const tine1 = tubeAlong(
        [
          new THREE.Vector3(s * 0.19, 0.34, -0.13),
          new THREE.Vector3(s * 0.34, 0.52, -0.1),
          new THREE.Vector3(s * 0.47, 0.66, -0.16),
        ],
        0.027, 0.009, 10, 10
      );
      parts.push(prep(tine1, ivory, 0.03, HEAD));
      const tine2 = tubeAlong(
        [
          new THREE.Vector3(s * 0.28, 0.56, -0.36),
          new THREE.Vector3(s * 0.46, 0.74, -0.34),
          new THREE.Vector3(s * 0.58, 0.88, -0.42),
        ],
        0.024, 0.008, 10, 10
      );
      parts.push(prep(tine2, ivory, 0.03, HEAD));
    }

    // upper teeth — a visible row of carved points with two long fangs (10 segments, was 5)
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const f = i / 4;
        const big = i === 0 ? 1.9 : lerp(1, 0.6, f);
        parts.push(
          prep(
            new THREE.ConeGeometry(0.013 * big, 0.062 * big, 10),
            "#f5eedd",
            0.045,
            HEAD,
            mat4(s * (0.085 - f * 0.04), -0.075, 0.56 - f * 0.26, Math.PI, 0, 0)
          )
        );
      }
    }
    const geo = mergeGeometries(parts, false)!;
    geo.computeBoundingSphere();
    return geo;
  }

  private buildJawGeometry(JAW: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const lip = new THREE.BoxGeometry(0.15, 0.06, 0.4, 2, 2, 4);
    parts.push(prep(lip, "#b4892f", 0.04, JAW, mat4(0, -0.155, 0.36, 0.06, 0, 0)));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const f = i / 3;
        parts.push(
          prep(
            new THREE.ConeGeometry(0.011, 0.05, 10),
            "#f5eedd",
            0.045,
            JAW,
            mat4(s * (0.08 - f * 0.035), -0.115, 0.52 - f * 0.24)
          )
        );
      }
    }
    // chin spike beard
    parts.push(prep(new THREE.ConeGeometry(0.04, 0.18, 12), "#efe0bd", 0.045, JAW, mat4(0, -0.22, 0.4, 2.7, 0, 0)));
    return mergeGeometries(parts, false)!;
  }

  /* ================================================================== */
  /* per-frame rig posing — bones follow the scroll-choreographed path  */
  /* ================================================================== */

  update(o: DragonUpdate) {
    const { progress: p, time, dt, xScale } = o;
    const q = this.quality;
    const NB = q.bones;
    const m = morphT(p);
    const wake = sstep(0.28, 0.85, m);
    const reduced = q.reduced;

    /* scroll-velocity-reactive swim energy */
    const vel = Math.abs(p - this.prevP) / Math.max(dt, 1 / 240);
    this.prevP = p;
    this.swimVel = damp(this.swimVel, clamp(vel * 0.05, 0, 0.9), 4, dt);

    /* --- spine control path (ring == the coiled dragon at rest) --- */
    ringPoints(SPINE_N, reduced ? 0 : time, this.ringPts);
    snakePoints(p, this.snakePts);
    for (let i = 0; i < SPINE_N; i++) {
      this.ctrl[i].lerpVectors(this.ringPts[i], this.snakePts[i], m);
      this.ctrl[i].x *= xScale;
    }

    /* --- traveling-wave parameters (true sinusoidal locomotion) --- */
    /* Reference: real eel/snake locomotion uses ~1.0–1.5 full waves along the body.
       2.6 was too many, creating a jittery "wobble" rather than a smooth serpentine glide.
       1.8 is a good mythical-dragon compromise. Amplitude tapers head→tail (biomechanically
       correct: the head leads, the body follows with increasing displacement). */
    const baseAmp = reduced ? 0.012 : 0.075;
    const waveAmp = wake * (baseAmp + this.swimVel * 0.09) + (1 - wake) * (reduced ? 0 : 0.004);
    const waves = 1.8;
    const speed = reduced ? 0.25 : 1.7 + this.swimVel * 1.4;
    const flame = flameEnv(p);

    /* --- pose the body bones along the path --- */
    let upPrev = _v5.set(0, 1, 0);
    const zA = _v1;
    const yA = _v2;
    const xA = _v3;
    const pos = _v4;
    let tanPrevX = 0, tanPrevY = 0, tanPrevZ = -1;
    for (let k = 0; k < NB; k++) {
      const u = k / (NB - 1);
      this.curve.getPoint(u, pos);
      this.curve.getTangent(u, zA).normalize();

      // sideways + vertical traveling wave, phase offset per segment
      // amplitude tapers from near-zero at the head to full at the tail
      if (waveAmp > 0.0005) {
        const ampTaper = 0.15 + 0.85 * u; // head ≈ 15%, tail ≈ 100%
        xA.crossVectors(zA, UP);
        if (xA.lengthSq() < 1e-5) xA.set(1, 0, 0);
        xA.normalize();
        const ph = u * waves * TAU;
        pos.addScaledVector(xA, Math.sin(ph - time * speed) * waveAmp * ampTaper);
        pos.y += Math.sin(ph * 0.72 - time * speed * 0.82 + 1.7) * waveAmp * 0.62 * ampTaper;
      }

      // parallel-transported up frame
      yA.copy(upPrev).addScaledVector(zA, -upPrev.dot(zA));
      if (yA.lengthSq() < 1e-6) yA.copy(UP);
      yA.normalize();
      zA.negate(); // bone local +Z points toward the head
      xA.crossVectors(yA, zA).normalize();
      _m1.makeBasis(xA, yA, zA);
      _q1.setFromRotationMatrix(_m1);
      zA.negate(); // restore walk tangent for bend metrics

      // body compression on tight coils: girth swells, length shortens slightly
      const dtx = zA.x - tanPrevX, dty = zA.y - tanPrevY, dtz = zA.z - tanPrevZ;
      const bend = Math.sqrt(dtx * dtx + dty * dty + dtz * dtz);
      const bulge = clamp(bend * 0.9, 0, 0.09) * (1 - 0.5 * u);
      // rest-only girth reduction: ring reads as a slim band, thickens as wake grows
      const restGirth = lerp(0.60, 1.0, wake);
      const b = this.bodyBones[k];
      b.position.copy(pos);
      b.quaternion.copy(_q1);
      b.scale.set((1 + bulge) * restGirth, (1 + bulge) * restGirth, 1 - bulge * 0.55);
      upPrev = _v5.copy(yA);
      tanPrevX = zA.x; tanPrevY = zA.y; tanPrevZ = zA.z;
    }

    /* --- head --- */
    const headGrow = sstep(0.3, 0.82, m);
    this.curve.getPoint(0, pos);
    this.curve.getTangent(0, zA).negate().normalize(); // facing dir
    _q1.setFromUnitVectors(Z_FWD, zA);
    // predatory bob + rear-up during the flame beat
    _e1.set(
      (reduced ? 0 : Math.sin(time * 0.85) * 0.05) * wake - flame * 0.12,
      0,
      (reduced ? 0 : Math.sin(time * 0.6 + 1) * 0.04) * wake
    );
    _q2.setFromEuler(_e1);
    _q1.multiply(_q2);
    const headScale = Math.max(0.012, headGrow);
    this.headBone.position.copy(pos).addScaledVector(zA, -0.04 * headGrow);
    this.headBone.quaternion.copy(_q1);
    this.headBone.scale.setScalar(headScale);
    this.headPosL.copy(this.headBone.position);
    this.headQuatL.copy(_q1);
    this.headPos.copy(this.headBone.position);

    /* --- jaw --- */
    const jawOpen = 0.05 + flame * 0.62 + (reduced ? 0 : Math.sin(time * 1.6) * 0.03) * wake;
    _v1.set(0, -0.1, 0.14).applyQuaternion(_q1).add(this.headBone.position);
    this.jawBone.position.copy(_v1);
    _q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), jawOpen);
    this.jawBone.quaternion.copy(_q1).multiply(_q2);
    this.jawBone.scale.setScalar(Math.max(0.012, headGrow));

    /* --- whiskers: verlet-style trailing springs behind the jaw --- */
    this.updateWhiskers(time, dt, headGrow, reduced);

    /* --- dorsal fins follow the spine, growing with wakefulness --- */
    const finWake = sstep(0.16, 0.6, m);
    for (let j = 0; j < this.finBones.length; j++) {
      const u = 0.035 + (j / (this.finBones.length - 1)) * 0.84;
      this.curve.getPoint(u, pos);
      this.curve.getTangent(u, zA).normalize();
      yA.copy(UP).addScaledVector(zA, -UP.dot(zA));
      if (yA.lengthSq() < 1e-5) yA.set(0, 1, 0);
      yA.normalize();
      zA.negate();
      xA.crossVectors(yA, zA).normalize();
      _m1.makeBasis(xA, yA, zA);
      _q1.setFromRotationMatrix(_m1);
      const fb = this.finBones[j];
      // offset along the bone-frame up axis onto the body surface
      fb.position.copy(pos).addScaledVector(yA, bodyRadius(u) * 0.82);
      fb.quaternion.copy(_q1);
      const s = Math.max(0.001, this.finProfile[j] * finWake);
      fb.scale.set(1, s, 1);
    }

    /* --- pearl: born from the inscription fire, then guides the dragon --- */
    const pearlLive = sstep(0.055, 0.14, p);
    this.pearl.visible = pearlLive > 0.002;
    if (this.pearl.visible) {
      _v1.copy(this.headBone.position).addScaledVector(this.mouthDir, 1.3 + Math.sin(time * 1.3) * 0.14);
      _v1.y += Math.sin(time * 0.9) * 0.08;
      const dive = smoother(pearlDiveT(p));
      if (dive > 0) {
        _v2.copy(WORMHOLE_POS);
        _v2.z -= 8 * dive;
        const spiral = dive * TAU * 1.5;
        _v2.x += Math.cos(spiral) * 0.35 * (1 - dive);
        _v2.y += Math.sin(spiral) * 0.35 * (1 - dive);
        _v1.lerpVectors(_v1, _v2, dive);
      }
      this.pearl.position.copy(_v1);
      const van = 1 - sstep(0.975, 0.992, p);
      this.pearl.scale.setScalar(Math.max(0.001, pearlLive * van * (1 + Math.sin(time * 2.4) * 0.05)));
      this.pearlMat.uniforms.uTime.value = time;
    }

    /* --- mouth anchor for the flame breath --- */
    _v1.set(0, -0.07, 0.64).applyQuaternion(_q1);
    this.mouthDir.copy(zA);
    this.mouthPos.copy(this.headBone.position).add(_v1.multiplyScalar(Math.max(0.3, headGrow)));

    /* --- shared shader uniforms --- */
    const U = this.uniforms;
    U.uWake.value = wake;
    U.uRuneGlow.value = runeGlowEnv(p);
    U.uTime.value = reduced ? time * 0.15 : time;
    U.uVanish.value = vanishT(p);
    // forged-smooth band at rest; full scale relief once the creature wakes
    // raised resting floor so etched-metal detail is visible even before animation
    const ns = 0.35 + wake * 0.7;
    this.bodyMat.normalScale.set(ns, ns);
    this.bodyMat.bumpScale = 0.08 + wake * 0.1;

    /* gentle whole-body drift */
    if (!reduced) {
      this.group.position.x = Math.sin(time * 0.33) * 0.05;
      this.group.position.y = Math.sin(time * 0.52) * 0.06;
    }
    this.group.updateMatrixWorld(true);
  }

  /* trailing whisker physics — each joint chases the last with its own lag */
  private updateWhiskers(time: number, dt: number, headGrow: number, reduced: boolean) {
    const hq = this.headQuatL;
    const hp = this.headPosL;
    const boneScale = Math.max(0.001, headGrow);
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const s = sIdx === 0 ? -1 : 1;
      const sim = this.whiskSim[sIdx];
      const bones = this.whiskBones[sIdx];
      // anchor rides the jaw edge
      _v1.set(s * 0.1, -0.05, 0.58).applyQuaternion(hq).add(hp);
      sim.pos[0].copy(_v1);
      const sway = reduced ? 0 : 1;
      for (let i = 1; i < sim.pos.length; i++) {
        // desired direction sweeps outward, downward and BACK along the body
        _v2
          .set(
            s * (0.45 + Math.sin(time * 1.4 + i * 1.7 + s) * 0.06 * sway),
            -0.32 - i * 0.12 + Math.sin(time * 1.05 + i * 2.3) * 0.05 * sway,
            -0.3 - i * 0.22 + Math.cos(time * 0.9 + i) * 0.08 * sway
          )
          .applyQuaternion(hq)
          .normalize();
        _v3.copy(sim.pos[i - 1]).addScaledVector(_v2, this.whiskLen[Math.min(i, 2)]);
        const lag = i === 1 ? 26 : i === 2 ? 8.5 : 4.6; // tip lags hardest — mass
        sim.pos[i].x = damp(sim.pos[i].x, _v3.x, lag, dt);
        sim.pos[i].y = damp(sim.pos[i].y, _v3.y, lag, dt);
        sim.pos[i].z = damp(sim.pos[i].z, _v3.z, lag, dt);
        bones[i - 1].position.lerpVectors(sim.pos[i - 1], sim.pos[i], 0.35);
      }
      bones[bones.length - 1].position.copy(sim.pos[sim.pos.length - 1]);
      // orient each bone toward the following joint, honouring the head's rest scale
      for (let i = 0; i < bones.length; i++) {
        const from = bones[i].position;
        const to = i < bones.length - 1 ? bones[i + 1].position : sim.pos[sim.pos.length - 1];
        _v1.subVectors(to, from);
        if (_v1.lengthSq() > 1e-8) {
          _v1.normalize();
          _q2.setFromUnitVectors(Z_FWD, _v1);
          bones[i].quaternion.copy(_q2);
        }
        bones[i].scale.setScalar(boneScale);
      }
    }
  }
}
