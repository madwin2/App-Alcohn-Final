import {
  applyCueroEmbossPythonLike,
  applyMockupFinalSharpening,
  applyGlobalPostEffectsLikePython,
  applyMaderaBurnFallbackTint,
  applyMaderaBurnPythonLike,
  computeLogoDrawDimensionsPython,
  createMaskPythonStyle,
} from './mockupPythonLikeEffects';
import { MOCKUP_TEXTURE_FILES, mockupTextureUrl } from './mockupTextureUrls';

export type MockupMaterial = 'cuero' | 'madera';

/** Elección en UI: una textura o ambas. */
export type MockupMaterialChoice = 'cuero' | 'madera' | 'ambos';

export function resolveMockupMaterials(choice: MockupMaterialChoice): MockupMaterial[] {
  if (choice === 'ambos') return ['cuero', 'madera'];
  return [choice];
}

export function materialChoiceFromCheckboxes(useCuero: boolean, useMadera: boolean): MockupMaterialChoice {
  if (useCuero && !useMadera) return 'cuero';
  if (!useCuero && useMadera) return 'madera';
  return 'ambos';
}

export interface LogoValidationResult {
  hasTransparentBackground: boolean;
  hasWhiteBackground: boolean;
  isMonochrome: boolean;
  approved: boolean;
  details: string;
}

const OUTPUT_WIDTH = 1400;
const OUTPUT_HEIGHT = 1000;
const MAX_ANALYSIS_PIXELS = 220_000;
const MAX_PROCESSING_SIZE = 1800;

/** Rutas resueltas con `base` de Vite; coinciden con `public/mockup-textures/`. */
const textureCandidates: Record<MockupMaterial, readonly string[]> = {
  cuero: MOCKUP_TEXTURE_FILES.cuero,
  madera: MOCKUP_TEXTURE_FILES.madera,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar imagen: ${src}`));
    img.src = src;
  });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo exportar imagen'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });

const scaleForLimit = (width: number, height: number, maxPixels: number): { width: number; height: number } => {
  const pixels = width * height;
  if (pixels <= maxPixels) return { width, height };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const rgbToHue = (r: number, g: number, b: number): number => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  if (delta === 0) return 0;
  if (max === nr) return ((ng - nb) / delta + (ng < nb ? 6 : 0)) * 60;
  if (max === ng) return ((nb - nr) / delta + 2) * 60;
  return ((nr - ng) / delta + 4) * 60;
};

const isNearWhite = (r: number, g: number, b: number) => r >= 245 && g >= 245 && b >= 245;

export function sanitizeDesignName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80) || 'diseno';
}

export async function validateLogoForMockup(file: File): Promise<LogoValidationResult> {
  const src = await fileToDataUrl(file);
  const image = await loadImage(src);
  const scaled = scaleForLimit(image.naturalWidth, image.naturalHeight, MAX_ANALYSIS_PIXELS);

  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo analizar la imagen');
  ctx.clearRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(image, 0, 0, scaled.width, scaled.height);

  const data = ctx.getImageData(0, 0, scaled.width, scaled.height).data;
  const step = Math.max(1, Math.floor(Math.sqrt((scaled.width * scaled.height) / 120000)));

  let total = 0;
  let transparent = 0;
  let edgeTotal = 0;
  let edgeTransparent = 0;
  let opaque = 0;
  let whiteOpaque = 0;
  let edgeWhite = 0;
  let foreground = 0;
  let grayscaleForeground = 0;
  const hueBins = new Array<number>(24).fill(0);

  for (let y = 0; y < scaled.height; y += step) {
    for (let x = 0; x < scaled.width; x += step) {
      const idx = (y * scaled.width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      total += 1;
      const isEdge = x <= step || y <= step || x >= scaled.width - step - 1 || y >= scaled.height - step - 1;
      if (isEdge) edgeTotal += 1;

      const isTransparent = a < 20;
      if (isTransparent) {
        transparent += 1;
        if (isEdge) edgeTransparent += 1;
        continue;
      }

      if (a > 220) {
        opaque += 1;
        if (isNearWhite(r, g, b)) {
          whiteOpaque += 1;
          if (isEdge) edgeWhite += 1;
        }
      }

      const whiteLike = isNearWhite(r, g, b);
      if (whiteLike) continue;

      foreground += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;

      if (sat < 0.14) {
        grayscaleForeground += 1;
      } else {
        const hue = rgbToHue(r, g, b);
        const bin = clamp(Math.floor(hue / 15), 0, hueBins.length - 1);
        hueBins[bin] += 1;
      }
    }
  }

  const transparentRatio = transparent / Math.max(1, total);
  const edgeTransparentRatio = edgeTransparent / Math.max(1, edgeTotal);
  const whiteRatio = whiteOpaque / Math.max(1, opaque);
  const edgeWhiteRatio = edgeWhite / Math.max(1, edgeTotal);
  const grayscaleShare = grayscaleForeground / Math.max(1, foreground);
  const colorful = foreground - grayscaleForeground;
  const dominantHueShare = colorful <= 0 ? 0 : Math.max(...hueBins) / colorful;

  const hasTransparentBackground = edgeTransparentRatio >= 0.58 || transparentRatio >= 0.24;
  const hasWhiteBackground =
    (edgeWhiteRatio >= 0.6 && whiteRatio >= 0.45) || (whiteRatio >= 0.75 && transparentRatio < 0.2);
  const isMonochrome = foreground > 25 && (grayscaleShare >= 0.86 || dominantHueShare >= 0.9);
  const approved = (hasTransparentBackground || hasWhiteBackground) && isMonochrome;

  const details = [
    hasTransparentBackground || hasWhiteBackground
      ? `Fondo OK (${hasTransparentBackground ? 'transparente' : 'blanco'})`
      : 'Fondo no válido',
    isMonochrome ? 'Logo monocromático' : 'Logo no monocromático',
  ].join(' · ');

  return { hasTransparentBackground, hasWhiteBackground, isMonochrome, approved, details };
}

export async function optimizeLogoForMockup(file: File, designName: string): Promise<File> {
  const src = await fileToDataUrl(file);
  const image = await loadImage(src);
  const scaled = scaleForLimit(image.naturalWidth, image.naturalHeight, MAX_PROCESSING_SIZE * MAX_PROCESSING_SIZE);

  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar logo');
  ctx.clearRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(image, 0, 0, scaled.width, scaled.height);

  const frame = ctx.getImageData(0, 0, scaled.width, scaled.height);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const a = px[i + 3];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    const transparentPx = a < 22;
    const whiteBgPx = isNearWhite(r, g, b) || (luminance > 244 && sat < 0.16);
    if (transparentPx || whiteBgPx) {
      px[i + 3] = 0;
      continue;
    }

    px[i] = 0;
    px[i + 1] = 0;
    px[i + 2] = 0;
    px[i + 3] = a > 100 ? 255 : Math.round((a / 100) * 255);
  }
  ctx.putImageData(frame, 0, 0);

  const optimizedBlob = await toBlob(canvas, 'image/png');
  const safeName = sanitizeDesignName(designName);
  return new File([optimizedBlob], `${safeName}_optimizado.png`, { type: 'image/png' });
}

function luminanceFromRgba(d: Uint8ClampedArray, i: number): number {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

/**
 * Anula el "papel" blanco del logo (rectángulo): flood-fill desde el borde del sello
 * por píxeles claros o transparentes; lo alcanzado no es tinta (evita quemar toda la placa).
 */
function clearMaskOnPaperReachableFromBorder(
  mask: Float32Array,
  rgba: Uint8ClampedArray,
  drawW: number,
  drawH: number,
): void {
  const passable = new Uint8Array(drawW * drawH);
  for (let p = 0; p < drawW * drawH; p++) {
    const i = p * 4;
    const a = rgba[i + 3];
    const L = luminanceFromRgba(rgba, i);
    passable[p] = a < 46 || L > 220 ? 1 : 0;
  }
  const vis = new Uint8Array(drawW * drawH);
  const stack: number[] = [];
  const tryPush = (p: number) => {
    if (p < 0 || p >= drawW * drawH || vis[p] || !passable[p]) return;
    vis[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < drawW; x++) {
    tryPush(x);
    tryPush((drawH - 1) * drawW + x);
  }
  for (let y = 0; y < drawH; y++) {
    tryPush(y * drawW);
    tryPush(y * drawW + drawW - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % drawW;
    const y = (p / drawW) | 0;
    if (x > 0) tryPush(p - 1);
    if (x < drawW - 1) tryPush(p + 1);
    if (y > 0) tryPush(p - drawW);
    if (y < drawH - 1) tryPush(p + drawW);
  }
  for (let p = 0; p < drawW * drawH; p++) {
    if (vis[p]) mask[p] = 0;
    else if (mask[p] < 0.04) mask[p] = 0;
  }
}

/**
 * Máscara de tinta 0–1: ignora blancos + flood del papel; tinta solo en trazos del logo.
 */
function extractInkMask(
  logoImage: HTMLImageElement,
  drawW: number,
  drawH: number,
  postBlurRadius = 1,
): Float32Array {
  const mask = new Float32Array(drawW * drawH);
  const c = document.createElement('canvas');
  c.width = drawW;
  c.height = drawH;
  const sctx = c.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('No se pudo crear máscara');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(logoImage, 0, 0, drawW, drawH);
  const d = sctx.getImageData(0, 0, drawW, drawH).data;
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const a = d[i + 3];
    if (a < 8) {
      mask[p] = 0;
      continue;
    }
    const L = luminanceFromRgba(d, i);
    if (L >= 242) {
      mask[p] = 0;
      continue;
    }
    const dark = (255 - L) / 255;
    let ink = dark * (a / 255);
    ink = Math.pow(Math.min(1, ink * 1.15), 0.72);
    mask[p] = ink;
  }
  clearMaskOnPaperReachableFromBorder(mask, d, drawW, drawH);
  return postBlurRadius > 0 ? boxBlurMask2D(mask, drawW, drawH, postBlurRadius) : mask;
}

/** Blur ligero para bordes de prensa más orgánicos. */
function boxBlurMask2D(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src;
  const pass = (input: Float32Array): Float32Array => {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let cnt = 0;
        for (let dx = -r; dx <= r; dx++) {
          const xx = clamp(x + dx, 0, w - 1);
          sum += input[y * w + xx];
          cnt += 1;
        }
        out[y * w + x] = sum / cnt;
      }
    }
    return out;
  };
  let hPass = pass(src);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        sum += hPass[yy * w + x];
        cnt += 1;
      }
      out[y * w + x] = sum / cnt;
    }
  }
  return out;
}

export interface LogoInkMeasurements {
  /** Ancho del trazo (px, espacio de la imagen original). */
  widthPx: number;
  heightPx: number;
  /** ancho / alto */
  ratioWOverH: number;
  /** Proporción reducida del rectángulo del trazo, p. ej. `3 : 2 (ancho : alto)`. */
  ratioLabel: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Si no hubo tinta detectada, se usa el lienzo completo. */
  usedFallbackFullImage: boolean;
}

function gcdInt(a: number, b: number): number {
  let x = Math.max(1, Math.round(Math.abs(a)));
  let y = Math.max(1, Math.round(Math.abs(b)));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** Bounding box del trazo de tinta (no del archivo completo), en píxeles nativos. */
export async function measureLogoInkBoundsFromFile(file: File): Promise<LogoInkMeasurements> {
  const src = await fileToDataUrl(file);
  const image = await loadImage(src);
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  const scaled = scaleForLimit(nw, nh, MAX_ANALYSIS_PIXELS);
  const mask = extractInkMask(image, scaled.width, scaled.height, 0);
  const TH = 0.085;
  let minX = scaled.width;
  let minY = scaled.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < scaled.height; y++) {
    const row = y * scaled.width;
    for (let x = 0; x < scaled.width; x++) {
      if (mask[row + x] >= TH) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  let widthPx = nw;
  let heightPx = nh;
  let usedFallbackFullImage = true;
  if (maxX >= minX && maxY >= minY) {
    usedFallbackFullImage = false;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const sx = nw / scaled.width;
    const sy = nh / scaled.height;
    widthPx = Math.max(1, Math.round(bw * sx));
    heightPx = Math.max(1, Math.round(bh * sy));
  }
  const ratioWOverH = widthPx / Math.max(1, heightPx);
  const g = gcdInt(widthPx, heightPx);
  const rw = Math.round(widthPx / g);
  const rh = Math.round(heightPx / g);
  const ratioLabel = `${rw} : ${rh} (ancho : alto)`;
  return {
    widthPx,
    heightPx,
    ratioWOverH,
    ratioLabel,
    naturalWidth: nw,
    naturalHeight: nh,
    usedFallbackFullImage,
  };
}

export interface MedidaAlternativaCm {
  label: string;
  anchoCm: number;
  altoCm: number;
  /** Cotización transferencia (opcional, rellena la UI). */
  precioTransferencia?: number | null;
}

function fmtCmCorto(n: number): string {
  const t = n.toFixed(1);
  return t.endsWith('.0') ? t.slice(0, -2) : t;
}

/** Tres tamaños manteniendo la proporción; el lado largo mide 4, 6 y 8 cm. */
export function medidasAlternativasCmDesdeRatio(ratioWOverH: number): MedidaAlternativaCm[] {
  const largosCm = [4, 6, 8];
  const r = ratioWOverH > 0 && Number.isFinite(ratioWOverH) ? ratioWOverH : 1;
  return largosCm.map((L) => {
    let anchoCm: number;
    let altoCm: number;
    if (r >= 1) {
      anchoCm = L;
      altoCm = L / r;
    } else {
      altoCm = L;
      anchoCm = L * r;
    }
    return {
      label: `${fmtCmCorto(anchoCm)} × ${fmtCmCorto(altoCm)} cm`,
      anchoCm,
      altoCm,
    };
  });
}

const MIN_ANCHO_CM = 0.5;

/**
 * Tres variantes por ancho nominal: el ancho elegido, +1 cm y −1 cm (mín. 0,5 cm),
 * con alto proporcional (ratio = ancho/alto del trazo).
 */
export function medidasAlternativasDesdeAnchoCm(
  anchoBaseCm: number,
  ratioWOverH: number,
): MedidaAlternativaCm[] {
  const r = ratioWOverH > 0 && Number.isFinite(ratioWOverH) ? ratioWOverH : 1;
  const w0 = Math.max(MIN_ANCHO_CM, Number(anchoBaseCm));
  const mk = (anchoCm: number): MedidaAlternativaCm => {
    const altoCm = anchoCm / r;
    return {
      label: `${fmtCmCorto(anchoCm)} × ${fmtCmCorto(altoCm)} cm`,
      anchoCm,
      altoCm,
    };
  };
  const candidates = [w0, w0 + 1, Math.max(MIN_ANCHO_CM, w0 - 1)];
  const seen = new Set<string>();
  const widths: number[] = [];
  for (const x of candidates) {
    const key = x.toFixed(4);
    if (!seen.has(key)) {
      seen.add(key);
      widths.push(x);
    }
  }
  let pad = 2;
  while (widths.length < 3) {
    const x = w0 + pad;
    pad += 1;
    const key = x.toFixed(4);
    if (!seen.has(key)) {
      seen.add(key);
      widths.push(x);
    }
  }
  return widths.slice(0, 3).map(mk);
}

/** Solo textura base (madera quemada se aplica después con máscara del logo). */
async function renderBackgroundCanvas(material: MockupMaterial): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = OUTPUT_WIDTH;
  c.height = OUTPUT_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear lienzo de fondo');
  await drawTexture(ctx, material);
  return c;
}

/** Dibuja imagen cover y devuelve RGBA alineado al lienzo de salida. */
function getCoverImageData(img: HTMLImageElement, outW: number, outH: number): ImageData {
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No se pudo rasterizar textura');
  const scale = Math.max(outW / img.naturalWidth, outH / img.naturalHeight);
  const bw = Math.round(img.naturalWidth * scale);
  const bh = Math.round(img.naturalHeight * scale);
  const bl = Math.round((outW - bw) / 2);
  const bt = Math.round((outH - bh) / 2);
  ctx.drawImage(img, bl, bt, bw, bh);
  return ctx.getImageData(0, 0, outW, outH);
}

const paintProceduralTexture = (ctx: CanvasRenderingContext2D, material: MockupMaterial) => {
  const gradient = ctx.createLinearGradient(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  if (material === 'madera') {
    gradient.addColorStop(0, '#8b5e34');
    gradient.addColorStop(0.5, '#a97444');
    gradient.addColorStop(1, '#6f4726');
  } else {
    gradient.addColorStop(0, '#5e3d22');
    gradient.addColorStop(0.5, '#7a5130');
    gradient.addColorStop(1, '#4b2f18');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  ctx.globalAlpha = material === 'madera' ? 0.14 : 0.09;
  ctx.strokeStyle = material === 'madera' ? '#3f2a17' : '#2f1d10';
  for (let i = 0; i < 90; i += 1) {
    const y = Math.round((i / 90) * OUTPUT_HEIGHT + Math.sin(i * 0.5) * 8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(OUTPUT_WIDTH * 0.2, y + 8, OUTPUT_WIDTH * 0.8, y - 8, OUTPUT_WIDTH, y + 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawTexture = async (ctx: CanvasRenderingContext2D, material: MockupMaterial) => {
  for (const file of textureCandidates[material]) {
    try {
      const texture = await loadImage(mockupTextureUrl(file));
      const scale = Math.max(OUTPUT_WIDTH / texture.naturalWidth, OUTPUT_HEIGHT / texture.naturalHeight);
      const drawW = Math.round(texture.naturalWidth * scale);
      const drawH = Math.round(texture.naturalHeight * scale);
      const left = Math.round((OUTPUT_WIDTH - drawW) / 2);
      const top = Math.round((OUTPUT_HEIGHT - drawH) / 2);
      ctx.drawImage(texture, left, top, drawW, drawH);
      return;
    } catch {
      // intenta siguiente textura
    }
  }
  paintProceduralTexture(ctx, material);
};

export async function generateMockup(optimizedLogo: File, material: MockupMaterial): Promise<File> {
  const logoSrc = await fileToDataUrl(optimizedLogo);
  const logoImage = await loadImage(logoSrc);

  const bgCanvas = await renderBackgroundCanvas(material);
  const ctx = bgCanvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo leer fondo');

  const { drawW, drawH } = computeLogoDrawDimensionsPython(logoImage.naturalWidth, logoImage.naturalHeight);
  const left = Math.round((OUTPUT_WIDTH - drawW) / 2);
  const top = Math.round((OUTPUT_HEIGHT - drawH) / 2);

  const mask = createMaskPythonStyle(logoImage, drawW, drawH);
  const imageData = ctx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  if (material === 'madera') {
    try {
      const burnImg = await loadImage(mockupTextureUrl(MOCKUP_TEXTURE_FILES.maderaBurnOverlay));
      const burnData = getCoverImageData(burnImg, OUTPUT_WIDTH, OUTPUT_HEIGHT).data;
      applyMaderaBurnPythonLike(imageData.data, burnData, mask, drawW, drawH, left, top, 'madera');
    } catch {
      applyMaderaBurnFallbackTint(imageData.data, mask, drawW, drawH, left, top, 'madera');
    }
  } else {
    applyCueroEmbossPythonLike(imageData.data, mask, drawW, drawH, left, top);
  }

  applyGlobalPostEffectsLikePython(imageData);
  applyMockupFinalSharpening(
    imageData.data,
    imageData.width,
    imageData.height,
    material === 'cuero' ? { amount: 0.17, blurSigma: 0.95 } : undefined,
  );
  ctx.putImageData(imageData, 0, 0);

  const blob = await toBlob(bgCanvas, 'image/jpeg', 0.94);
  return new File([blob], `mockup_${material}.jpg`, { type: 'image/jpeg' });
}
