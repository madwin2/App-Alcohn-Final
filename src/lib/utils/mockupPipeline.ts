export type MockupMaterial = 'cuero' | 'madera';

export interface LogoValidationResult {
  hasTransparentBackground: boolean;
  hasWhiteBackground: boolean;
  isMonochrome: boolean;
  approved: boolean;
  details: string;
}

export interface MockupMeasure {
  label: string;
  price: number;
}

const OUTPUT_WIDTH = 1400;
const OUTPUT_HEIGHT = 1000;
const MAX_ANALYSIS_PIXELS = 220_000;
const MAX_PROCESSING_SIZE = 1800;

const PRICE_TABLE: Record<MockupMaterial, MockupMeasure[]> = {
  cuero: [
    { label: '4 x 4 cm', price: 13500 },
    { label: '6 x 6 cm', price: 18900 },
    { label: '8 x 8 cm', price: 24600 },
  ],
  madera: [
    { label: '4 x 4 cm', price: 11800 },
    { label: '6 x 6 cm', price: 16500 },
    { label: '8 x 8 cm', price: 21900 },
  ],
};

/** Mismas rutas base que el ejemplo Sharp (`mockupGenerator.ts`). */
const textureCandidates: Record<MockupMaterial, string[]> = {
  cuero: ['/mockup-textures/cuero.jpg.jpeg', '/mockup-textures/cuero.jpg', '/mockup-textures/cuero.jpeg'],
  madera: ['/mockup-textures/madera.jpg.jpeg', '/mockup-textures/madera.jpg', '/mockup-textures/madera.jpeg'],
};

/** Opcional: refuerzo de vetas (solo madera), muy suave encima de la base. */
const MADERA_BURN_OVERLAY = '/mockup-textures/madera-quemada.png';

/** Igual que `LOGO_SCALE` en `generador mockup ejemplo/mockupGenerator.ts`. */
const LOGO_SCALE = 0.55;

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
    img.crossOrigin = 'anonymous';
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

export function getMockupMeasures(material: MockupMaterial): MockupMeasure[] {
  return PRICE_TABLE[material];
}

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

/**
 * Máscara de tinta 0–1: ignora blancos del logo (evita rectángulo gris al multiply)
 * y combina oscuridad + alpha para sellos negros o transparentes.
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
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a < 8) {
      mask[p] = 0;
      continue;
    }
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (L >= 245) {
      mask[p] = 0;
      continue;
    }
    const dark = (255 - L) / 255;
    let ink = dark * (a / 255);
    ink = Math.pow(Math.min(1, ink * 1.12), 0.78);
    mask[p] = ink;
  }
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

/**
 * Madera quemada solo donde el logo: mezcla base ↔ textura quemada según máscara.
 * Aureola: blur(máscara) − máscara → leve glow cálido alrededor.
 */
function applyMaderaQuemadaConMascara(
  baseData: Uint8ClampedArray,
  burnData: Uint8ClampedArray,
  mask: Float32Array,
  drawW: number,
  drawH: number,
  left: number,
  top: number,
): void {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const blurM = boxBlurMask2D(mask, drawW, drawH, 9);
  const pad = 48;
  const x0 = clamp(left - pad, 0, W - 1);
  const x1 = clamp(left + drawW + pad, 0, W - 1);
  const y0 = clamp(top - pad, 0, H - 1);
  const y1 = clamp(top + drawH + pad, 0, H - 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const mx = x - left;
      const my = y - top;
      if (mx < 0 || my < 0 || mx >= drawW || my >= drawH) continue;

      const p = my * drawW + mx;
      const ink = mask[p];
      const spread = blurM[p];
      let halo = (spread - ink * 0.92) * 2.4;
      halo = clamp(halo, 0, 1);

      if (ink < 0.002 && halo < 0.02) continue;

      const idx = (y * W + x) * 4;
      const br = baseData[idx];
      const bg = baseData[idx + 1];
      const bb = baseData[idx + 2];

      const ur = burnData[idx];
      const ug = burnData[idx + 1];
      const ub = burnData[idx + 2];

      const t = Math.pow(ink, 0.52);
      let r = br * (1 - t) + ur * t;
      let g = bg * (1 - t) + ug * t;
      let b = bb * (1 - t) + ub * t;

      const emberR = 255;
      const emberG = 120;
      const emberB = 40;
      const glow = halo * 0.38;
      r = r * (1 - glow) + (r * 0.55 + emberR * 0.45) * glow;
      g = g * (1 - glow) + (g * 0.45 + emberG * 0.55) * glow;
      b = b * (1 - glow) + (b * 0.35 + emberB * 0.65) * glow;

      baseData[idx] = clamp(r, 0, 255);
      baseData[idx + 1] = clamp(g, 0, 255);
      baseData[idx + 2] = clamp(b, 0, 255);
    }
  }
}

/** Cuero: hundido con bisel (luz arriba-izquierda, sombra abajo-derecha) + grano. */
function applyCueroBiselHundido(
  data: Uint8ClampedArray,
  mask: Float32Array,
  drawW: number,
  drawH: number,
  left: number,
  top: number,
): void {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const gxArr = new Float32Array(drawW * drawH);
  const gyArr = new Float32Array(drawW * drawH);

  for (let my = 1; my < drawH - 1; my++) {
    for (let mx = 1; mx < drawW - 1; mx++) {
      const p = my * drawW + mx;
      gxArr[p] = (mask[p + 1] - mask[p - 1]) * 0.5;
      gyArr[p] = (mask[p + drawW] - mask[p - drawW]) * 0.5;
    }
  }

  const lx = -0.7;
  const ly = -0.7;
  const lLen = Math.hypot(lx, ly) || 1;
  const Lx = lx / lLen;
  const Ly = ly / lLen;

  const pad = 40;
  const x0 = clamp(left - pad, 0, W - 1);
  const x1 = clamp(left + drawW + pad, 0, W - 1);
  const y0 = clamp(top - pad, 0, H - 1);
  const y1 = clamp(top + drawH + pad, 0, H - 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const mx = x - left;
      const my = y - top;
      if (mx < 0 || my < 0 || mx >= drawW || my >= drawH) continue;

      const p = my * drawW + mx;
      const ink = mask[p];
      if (ink < 0.003) continue;

      const gxm = gxArr[p];
      const gym = gyArr[p];
      const gLen = Math.hypot(gxm, gym) + 1e-5;
      const nx = -gxm / gLen;
      const ny = -gym / gLen;
      const edge = Math.min(1, gLen * 5.5);
      const ndotl = nx * Lx + ny * Ly;

      const idx = (y * W + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const grain = lum / 255;

      const cavity = ink * ink;
      let press = 1 - 0.6 * cavity;
      r *= press;
      g *= press;
      b *= press;

      const grainBoost = 1 + 0.24 * ink * (grain - 0.5) * 2;
      r *= grainBoost;
      g *= grainBoost;
      b *= grainBoost;

      const rim = edge * (1 - ink * 0.75);
      const highlight = rim * Math.max(0, ndotl) * 52;
      r += highlight;
      g += highlight;
      b += highlight;

      const shadow = rim * ink * Math.max(0, -ndotl) * 44;
      r -= shadow;
      g -= shadow;
      b -= shadow;

      const shelf = cavity * (1 - edge * 0.4) * -16;
      r += shelf;
      g += shelf;
      b += shelf;

      data[idx] = clamp(r, 0, 255);
      data[idx + 1] = clamp(g, 0, 255);
      data[idx + 2] = clamp(b, 0, 255);
    }
  }
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
  for (const candidate of textureCandidates[material]) {
    try {
      const texture = await loadImage(candidate);
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

  const targetLogoW = Math.round(OUTPUT_WIDTH * LOGO_SCALE);
  const maxH = Math.round(OUTPUT_HEIGHT * LOGO_SCALE);
  const fitScale = Math.min(targetLogoW / logoImage.naturalWidth, maxH / logoImage.naturalHeight);
  const drawW = Math.max(1, Math.round(logoImage.naturalWidth * fitScale));
  const drawH = Math.max(1, Math.round(logoImage.naturalHeight * fitScale));
  const left = Math.round((OUTPUT_WIDTH - drawW) / 2);
  const top = Math.round((OUTPUT_HEIGHT - drawH) / 2);

  const mask = extractInkMask(logoImage, drawW, drawH, material === 'madera' ? 0 : 1);
  const imageData = ctx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  if (material === 'madera') {
    try {
      const burnImg = await loadImage(MADERA_BURN_OVERLAY);
      const burnData = getCoverImageData(burnImg, OUTPUT_WIDTH, OUTPUT_HEIGHT).data;
      applyMaderaQuemadaConMascara(imageData.data, burnData, mask, drawW, drawH, left, top);
    } catch {
      const sin = new Uint8ClampedArray(imageData.data.length);
      for (let i = 0; i < sin.length; i += 4) {
        sin[i] = clamp(imageData.data[i] * 0.42, 0, 255);
        sin[i + 1] = clamp(imageData.data[i + 1] * 0.35, 0, 255);
        sin[i + 2] = clamp(imageData.data[i + 2] * 0.28, 0, 255);
        sin[i + 3] = 255;
      }
      applyMaderaQuemadaConMascara(imageData.data, sin, mask, drawW, drawH, left, top);
    }
  } else {
    applyCueroBiselHundido(imageData.data, mask, drawW, drawH, left, top);
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await toBlob(bgCanvas, 'image/jpeg', 0.92);
  return new File([blob], `mockup_${material}.jpg`, { type: 'image/jpeg' });
}
