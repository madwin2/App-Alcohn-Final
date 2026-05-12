/**
 * Estética alineada con `generador mockup ejemplo/nuevo/mockup_generator (1).py`:
 * máscara tipo Pillow, quemado con glow/bisel en madera, bajorrelieve en cuero,
 * perspectiva, DOF, viñeta y color grading cálido.
 */

const OUTPUT_WIDTH = 1400;
const OUTPUT_HEIGHT = 1000;
/** Baseline 0.55 + 15%: el sello ocupa más superficie en madera y cuero. */
const LOGO_SCALE = 0.55 * 1.15;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** TypedArray con buffer propio (evita conflicto `ArrayBuffer` vs `ArrayBufferLike` en TS 5.9+). */
type Float32AB = Float32Array<ArrayBuffer>;

/** Copia a un `ArrayBuffer` propio (evita genéricos `ArrayBufferLike` al encadenar blur). */
function float32OwnCopy(src: Float32Array): Float32AB {
  const buf = new ArrayBuffer(src.byteLength);
  const out = new Float32Array(buf) as Float32AB;
  out.set(src);
  return out;
}

const BURN_COLORS = {
  tint: [108, 72, 35] as const,
  deep_tint: [60, 32, 12] as const,
  edge_tint: [145, 108, 58] as const,
  glow: [210, 170, 110] as const,
};

/** Igual que `prepare_logo` en el script Python (tope 85% alto). */
export function computeLogoDrawDimensionsPython(nw: number, nh: number): { drawW: number; drawH: number } {
  const targetW = Math.round(OUTPUT_WIDTH * LOGO_SCALE);
  const ratio = nw / Math.max(1, nh);
  let newW = targetW;
  let newH = Math.round(newW / ratio);
  const maxH = Math.round(OUTPUT_HEIGHT * 0.85);
  if (newH > maxH) {
    newH = maxH;
    newW = Math.round(newH * ratio);
  }
  return { drawW: Math.max(1, newW), drawH: Math.max(1, newH) };
}

/** `create_mask` del generador Python (invert L × alpha + umbral suave). */
export function createMaskPythonStyle(logoImage: HTMLImageElement, drawW: number, drawH: number): Float32Array {
  const c = document.createElement('canvas');
  c.width = drawW;
  c.height = drawH;
  const sctx = c.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('No se pudo rasterizar el logo');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(logoImage, 0, 0, drawW, drawH);
  const d = sctx.getImageData(0, 0, drawW, drawH).data;
  const mask = new Float32Array(drawW * drawH);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const inv = (255 - L) * (a / 255);
    const stretched = clamp((inv - 60) * (255 / 140), 0, 255);
    mask[p] = stretched / 255;
  }
  return float32OwnCopy(mask);
}

function boxBlurFloat2DInPlace(src: Float32Array, w: number, h: number, r: number, tmp: Float32Array): void {
  if (r <= 0) return;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = clamp(x + dx, 0, w - 1);
        sum += src[y * w + xx];
        cnt += 1;
      }
      tmp[y * w + x] = sum / cnt;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        sum += tmp[yy * w + x];
        cnt += 1;
      }
      src[y * w + x] = sum / cnt;
    }
  }
}

/** Aproximación gaussiana: varias pasadas de caja. */
function gaussianLikeBlurFloat(src: Float32Array, w: number, h: number, sigma: number): Float32AB {
  const out = new Float32Array(new ArrayBuffer(src.byteLength)) as Float32AB;
  out.set(src);
  const tmp = new Float32Array(w * h);
  const passes = sigma <= 0.6 ? 1 : sigma <= 1.2 ? 2 : sigma <= 2.2 ? 3 : sigma <= 3.5 ? 4 : 5;
  const r = Math.max(1, Math.round(sigma * 0.85));
  for (let p = 0; p < passes; p++) {
    boxBlurFloat2DInPlace(out, w, h, r, tmp);
  }
  const buf = new ArrayBuffer(out.byteLength);
  const ret = new Float32Array(buf) as Float32AB;
  ret.set(out);
  return ret;
}

function maxFilterFloat(src: Float32Array, w: number, h: number, k: number): Float32AB {
  const r = Math.floor(k / 2);
  const out = new Float32Array(new ArrayBuffer(w * h * 4)) as Float32AB;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = clamp(x + dx, 0, w - 1);
          const yy = clamp(y + dy, 0, h - 1);
          const v = src[yy * w + xx];
          if (v > m) m = v;
        }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeedFromMask(mask: Float32Array, material: string): number {
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(mask.length / 8000));
  for (let i = 0; i < mask.length; i += step) {
    const v = mask[i] * 65535;
    h ^= v >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < material.length; i += 1) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function bilinearSampleRgb(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  u: number,
  v: number,
  fill: [number, number, number],
): [number, number, number] {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return fill;
  if (u < 0 || v < 0 || u > w - 1 || v > h - 1) return fill;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = u - x0;
  const ty = v - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const r =
    lerp(lerp(data[i00], data[i10], tx), lerp(data[i01], data[i11], tx), ty);
  const g =
    lerp(lerp(data[i00 + 1], data[i10 + 1], tx), lerp(data[i01 + 1], data[i11 + 1], tx), ty);
  const b =
    lerp(lerp(data[i00 + 2], data[i10 + 2], tx), lerp(data[i01 + 2], data[i11 + 2], tx), ty);
  return [r, g, b];
}

function solveLinearSystem8x8(A0: number[][], b0: number[]): number[] {
  const n = 8;
  const A = A0.map((row, i) => [...row, b0[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) {
      return [1, 0, 0, 0, 1, 0, 0, 0];
    }
    if (pivot !== col) {
      const tmp = A[col];
      A[col] = A[pivot];
      A[pivot] = tmp;
    }
    const div = A[col][col];
    for (let j = col; j <= n; j++) A[col][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (Math.abs(f) < 1e-12) continue;
      for (let j = col; j <= n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return A.map((row) => row[n]);
}

/** Mismos 8 coeficientes que `_perspective_coeffs` + `Image.PERSPECTIVE` en Pillow. */
function pillowPerspectiveCoeffs(dst: [number, number][], src: [number, number][]): number[] {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = dst[i];
    const t = src[i];
    A.push([t[0], t[1], 1, 0, 0, 0, -s[0] * t[0], -s[0] * t[1]]);
    B.push(s[0]);
    A.push([0, 0, 0, t[0], t[1], 1, -s[1] * t[0], -s[1] * t[1]]);
    B.push(s[1]);
  }
  return solveLinearSystem8x8(A, B);
}

function applyPerspectiveToImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number,
): Uint8ClampedArray {
  const ox = Math.round(w * strength);
  const oy = Math.round(h * strength * 0.5);
  const dst: [number, number][] = [
    [ox, oy],
    [w - Math.round(ox * 0.3), 0],
    [w - Math.round(ox * 0.1), h - Math.round(oy * 0.3)],
    [Math.round(ox * 0.5), h - oy],
  ];
  const src: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const coeffs = pillowPerspectiveCoeffs(dst, src);
  const [a, b, c, d, e, f, g, hh] = coeffs;
  const fillX = clamp(10, 0, w - 1);
  const fillY = clamp(Math.floor(h / 2), 0, h - 1);
  const fillIdx = (fillY * w + fillX) * 4;
  const fill: [number, number, number] = [data[fillIdx], data[fillIdx + 1], data[fillIdx + 2]];
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = g * x + hh * y + 1;
      const oi = (y * w + x) * 4;
      if (Math.abs(den) < 1e-9) {
        out[oi] = fill[0];
        out[oi + 1] = fill[1];
        out[oi + 2] = fill[2];
        out[oi + 3] = 255;
        continue;
      }
      const u = (a * x + b * y + c) / den;
      const v = (d * x + e * y + f) / den;
      const [r, g0, b0] = bilinearSampleRgb(data, w, h, u, v, fill);
      out[oi] = r;
      out[oi + 1] = g0;
      out[oi + 2] = b0;
      out[oi + 3] = 255;
    }
  }
  return out;
}

function boxBlurRgbInPlace(data: Uint8ClampedArray, w: number, h: number, r: number, tmp: Float32Array): void {
  const ch = 3;
  const acc = new Float32Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = clamp(x + dx, 0, w - 1);
        const i = (y * w + xx) * 4;
        sr += data[i];
        sg += data[i + 1];
        sb += data[i + 2];
        cnt += 1;
      }
      const o = (y * w + x) * ch;
      acc[o] = sr / cnt;
      acc[o + 1] = sg / cnt;
      acc[o + 2] = sb / cnt;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        const o = (yy * w + x) * ch;
        sr += acc[o];
        sg += acc[o + 1];
        sb += acc[o + 2];
        cnt += 1;
      }
      const i = (y * w + x) * 4;
      tmp[i] = sr / cnt;
      tmp[i + 1] = sg / cnt;
      tmp[i + 2] = sb / cnt;
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = tmp[i];
    data[i + 1] = tmp[i + 1];
    data[i + 2] = tmp[i + 2];
  }
}

function gaussianBlurRgb(data: Uint8ClampedArray, w: number, h: number, sigma: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const tmp = new Float32Array(w * h * 4);
  const r = Math.max(1, Math.round(sigma * 0.9));
  for (let pass = 0; pass < 3; pass++) {
    boxBlurRgbInPlace(out, w, h, r, tmp);
  }
  return out;
}

function applyDepthOfField(data: Uint8ClampedArray, w: number, h: number, blurStrength: number): void {
  const blurred = gaussianBlurRgb(data, w, h, blurStrength);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / (w * 0.65);
      const dy = (y - cy) / (h * 0.65);
      let dist = Math.sqrt(dx * dx + dy * dy);
      dist = clamp(dist, 0, 1);
      const blurMap = dist ** 2.5;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const orig = data[i + c];
        const bl = blurred[i + c];
        data[i + c] = clamp(orig * (1 - blurMap) + bl * blurMap, 0, 255);
      }
    }
  }
}

function applyVignette(data: Uint8ClampedArray, w: number, h: number, strength: number): void {
  const hw = w / 2;
  const hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - hw) / (w * 0.55);
      const dy = (y - hh) / (h * 0.55);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vignette = 1 - clamp(dist ** 2 * strength, 0, strength);
      const i = (y * w + x) * 4;
      data[i] = clamp(data[i] * vignette, 0, 255);
      data[i + 1] = clamp(data[i + 1] * vignette, 0, 255);
      data[i + 2] = clamp(data[i + 2] * vignette, 0, 255);
    }
  }
}

function applyColorGrade(data: Uint8ClampedArray, warmth: number): void {
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * warmth;
    let g = data[i + 1] * (warmth * 0.98);
    let b = data[i + 2] * 0.93;
    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const nl = clamp((lum - 128) * 1.06 + 128, 0, 255);
    const a = 0.55;
    r = clamp(r * (1 - a) + nl * a, 0, 255);
    g = clamp(g * (1 - a) + nl * a, 0, 255);
    b = clamp(b * (1 - a) + nl * a, 0, 255);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/**
 * Unsharp final (cuero y madera): compensa emboss/DOF y el JPEG sin halos duros.
 */
export function applyMockupFinalSharpening(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts?: { amount?: number; blurSigma?: number },
): void {
  const amount = opts?.amount ?? 0.36;
  const blurSigma = opts?.blurSigma ?? 0.72;
  const blur = gaussianBlurRgb(data, width, height, blurSigma);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] + amount * (data[i] - blur[i]), 0, 255);
    data[i + 1] = clamp(data[i + 1] + amount * (data[i + 1] - blur[i + 1]), 0, 255);
    data[i + 2] = clamp(data[i + 2] + amount * (data[i + 2] - blur[i + 2]), 0, 255);
  }
}

export function applyGlobalPostEffectsLikePython(
  imageData: ImageData,
  opts?: { perspectiveStrength?: number; dofBlur?: number; vignetteStrength?: number; warmth?: number },
): void {
  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;
  const strength = opts?.perspectiveStrength ?? 0.035;
  const warped = applyPerspectiveToImageData(d, w, h, strength);
  imageData.data.set(warped);
  applyDepthOfField(imageData.data, w, h, opts?.dofBlur ?? 1.22);
  applyVignette(imageData.data, w, h, opts?.vignetteStrength ?? 0.25);
  applyColorGrade(imageData.data, opts?.warmth ?? 1.06);
}

function sampleBurnTex(
  burnFull: Uint8ClampedArray,
  left: number,
  top: number,
  mx: number,
  my: number,
  W: number,
  H: number,
): [number, number, number] {
  const x = left + mx;
  const y = top + my;
  if (x < 0 || y < 0 || x >= W || y >= H) return [40, 28, 18];
  const i = (y * W + x) * 4;
  return [burnFull[i], burnFull[i + 1], burnFull[i + 2]];
}

/**
 * Quemado estilo Python: glow cálido, multiply con textura quemada aclarada,
 * bisel interior y ruido determinístico.
 */
export function applyMaderaBurnPythonLike(
  baseData: Uint8ClampedArray,
  burnFullRgb: Uint8ClampedArray,
  mask: Float32Array,
  drawW: number,
  drawH: number,
  left: number,
  top: number,
  materialKey: string,
): void {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const rng = mulberry32(hashSeedFromMask(mask, materialKey));

  let mainNp = float32OwnCopy(mask);
  for (let p = 0; p < mainNp.length; p++) {
    const v = mainNp[p];
    if (v > 0.05 && v < 0.95) {
      mainNp[p] = clamp(v + (rng() - 0.5) * 0.16, 0, 1);
    }
  }
  mainNp = gaussianLikeBlurFloat(mainNp, drawW, drawH, 0.7);

  let edgeNp = maxFilterFloat(mask, drawW, drawH, 5);
  edgeNp = gaussianLikeBlurFloat(edgeNp, drawW, drawH, 3.5);
  const edgeOnly = new Float32Array(drawW * drawH);
  for (let p = 0; p < edgeOnly.length; p++) {
    edgeOnly[p] = clamp(edgeNp[p] - mainNp[p] * 0.75, 0, 1);
  }

  let glowNp = maxFilterFloat(mask, drawW, drawH, 11);
  glowNp = gaussianLikeBlurFloat(glowNp, drawW, drawH, 16);
  const glowNoise = new Float32Array(drawW * drawH);
  for (let p = 0; p < glowNoise.length; p++) {
    glowNoise[p] = clamp(1 + (rng() - 0.5) * 0.7, 0, 2);
  }
  const glowNoiseBlur = gaussianLikeBlurFloat(glowNoise, drawW, drawH, 18);
  for (let p = 0; p < glowNp.length; p++) {
    glowNp[p] *= glowNoiseBlur[p];
  }
  const glowOnly = new Float32Array(drawW * drawH);
  for (let p = 0; p < glowOnly.length; p++) {
    glowOnly[p] = clamp(glowNp[p] - mainNp[p] * 0.8 - edgeOnly[p] * 0.35, 0, 1);
  }

  const colors = BURN_COLORS;
  const glowColor = colors.glow;

  const bevelOff = 3;
  const shiftDownRight = (src: Float32Array, ox: number, oy: number): Float32Array => {
    const out = new Float32Array(drawW * drawH);
    for (let y = 0; y < drawH; y++) {
      for (let x = 0; x < drawW; x++) {
        const sx = x - ox;
        const sy = y - oy;
        out[y * drawW + x] = sx >= 0 && sy >= 0 && sx < drawW && sy < drawH ? src[sy * drawW + sx] : 0;
      }
    }
    return out;
  };

  const sMask = shiftDownRight(mainNp, bevelOff, bevelOff);
  const innerS = new Float32Array(drawW * drawH);
  for (let p = 0; p < innerS.length; p++) {
    innerS[p] = clamp(sMask[p] - mainNp[p] * 0.4, 0, 1) * mainNp[p];
  }
  const innerSblur = gaussianLikeBlurFloat(innerS, drawW, drawH, 1.8);

  const hMask = shiftDownRight(mainNp, -bevelOff, -bevelOff);
  const innerH = new Float32Array(drawW * drawH);
  for (let p = 0; p < innerH.length; p++) {
    innerH[p] = clamp(hMask[p] - mainNp[p] * 0.4, 0, 1) * mainNp[p];
  }
  const innerHblur = gaussianLikeBlurFloat(innerH, drawW, drawH, 1.5);

  const outerDilated = maxFilterFloat(mask, drawW, drawH, 3);
  const outline = new Float32Array(drawW * drawH);
  for (let p = 0; p < outline.length; p++) {
    outline[p] = clamp(outerDilated[p] - mainNp[p], 0, 1);
  }
  const outlineBlur = gaussianLikeBlurFloat(outline, drawW, drawH, 0.8);

  for (let my = 0; my < drawH; my++) {
    for (let mx = 0; mx < drawW; mx++) {
      const p = my * drawW + mx;
      const ink = mainNp[p];
      if (ink < 0.002 && glowOnly[p] < 0.01 && edgeOnly[p] < 0.01) continue;

      const x = left + mx;
      const y = top + my;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const idx = (y * W + x) * 4;

      let br = baseData[idx];
      let bg = baseData[idx + 1];
      let bb = baseData[idx + 2];

      const woodLum = (br + bg + bb) / (3 * 255);
      const glowStrength = 0.28;
      const gOnly = glowOnly[p];
      for (let c = 0; c < 3; c++) {
        const gc = glowColor[c];
        const glowBlend = (br * 0.33 + bg * 0.33 + bb * 0.34) * (gc / 255);
        const ch = c === 0 ? br : c === 1 ? bg : bb;
        const mixed = ch * (1 - gOnly * glowStrength) + glowBlend * (gOnly * glowStrength);
        if (c === 0) br = mixed;
        else if (c === 1) bg = mixed;
        else bb = mixed;
      }

      const [bur, bug, bub] = sampleBurnTex(burnFullRgb, left, top, mx, my, W, H);
      const depthFactor = clamp(ink * 1.3, 0, 1);
      const lightenBase = 2.4;
      const lightenDeep = 1.6;
      const lightenMap = lightenBase - (lightenBase - lightenDeep) * depthFactor;
      const burnLitR = clamp(bur * lightenMap, 0, 255);
      const burnLitG = clamp(bug * lightenMap, 0, 255);
      const burnLitB = clamp(bub * lightenMap, 0, 255);

      const burnR = (br * burnLitR) / 255;
      const burnG = (bg * burnLitG) / 255;
      const burnB = (bb * burnLitB) / 255;
      br = br * (1 - ink) + burnR * ink;
      bg = bg * (1 - ink) + burnG * ink;
      bb = bb * (1 - ink) + burnB * ink;

      const edgeT = colors.edge_tint;
      const eo = edgeOnly[p];
      const edgeBurnR = (br * edgeT[0]) / 255;
      const edgeBurnG = (bg * edgeT[1]) / 255;
      const edgeBurnB = (bb * edgeT[2]) / 255;
      br = br * (1 - eo * 0.35) + edgeBurnR * (eo * 0.35);
      bg = bg * (1 - eo * 0.35) + edgeBurnG * (eo * 0.35);
      bb = bb * (1 - eo * 0.35) + edgeBurnB * (eo * 0.35);

      const is = innerSblur[p];
      const ih = innerHblur[p];
      const ol = outlineBlur[p];
      br *= 1 - is * 0.38;
      bg *= 1 - is * 0.38;
      bb *= 1 - is * 0.38;
      br += (255 - br) * ih * 0.22;
      bg += (255 - bg) * ih * 0.22;
      bb += (255 - bb) * ih * 0.22;
      br *= 1 - ol * 0.28;
      bg *= 1 - ol * 0.28;
      bb *= 1 - ol * 0.28;

      const n = (rng() - 0.5) * 5;
      br = clamp(br + n * ink, 0, 255);
      bg = clamp(bg + n * ink, 0, 255);
      bb = clamp(bb + n * ink, 0, 255);

      const gm = 0.85 + woodLum * 0.3;
      br = clamp(br * (1 - ink * 0.12 + ink * 0.12 * gm), 0, 255);
      bg = clamp(bg * (1 - ink * 0.12 + ink * 0.12 * gm), 0, 255);
      bb = clamp(bb * (1 - ink * 0.12 + ink * 0.12 * gm), 0, 255);

      baseData[idx] = br;
      baseData[idx + 1] = bg;
      baseData[idx + 2] = bb;
    }
  }
}

/** Fallback quemado sin textura (tintes tipo Python). */
export function applyMaderaBurnFallbackTint(
  baseData: Uint8ClampedArray,
  mask: Float32Array,
  drawW: number,
  drawH: number,
  left: number,
  top: number,
  materialKey: string,
): void {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const rng = mulberry32(hashSeedFromMask(mask, materialKey));
  let mainNp = gaussianLikeBlurFloat(new Float32Array(mask), drawW, drawH, 0.7);
  const tint = BURN_COLORS.tint;
  const deepTint = BURN_COLORS.deep_tint;
  for (let my = 0; my < drawH; my++) {
    for (let mx = 0; mx < drawW; mx++) {
      const p = my * drawW + mx;
      const ink = mainNp[p];
      if (ink < 0.002) continue;
      const x = left + mx;
      const y = top + my;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const idx = (y * W + x) * 4;
      let br = baseData[idx];
      let bg = baseData[idx + 1];
      let bb = baseData[idx + 2];
      const depth = clamp(ink * 1.3, 0, 1);
      const pr = (br * tint[0]) / 255;
      const pg = (bg * tint[1]) / 255;
      const pb = (bb * tint[2]) / 255;
      const dr = (br * deepTint[0]) / 255;
      const dg = (bg * deepTint[1]) / 255;
      const db = (bb * deepTint[2]) / 255;
      const burnR = pr * (1 - depth * 0.45) + dr * (depth * 0.45);
      const burnG = pg * (1 - depth * 0.45) + dg * (depth * 0.45);
      const burnB = pb * (1 - depth * 0.45) + db * (depth * 0.45);
      br = br * (1 - ink) + burnR * ink;
      bg = bg * (1 - ink) + burnG * ink;
      bb = bb * (1 - ink) + burnB * ink;
      const n = (rng() - 0.5) * 5;
      br = clamp(br + n * ink, 0, 255);
      bg = clamp(bg + n * ink, 0, 255);
      bb = clamp(bb + n * ink, 0, 255);
      baseData[idx] = br;
      baseData[idx + 1] = bg;
      baseData[idx + 2] = bb;
    }
  }
}

/** `apply_emboss_effect` del script Python (cuero / cuerina). */
export function applyCueroEmbossPythonLike(
  baseData: Uint8ClampedArray,
  maskRaw: Float32Array,
  drawW: number,
  drawH: number,
  left: number,
  top: number,
): void {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;

  let maskNp = gaussianLikeBlurFloat(float32OwnCopy(maskRaw), drawW, drawH, 0.5);

  let heightNp = gaussianLikeBlurFloat(float32OwnCopy(maskNp), drawW, drawH, 3);
  for (let p = 0; p < heightNp.length; p++) {
    const t = heightNp[p];
    heightNp[p] = t * t * (3 - 2 * t);
  }

  let rimNp = maxFilterFloat(maskRaw, drawW, drawH, 7);
  rimNp = gaussianLikeBlurFloat(rimNp, drawW, drawH, 4);
  let rimBump: Float32AB = new Float32Array(new ArrayBuffer(drawW * drawH * 4)) as Float32AB;
  for (let p = 0; p < rimBump.length; p++) {
    rimBump[p] = clamp(rimNp[p] - maskNp[p] * 0.85, 0, 1);
  }
  rimBump = gaussianLikeBlurFloat(rimBump, drawW, drawH, 2);
  for (let p = 0; p < heightNp.length; p++) {
    heightNp[p] -= rimBump[p] * 0.15;
  }

  const gradX = new Float32Array(drawW * drawH);
  const gradY = new Float32Array(drawW * drawH);
  for (let y = 1; y < drawH - 1; y++) {
    for (let x = 0; x < drawW; x++) {
      const p = y * drawW + x;
      gradY[p] = (heightNp[(y + 1) * drawW + x] - heightNp[(y - 1) * drawW + x]) / 2;
    }
  }
  for (let y = 0; y < drawH; y++) {
    for (let x = 1; x < drawW - 1; x++) {
      const p = y * drawW + x;
      gradX[p] = (heightNp[p + 1] - heightNp[p - 1]) / 2;
    }
  }

  const lightX = -0.7;
  const lightY = -0.7;
  let shadowMap: Float32AB = new Float32Array(new ArrayBuffer(drawW * drawH * 4)) as Float32AB;
  let highlightMap: Float32AB = new Float32Array(new ArrayBuffer(drawW * drawH * 4)) as Float32AB;
  for (let p = 0; p < shadowMap.length; p++) {
    const dot = gradX[p] * lightX + gradY[p] * lightY;
    shadowMap[p] = clamp(-dot * 14, 0, 1);
    highlightMap[p] = clamp(dot * 7, 0, 1);
  }
  shadowMap = gaussianLikeBlurFloat(shadowMap, drawW, drawH, 1);
  highlightMap = gaussianLikeBlurFloat(highlightMap, drawW, drawH, 0.8);

  let dropNp = gaussianLikeBlurFloat(float32OwnCopy(maskRaw), drawW, drawH, 5);
  const dropOnly = new Float32Array(drawW * drawH);
  for (let p = 0; p < dropOnly.length; p++) {
    dropOnly[p] = clamp(dropNp[p] - maskNp[p] * 0.8, 0, 1);
  }

  const shadowTint = [65, 38, 18];

  for (let my = 0; my < drawH; my++) {
    for (let mx = 0; mx < drawW; mx++) {
      const p = my * drawW + mx;
      const m = maskNp[p];
      if (m < 0.001 && dropOnly[p] < 0.02) continue;

      const x = left + mx;
      const y = top + my;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const idx = (y * W + x) * 4;

      let r = baseData[idx];
      let g = baseData[idx + 1];
      let b = baseData[idx + 2];

      const lum = (r + g + b) / 3;
      const soften = 0.25 * m;
      r = r * (1 - soften) + lum * soften;
      g = g * (1 - soften) + lum * soften;
      b = b * (1 - soften) + lum * soften;

      r *= 1 - m * 0.32;
      g *= 1 - m * 0.32;
      b *= 1 - m * 0.32;

      const sh = shadowMap[p];
      for (let c = 0; c < 3; c++) {
        const ch = c === 0 ? r : c === 1 ? g : b;
        const st = shadowTint[c];
        const darkened = ch * (1 - sh * 0.65);
        const tinted = ch * (1 - sh * 0.5) + st * (sh * 0.5);
        const mixed = darkened * 0.5 + tinted * 0.5;
        if (c === 0) r = mixed;
        else if (c === 1) g = mixed;
        else b = mixed;
      }

      const hi = highlightMap[p];
      r += (255 - r) * hi * 0.22;
      g += (255 - g) * hi * 0.22;
      b += (255 - b) * hi * 0.22;

      const dr = dropOnly[p];
      r *= 1 - dr * 0.12;
      g *= 1 - dr * 0.12;
      b *= 1 - dr * 0.12;

      baseData[idx] = clamp(r, 0, 255);
      baseData[idx + 1] = clamp(g, 0, 255);
      baseData[idx + 2] = clamp(b, 0, 255);
    }
  }
}
