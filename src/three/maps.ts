import * as THREE from "three";
import { hash } from "./utils";

/* ------------------------------------------------------------------ */
/* layered dragon-scale height map -> normal map                       */
/* ------------------------------------------------------------------ */

function heightToNormal(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const s = src.width;
  const sctx = src.getContext("2d")!;
  const sd = sctx.getImageData(0, 0, s, s).data;
  const out = document.createElement("canvas");
  out.width = out.height = s;
  const octx = out.getContext("2d")!;
  const od = octx.createImageData(s, s);
  const h = (x: number, y: number) => sd[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * s + x) * 4;
      od.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      od.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      od.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      od.data[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

export interface ScaleMaps {
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
}

let _scales: ScaleMaps | null = null;

export function makeScaleMaps(): ScaleMaps {
  if (_scales) return _scales;
  const S = 256;

  /* height: overlapping scalloped scale rows */
  const hc = document.createElement("canvas");
  hc.width = hc.height = S;
  const ctx = hc.getContext("2d")!;
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, 0, S, S);
  const cell = 32;
  for (let row = -1; row < S / cell + 1; row++) {
    const off = row % 2 === 0 ? 0 : cell / 2;
    for (let col = -1; col < S / cell + 1; col++) {
      const cx = col * cell + off + cell / 2;
      const cy = row * cell;
      const wob = (hash(row * 91 + col * 57) - 0.5) * 8;
      // scale dome
      const g = ctx.createRadialGradient(cx, cy + cell * 0.1, 2, cx, cy + cell * 0.1, cell * 0.62);
      g.addColorStop(0, "rgba(235,235,235,0.95)");
      g.addColorStop(0.55, "rgba(150,150,150,0.55)");
      g.addColorStop(1, "rgba(20,20,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx + wob * 0.3, cy + wob, cell * 0.52, cell * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      // dark lip at the lower rim — light catches it from above
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx + wob * 0.3, cy + wob, cell * 0.52, cell * 0.66, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  const normalCanvas = heightToNormal(hc, 2.4);

  /* roughness: patina blotches + directional micro-scratches */
  const rc = document.createElement("canvas");
  rc.width = rc.height = S;
  const rctx = rc.getContext("2d")!;
  rctx.fillStyle = "#8a8a8a";
  rctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = hash(i * 3) * S;
    const y = hash(i * 5) * S;
    const r = 8 + hash(i * 7) * 42;
    const g = rctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash(i * 11) > 0.5;
    g.addColorStop(0, dark ? "rgba(40,40,40,0.20)" : "rgba(210,210,210,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    rctx.fillStyle = g;
    rctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  rctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 13) * S;
    const y = hash(i * 17) * S;
    const a = hash(i * 19) * Math.PI * 0.3 + Math.PI * 0.2;
    const l = 4 + hash(i * 23) * 22;
    const light = hash(i * 29) > 0.4;
    rctx.strokeStyle = light ? "rgba(235,235,235,0.20)" : "rgba(30,30,30,0.20)";
    rctx.beginPath();
    rctx.moveTo(x, y);
    rctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    rctx.stroke();
  }

  const normal = new THREE.CanvasTexture(normalCanvas);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  _scales = { normal, rough };
  return _scales;
}

/* ------------------------------------------------------------------ */
/* glowing inscription mask (two strips, drawn once)                   */
/* ------------------------------------------------------------------ */

let _rune: THREE.CanvasTexture | null = null;

/**
 * Angular seal-script-like glyphs on black — used purely as an emissive
 * mask, so the inscription is invisible until ignited.
 */
export function makeRuneTexture(): THREE.CanvasTexture {
  if (_rune) return _rune;
  const W = 1024;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const drawGlyph = (cx: number, cy: number, size: number, seed: number) => {
    const r = (n: number) => hash(seed * 31 + n);
    const strokes = 4 + Math.floor(r(1) * 4);
    ctx.beginPath();
    for (let s = 0; s < strokes; s++) {
      const x1 = cx + (r(s * 4 + 2) - 0.5) * size;
      const y1 = cy + (r(s * 4 + 3) - 0.5) * size * 1.5;
      // strokes snap to near-vertical / horizontal / diagonal like carved script
      const dir = Math.floor(r(s * 4 + 4) * 4);
      const len = size * (0.35 + r(s * 4 + 5) * 0.5);
      let x2 = x1;
      let y2 = y1;
      if (dir === 0) y2 += len;
      else if (dir === 1) x2 += len * 0.7;
      else if (dir === 2) {
        x2 += len * 0.55;
        y2 += len * 0.55;
      } else {
        x2 -= len * 0.4;
        y2 += len * 0.6;
      }
      ctx.moveTo(Math.max(-size, x1), y1);
      ctx.lineTo(x2, y2);
    }
    // occasional hook / dot
    if (r(9) > 0.5) {
      ctx.moveTo(cx + size * 0.32, cy - size * 0.4);
      ctx.lineTo(cx + size * 0.32, cy + size * 0.5);
    }
    if (r(10) > 0.6) {
      ctx.moveTo(cx - size * 0.3, cy);
      ctx.lineTo(cx + size * 0.28, cy);
    }
    ctx.stroke();
  };

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 7;

  for (const strip of [0.27, 0.73]) {
    const count = 26;
    for (let i = 0; i < count; i++) {
      drawGlyph(((i + 0.5) / count) * W, strip * H, 26, i * 7 + strip * 100);
    }
  }
  _rune = new THREE.CanvasTexture(c);
  _rune.wrapS = THREE.RepeatWrapping;
  _rune.wrapT = THREE.ClampToEdgeWrapping;
  _rune.anisotropy = 4;
  return _rune;
}
