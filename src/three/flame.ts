import * as THREE from "three";
import { glowTexture } from "./dragon";
import { hash } from "./utils";

/**
 * GPU-looped fire breath. All motion is computed in the vertex shader,
 * so a burst costs one draw call and zero CPU per frame.
 */
export class FlameBreath {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  private glow: THREE.Sprite;
  group = new THREE.Group();

  constructor(count = 340, pixelRatio = 2) {
    const seeds = new Float32Array(count * 4);
    const zero = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = hash(i * 4 + 0);     // cone angle
      seeds[i * 4 + 1] = hash(i * 4 + 1); // cone radius
      seeds[i * 4 + 2] = 0.55 + hash(i * 4 + 2) * 0.9; // speed
      seeds[i * 4 + 3] = 0.5 + hash(i * 4 + 3) * 1.0;  // size
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(zero, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBurst: { value: 0 },
        uOrigin: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(0, 0, 1) },
        uLen: { value: 3.4 },
        uSpread: { value: 0.3 },
        uPR: { value: pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uBurst;
        uniform vec3 uOrigin;
        uniform vec3 uDir;
        uniform float uLen;
        uniform float uSpread;
        uniform float uPR;
        varying float vT;
        varying float vA;
        void main() {
          float t = fract(aSeed.w * 7.13 + uTime * aSeed.z * 1.15);
          vT = t;
          vec3 dir = normalize(uDir);
          vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
          vec3 up2 = normalize(cross(side, dir));
          float ang = aSeed.x * 6.2831;
          float coneR = aSeed.y * uSpread * (0.25 + t);
          vec3 d = normalize(dir + (cos(ang) * side + sin(ang) * up2) * coneR);
          float dist = t * uLen * (0.7 + 0.5 * aSeed.z);
          vec3 p = uOrigin + d * dist;
          p.y += t * t * 0.6; // heat rises
          p += vec3(sin(t * 11.0 + aSeed.x * 40.0), cos(t * 9.0 + aSeed.y * 31.0), sin(t * 13.0 + aSeed.z * 24.0)) * 0.1 * t;
          vA = smoothstep(0.02, 0.14, t) * (1.0 - smoothstep(0.42, 1.0, t)) * uBurst;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(60.0, 7.0, t) * aSeed.w * uPR;
          gl_PointSize = size / max(0.6, -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vT;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float soft = smoothstep(0.5, 0.06, d);
          vec3 deep = vec3(0.62, 0.06, 0.05);
          vec3 mid = vec3(1.0, 0.38, 0.10);
          vec3 hot = vec3(1.0, 0.82, 0.45);
          vec3 col = mix(hot, mid, smoothstep(0.0, 0.45, vT));
          col = mix(col, deep, smoothstep(0.45, 1.0, vT));
          col += vec3(1.0, 0.95, 0.8) * smoothstep(0.3, 0.0, d) * (1.0 - vT) * 0.9;
          gl_FragColor = vec4(col * soft * vA, soft * vA);
        }
      `,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: "#ff8c3a",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.group.add(this.glow);
  }

  update(time: number, burst: number, mouth: THREE.Vector3, dir: THREE.Vector3) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uBurst.value = burst;
    u.uOrigin.value.copy(mouth);
    u.uDir.value.copy(dir).normalize();
    this.glow.position.copy(mouth).addScaledVector(dir, 0.55);
    this.glow.scale.setScalar(0.2 + burst * 3.4);
    (this.glow.material as THREE.SpriteMaterial).opacity = burst * 0.55;
  }
}
