import * as THREE from "three";
import { clamp, damp } from "./utils";
import { sampleCamera, wormholeT, diveShrink, flameEnv, WORMHOLE_POS } from "./pose";
import { Dragon } from "./dragon";
import { FlameBreath } from "./flame";
import { Wormhole } from "./wormhole";
import { Dust, Smoke, makeBackground } from "./environment";
import { ImagePanels } from "./environment";
import { TUNNEL_Z } from "./wormhole-anchor";

export interface ExperienceOptions {
  canvas: HTMLCanvasElement;
  mobile: boolean;
  reduced: boolean;
  onLoadProgress?: (v: number) => void;
  onReady?: () => void;
}

/* ---------------- procedural studio environment for PBR reflections ---------------- */
function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(30, 16, 12);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    p.fromBufferAttribute(geo.attributes.position, i).normalize();
    const t = clamp(p.y * 0.5 + 0.5, 0, 1);
    c.setRGB(0.02, 0.008, 0.01).lerp(new THREE.Color(0.10, 0.03, 0.045), Math.pow(1 - t, 2.2));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const panel = (hex: string, mul: number, w: number, h: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(mul), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // warm key card, crimson fill, jade accent
  panel("#ffd9a0", 3.4, 14, 8, 7, 8, 5);
  panel("#ff3226", 1.9, 12, 7, -9, -3, 4);
  panel("#3df0a8", 0.8, 9, 6, -2, 5, -10);
  panel("#f2d38a", 1.2, 10, 4, 3, -8, -2);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.06).texture;
    pmrem.dispose();
    return tex;
  } catch {
    return null;
  }
}

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private dragon: Dragon;
  private flame: FlameBreath;
  private wormhole: Wormhole;
  private dust: Dust;
  private smoke: Smoke;
  private panels: ImagePanels | null = null;
  private bg: THREE.Mesh;
  private flameLight: THREE.PointLight;
  private wormLight: THREE.PointLight;

  private targetP = 0;
  /** damped scroll progress driving every system — kept in perfect sync with the DOM overlay */
  smoothP = -0.0001;
  private camPos = new THREE.Vector3(0, 0, 8.6);
  private camLook = new THREE.Vector3();
  private tPos = new THREE.Vector3();
  private tLook = new THREE.Vector3();
  private mouth = new THREE.Vector3();
  private mdir = new THREE.Vector3(0, 0, 1);
  private mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  private mobile: boolean;
  private reduced: boolean;
  private xScale = 1;
  private zOffset = 0;
  disposed = false;

  constructor(opts: ExperienceOptions) {
    this.mobile = opts.mobile;
    this.reduced = opts.reduced;
    const pr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 2);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: !opts.mobile,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(pr);
    this.renderer.setClearColor(new THREE.Color("#0a0405"), 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_u, l, t) => opts.onLoadProgress?.(t === 0 ? 1 : l / t);
    manager.onLoad = () => opts.onReady?.();

    this.camera = new THREE.PerspectiveCamera(opts.mobile ? 52 : 42, 1, 0.1, 120);
    this.camera.position.set(0, 0, 8.6);

    /* real environment lighting for the forged-metal + scale PBR materials */
    const envTex = makeEnvironment(this.renderer);
    if (envTex) {
      this.scene.environment = envTex;
      (this.scene as unknown as { environmentIntensity?: number }).environmentIntensity = 0.55;
    }
    this.scene.fog = new THREE.Fog(new THREE.Color("#0a0405"), 10, 26);

    const key = new THREE.DirectionalLight("#ffe0b8", 1.5);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const crimson = new THREE.PointLight("#c9202c", 2.4, 24, 1.6);
    crimson.position.set(-5, -1.5, 2.5);
    this.scene.add(crimson);
    const jade = new THREE.PointLight("#2fa37e", 1.6, 26, 1.6);
    jade.position.set(0, 4, -7);
    this.scene.add(jade);

    this.flameLight = new THREE.PointLight("#ff7a26", 0, 16, 1.8);
    this.scene.add(this.flameLight);
    this.wormLight = new THREE.PointLight("#ffcf8a", 0, 24, 1.6);
    this.wormLight.position.copy(WORMHOLE_POS);
    this.scene.add(this.wormLight);

    this.bg = makeBackground();
    this.scene.add(this.bg);

    this.dragon = new Dragon({
      rings: opts.mobile ? 100 : 180,
      radial: opts.mobile ? 10 : 16,
      bones: opts.mobile ? 26 : 44,
      fins: opts.mobile ? 14 : 24,
      whiskerBones: 3,
      reduced: opts.reduced,
    });
    this.scene.add(this.dragon.group);

    this.flame = new FlameBreath(opts.mobile ? 180 : 340, pr);
    this.scene.add(this.flame.group);

    this.wormhole = new Wormhole(opts.mobile ? 200 : 380, pr);
    this.wormhole.group.scale.setScalar(opts.mobile ? 1.22 : 1);
    this.scene.add(this.wormhole.group);

    this.dust = new Dust(opts.mobile ? 200 : 420, pr);
    this.scene.add(this.dust.points);

    this.smoke = new Smoke(9);
    this.smoke.addTo(this.scene);

    if (!opts.mobile) {
      this.panels = new ImagePanels(manager);
      this.scene.add(this.panels.group);
    } else {
      manager.onLoad = () => opts.onReady?.();
      setTimeout(() => opts.onReady?.(), 600);
    }

    if (!opts.mobile) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    }
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  private onPointerMove = (e: PointerEvent) => {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.xScale = clamp(aspect / 1.45, this.mobile ? 0.5 : 0.6, 1);
    this.zOffset = this.mobile ? 2.4 : aspect < 1.1 ? 1.4 : 0;
  };

  setProgress(p: number) {
    this.targetP = p;
  }

  update(dt: number, time: number) {
    if (this.disposed) return;
    dt = Math.min(dt, 0.05);
    this.smoothP = this.smoothP < 0 ? this.targetP : damp(this.smoothP, this.targetP, 6.5, dt);
    const p = this.smoothP;

    /* camera */
    sampleCamera(p, this.tPos, this.tLook, this.zOffset);
    if (!this.mobile && !this.reduced) {
      this.mouse.sx = damp(this.mouse.sx, this.mouse.x, 4, dt);
      this.mouse.sy = damp(this.mouse.sy, this.mouse.y, 4, dt);
      this.tPos.x += this.mouse.sx * 0.22;
      this.tPos.y += this.mouse.sy * -0.16;
      this.tLook.x += this.mouse.sx * 0.3;
    }
    const flame = this.reduced ? 0 : flameEnv(p);
    if (flame > 0.01) {
      const s = flame * 0.045;
      this.tPos.x += Math.sin(time * 37.1) * s;
      this.tPos.y += Math.cos(time * 43.7) * s;
    }
    this.camPos.x = damp(this.camPos.x, this.tPos.x, 5.5, dt);
    this.camPos.y = damp(this.camPos.y, this.tPos.y, 5.5, dt);
    this.camPos.z = damp(this.camPos.z, this.tPos.z, 5.5, dt);
    this.camLook.x = damp(this.camLook.x, this.tLook.x, 5.5, dt);
    this.camLook.y = damp(this.camLook.y, this.tLook.y, 5.5, dt);
    this.camLook.z = damp(this.camLook.z, this.tLook.z, 5.5, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    /* dragon — shrink pivoting on the wormhole mouth while diving */
    const shrink = diveShrink(p);
    this.dragon.group.scale.setScalar(shrink);
    this.dragon.group.position.z = TUNNEL_Z * (1 - shrink);
    this.dragon.update({ progress: p, time, dt, xScale: this.xScale });

    /* flame breath + ignition light that sweeps across the scales */
    this.mouth.copy(this.dragon.mouthPos);
    this.dragon.group.localToWorld(this.mouth);
    this.mdir.copy(this.dragon.mouthDir).transformDirection(this.dragon.group.matrixWorld);
    this.flame.update(time, flame, this.mouth, this.mdir);
    this.flameLight.intensity = flame * 26;
    this.flameLight.position.copy(this.mouth).addScaledVector(this.mdir, 0.9);

    /* wormhole + its glow spilling into the scene */
    const wt = wormholeT(p);
    this.wormhole.update(time, wt, this.reduced);
    this.wormLight.intensity = wt * 20 * (this.mobile ? 1.2 : 1);

    /* ambient */
    this.dust.update(this.reduced ? time * 0.2 : time);
    this.smoke.update(time, this.reduced);
    (this.bg.material as THREE.ShaderMaterial).uniforms.uTime.value = time;

    /* image panels */
    this.panels?.update(p, time, this.xScale, this.camera.position, this.reduced);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.dispose();
  }
}
