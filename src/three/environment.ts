import * as THREE from "three";
import { glowTexture } from "./dragon";
import { SECTIONS } from "../lib/config";
import { hash, sstep } from "./utils";

/* ------------------------------------------------------------------ */
/* background gradient dome                                            */
/* ------------------------------------------------------------------ */

export function makeBackground(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 top = vec3(0.012, 0.006, 0.008);
        vec3 mid = vec3(0.045, 0.012, 0.016);
        vec3 low = vec3(0.09, 0.02, 0.03);
        vec3 col = mix(low, mid, smoothstep(-0.6, 0.15, d.y));
        col = mix(col, top, smoothstep(0.15, 0.9, d.y));
        // distant crimson aura behind the stage
        float aura = pow(max(dot(d, normalize(vec3(0.0, -0.12, -1.0))), 0.0), 5.0);
        col += vec3(0.22, 0.03, 0.04) * aura * (0.8 + 0.2 * sin(uTime * 0.4));
        // faint warm spill toward the floor
        float floorGlow = pow(max(dot(d, normalize(vec3(0.0, -1.0, 0.0))), 0.0), 4.0);
        col += vec3(0.06, 0.010, 0.012) * floorGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 20), mat);
  mesh.renderOrder = -10;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* ambient dust                                                        */
/* ------------------------------------------------------------------ */

export class Dust {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(count = 420, pixelRatio = 2) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (hash(i * 3) - 0.5) * 20;
      pos[i * 3 + 1] = (hash(i * 3 + 1) - 0.5) * 11;
      pos[i * 3 + 2] = -11 + hash(i * 3 + 2) * 16;
      seed[i * 3] = hash(i * 7 + 1);
      seed[i * 3 + 1] = hash(i * 7 + 2);
      seed[i * 3 + 2] = hash(i * 7 + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPR: { value: pixelRatio } },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime; uniform float uPR;
        varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.12 + aSeed.x * 6.28) * 0.7;
          p.y += sin(uTime * 0.09 + aSeed.y * 6.28) * 0.9 + mod(uTime * 0.1 * (0.2 + aSeed.z), 6.0) - 3.0;
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = 0.14 + 0.3 * aSeed.y;
          gl_PointSize = (1.2 + aSeed.x * 2.6) * uPR * (8.0 / max(1.0, -mv.z));
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float soft = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vec3(0.9, 0.72, 0.45) * soft * vA, soft * vA);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}

/* ------------------------------------------------------------------ */
/* incense smoke — large soft drifting sprites                         */
/* ------------------------------------------------------------------ */

export class Smoke {
  sprites: THREE.Sprite[] = [];
  constructor(count = 9) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: i % 2 === 0 ? "#2b0a0e" : "#1c241f",
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        })
      );
      const sc = 7 + hash(i * 2) * 8;
      s.scale.set(sc, sc * 0.66, 1);
      s.position.set((hash(i * 5) - 0.5) * 16, (hash(i * 9) - 0.5) * 8 - 0.5, -3 - hash(i * 13) * 8);
      s.userData = { phase: hash(i * 17) * 10, speed: 0.1 + hash(i * 21) * 0.12 };
      this.sprites.push(s);
    }
  }
  addTo(scene: THREE.Scene) {
    this.sprites.forEach((s) => scene.add(s));
  }
  update(t: number, reduced: boolean) {
    if (reduced) return;
    for (const s of this.sprites) {
      const u = s.userData;
      s.position.x += Math.sin(t * u.speed + u.phase) * 0.0015;
      s.position.y += Math.cos(t * u.speed * 0.7 + u.phase) * 0.001;
    }
  }
}

/* ------------------------------------------------------------------ */
/* floating image panels                                               */
/* ------------------------------------------------------------------ */

const PANEL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

const PANEL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasTex;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uImgAspect;
  uniform vec2 uSize;
  varying vec2 vUv;

  float roundedBox(vec2 p, vec2 b, float r){
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main(){
    float pa = uSize.x / uSize.y;
    vec2 rs = pa > uImgAspect ? vec2(1.0, uImgAspect / pa) : vec2(pa / uImgAspect, 1.0);
    vec2 tuv = (vUv - 0.5) * rs + 0.5;
    vec3 img = texture2D(uMap, tuv).rgb;
    img = mix(vec3(0.1, 0.03, 0.04), img, uHasTex);
    // gentle spotlight
    float lum = 0.82 + 0.18 * smoothstep(1.1, 0.2, length(vUv - 0.5) * 1.6);
    img *= lum;

    vec2 p = (vUv - 0.5) * uSize;
    float d = roundedBox(p, uSize * 0.5, 0.14);
    float alpha = smoothstep(0.006, -0.012, d);
    float bw = 0.035;
    float frame = smoothstep(0.0, -0.008, d) - smoothstep(-bw, -bw - 0.012, d);
    float shimmer = 0.5 + 0.5 * sin(vUv.x * 5.0 + vUv.y * 3.0 + uTime * 0.5);
    vec3 gold = mix(vec3(0.45, 0.33, 0.14), vec3(0.98, 0.82, 0.48), shimmer);
    vec3 col = mix(img, gold, clamp(frame, 0.0, 1.0));
    // inner vignette for gallery depth
    col *= 1.0 - smoothstep(0.45, 1.0, length(vUv - 0.5) * 1.5) * 0.25;
    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

interface Panel {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  section: string;
  baseX: number;
  baseY: number;
  phase: number;
}

export class ImagePanels {
  group = new THREE.Group();
  private panels: Panel[] = [];
  constructor(manager: THREE.LoadingManager) {
    const loader = new THREE.TextureLoader(manager);
    let idx = 0;
    SECTIONS.forEach((sec) => {
      sec.images.forEach((im) => {
        idx++;
        const h = im.w * 0.68;
        const geo = new THREE.PlaneGeometry(im.w, h);
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uMap: { value: null },
            uHasTex: { value: 0 },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
            uImgAspect: { value: 1 },
            uSize: { value: new THREE.Vector2(im.w, h) },
          },
          vertexShader: PANEL_VERT,
          fragmentShader: PANEL_FRAG,
        });
        // blank placeholder texture so the shader compiles with a bound unit
        const blank = new THREE.DataTexture(new Uint8Array([20, 6, 8, 255]), 1, 1);
        blank.needsUpdate = true;
        mat.uniforms.uMap.value = blank;
        loader.load(im.src, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          mat.uniforms.uMap.value = tex;
          if (tex.image) mat.uniforms.uImgAspect.value = tex.image.width / tex.image.height;
          mat.uniforms.uHasTex.value = 1;
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(im.x, im.y, im.z);
        this.group.add(mesh);
        this.panels.push({
          mesh,
          mat,
          section: sec.id,
          baseX: im.x,
          baseY: im.y,
          phase: hash(idx * 31) * 10,
        });
      });
    });
  }

  update(progress: number, time: number, xScale: number, camPos: THREE.Vector3, reduced: boolean) {
    SECTIONS.forEach((sec) => {
      const [a, b] = sec.range;
      const vis = sstep(a - 0.02, a + 0.035, progress) * (1 - sstep(b - 0.03, b + 0.025, progress));
      for (const p of this.panels) {
        if (p.section !== sec.id) continue;
        p.mat.uniforms.uOpacity.value = vis * 0.96;
        p.mat.uniforms.uTime.value = reduced ? 0 : time;
        const drift = reduced ? 0 : Math.sin(time * 0.55 + p.phase) * 0.055;
        const par = (progress - (a + b) / 2) * 1.5;
        p.mesh.position.set(
          p.baseX * xScale - Math.sign(p.baseX) * par * 0.35,
          p.baseY + drift,
          p.mesh.position.z
        );
        p.mesh.scale.setScalar(0.94 + vis * 0.06);
        p.mesh.visible = vis > 0.005;
        // subtle billboard toward camera
        p.mesh.lookAt(camPos.x * 0.35, p.mesh.position.y, camPos.z);
      }
    });
  }
}
