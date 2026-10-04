import * as THREE from "three";
import { glowTexture } from "./dragon";
import { WORMHOLE_POS } from "./pose";
import { hash } from "./utils";

/**
 * Warped-space tunnel: procedural swirl cylinder with chromatic rings,
 * two counter-rotating mouth rings, a volumetric mouth cone, an inward
 * particle-streak field and layered core glows.
 */
export class Wormhole {
  group = new THREE.Group();
  private tunnelMat: THREE.ShaderMaterial;
  private ringMatA: THREE.ShaderMaterial;
  private ringMatB: THREE.ShaderMaterial;
  private coneMat: THREE.ShaderMaterial;
  private streakMat: THREE.ShaderMaterial;
  private coreGlow: THREE.Sprite;
  private mouthGlow: THREE.Sprite;

  constructor(streakCount = 380, pixelRatio = 2) {
    this.group.position.copy(WORMHOLE_POS);

    const shared = {
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uOpacity: { value: 0 },
    };

    /* ---- tunnel ---- */
    this.tunnelMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: THREE.UniformsUtils.clone(shared),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uSpin; uniform float uOpacity;
        varying vec2 vUv;
        float rings(float ang, float y, float t) {
          return sin(y * 46.0 + ang * 3.0 - t);
        }
        void main() {
          // Increase twist based on spin (progress), making the space look more warped as dragon approaches
          float twist = vUv.y * (15.0 + uSpin * 10.0);
          float t = uTime * (0.55 + uSpin * 2.4);
          float ang = vUv.x * 6.2831 + twist + sin(vUv.y * 10.0 - uTime * 1.2) * 0.8;
          // chromatic ring samples
          float r0 = rings(ang, vUv.y, t * 3.0);
          float rR = rings(ang + 0.06, vUv.y, t * 3.0);
          float rB = rings(ang - 0.06, vUv.y, t * 3.0);
          float band = sin(vUv.y * 12.0 - uTime * 0.9 + ang * 0.5) * 0.5 + 0.5;
          vec3 lacquer = vec3(0.12, 0.01, 0.05); // deeper shadow
          vec3 crimson = vec3(0.85, 0.15, 0.20); // brighter crimson
          vec3 gold = vec3(1.0, 0.8, 0.4);       // more intense gold
          vec3 jade = vec3(0.2, 0.8, 0.6);       // more vibrant jade
          vec3 deepSpace = vec3(0.02, 0.0, 0.1); // contextual deep space color near the throat
          vec3 col = mix(lacquer, crimson, smoothstep(-0.4, 0.9, r0));
          col = mix(col, gold, smoothstep(0.55, 1.0, r0) * 0.85);
          col.r += (rR - r0) * 0.25;
          col.b += (rB - r0) * 0.25;
          col += jade * pow(band, 6.0) * 0.5;
          // blend towards deep space at the throat
          float throat = smoothstep(0.4, 0.0, vUv.y);
          col = mix(col, deepSpace, throat * 0.8);
          // light intensifies toward the deep throat but pulses more
          float depth = smoothstep(1.0, 0.15, vUv.y);
          col *= 0.35 + depth * (1.35 + sin(uTime * 3.0 + vUv.y * 10.0) * 0.2);
          float a = uOpacity * (0.5 + 0.5 * smoothstep(-1.0, 1.0, r0));
          a *= smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    const tunnelGeo = new THREE.CylinderGeometry(3.2, 2.0, 17, 56, 30, true);
    tunnelGeo.rotateX(Math.PI / 2); // axis -> z (wide aperture near the camera, throat narrowing away)
    const tunnel = new THREE.Mesh(tunnelGeo, this.tunnelMat);
    tunnel.position.z = -8.4;
    this.group.add(tunnel);

    /* ---- counter-rotating mouth rings ---- */
    const ringShader = (hue: number) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { ...THREE.UniformsUtils.clone(shared), uHue: { value: hue } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uSpin; uniform float uOpacity; uniform float uHue;
          varying vec2 vUv;
          void main(){
            float streak = sin(vUv.x * 6.2831 * 9.0 - uTime * (1.6 + uSpin * 4.0) * (uHue > 0.5 ? -1.0 : 1.0));
            vec3 gold = vec3(1.0, 0.74, 0.3);
            vec3 jade = vec3(0.3, 0.9, 0.65);
            vec3 col = mix(gold, jade, uHue);
            float s = smoothstep(-0.2, 1.0, streak);
            float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
            gl_FragColor = vec4(col * s * edge * uOpacity, s * edge * uOpacity * 0.9);
          }`,
      });
    this.ringMatA = ringShader(0.0);
    this.ringMatB = ringShader(1.0);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.14, 10, 90), this.ringMatA);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.95, 0.09, 10, 90), this.ringMatB);
    this.group.add(ringA, ringB);
    ringA.userData.speed = 0.25;
    ringB.userData.speed = -0.18;
    this.ringA = ringA;
    this.ringB = ringB;

    /* ---- volumetric mouth cone ---- */
    this.coneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.clone(shared),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity;
        varying vec2 vUv;
        void main(){
          float rays = sin(vUv.x * 6.2831 * 14.0 + uTime * 0.7) * 0.5 + 0.5;
          float grad = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          vec3 col = mix(vec3(0.7, 0.1, 0.1), vec3(1.0, 0.75, 0.35), rays);
          gl_FragColor = vec4(col * grad * uOpacity * 0.16, grad * uOpacity * 0.14);
        }`,
    });
    const coneGeo = new THREE.CylinderGeometry(2.5, 0.7, 8.5, 40, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, this.coneMat);
    cone.position.z = 3.4;
    this.group.add(cone);

    /* ---- inward particle streaks ---- */
    const seeds = new Float32Array(streakCount * 4);
    const zero = new Float32Array(streakCount * 3);
    for (let i = 0; i < streakCount; i++) {
      seeds[i * 4] = hash(i * 4 + 11);
      seeds[i * 4 + 1] = hash(i * 4 + 12);
      seeds[i * 4 + 2] = 0.5 + hash(i * 4 + 13);
      seeds[i * 4 + 3] = hash(i * 4 + 14);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(zero, 3));
    sg.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    this.streakMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...THREE.UniformsUtils.clone(shared), uPR: { value: pixelRatio } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime; uniform float uSpin; uniform float uOpacity; uniform float uPR;
        varying float vA; varying float vT;
        void main() {
          float sp = (0.14 + aSeed.z * 0.2) * (0.35 + uSpin * 1.5);
          float t = fract(aSeed.w + uTime * sp);
          vT = t;
          float radius = mix(3.6, 0.12, pow(t, 1.35));
          float ang = aSeed.x * 6.2831 + t * 7.0 + uTime * 0.25;
          float z = mix(4.5, -16.5, t);
          vec3 p = vec3(cos(ang) * radius, sin(ang) * radius, z);
          vA = smoothstep(0.02, 0.18, t) * (1.0 - smoothstep(0.72, 1.0, t)) * uOpacity;
          vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = mix(1.0, 4.5 * aSeed.y, t) * uPR * (10.0 / max(1.0, -mv.z));
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vT;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float soft = smoothstep(0.5, 0.08, d);
          vec3 col = mix(vec3(1.0, 0.78, 0.4), vec3(1.0, 0.96, 0.85), vT);
          gl_FragColor = vec4(col * soft * vA, soft * vA);
        }`,
    });
    const streaks = new THREE.Points(sg, this.streakMat);
    streaks.frustumCulled = false;
    this.group.add(streaks);

    /* ---- glows ---- */
    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: "#ffb45e",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.coreGlow.scale.setScalar(7);
    this.group.add(this.coreGlow);
    this.mouthGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: "#ffd9a0",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.mouthGlow.scale.setScalar(3);
    this.group.add(this.mouthGlow);
  }

  private ringA: THREE.Mesh;
  private ringB: THREE.Mesh;

  update(time: number, t: number, reduced: boolean) {
    const spin = reduced ? t * 0.25 : t;
    const vis = Math.min(1, t * 1.4);
    for (const m of [this.tunnelMat, this.ringMatA, this.ringMatB, this.coneMat, this.streakMat]) {
      m.uniforms.uTime.value = time;
      if (m.uniforms.uSpin) m.uniforms.uSpin.value = spin;
      m.uniforms.uOpacity.value = vis;
    }
    (this.coreGlow.material as THREE.SpriteMaterial).opacity = vis * (0.5 + 0.18 * Math.sin(time * 1.7));
    (this.mouthGlow.material as THREE.SpriteMaterial).opacity = vis * 0.6;
    this.coreGlow.scale.setScalar(6.4 + Math.sin(time * 1.2) * 0.5 + t * 1.6);
    if (!reduced) {
      // Exponentially increase rotation speed as the dragon gets closer (t increases)
      const speedMult = 0.5 + spin + Math.pow(t, 2.0) * 4.0;
      this.ringA.rotation.z = time * 0.25 * speedMult;
      this.ringB.rotation.z = time * -0.18 * speedMult;
    }
    this.group.visible = t > 0.001;
  }
}
