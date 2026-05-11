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
 * Réplica del pipeline Sharp del ejemplo: greyscale → linear(1.35, -b) → brillo por material.
 * Ver `generateWithSharp` en `mockupGenerator.ts`.
 */
function buildStampLayerCanvas(
  logoImage: HTMLImageElement,
  drawW: number,
  drawH: number,
  material: MockupMaterial,
): HTMLCanvasElement {
  const stamp = document.createElement('canvas');
  stamp.width = drawW;
  stamp.height = drawH;
  const sctx = stamp.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('No se pudo crear capa sello');

  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.clearRect(0, 0, drawW, drawH);
  sctx.drawImage(logoImage, 0, 0, drawW, drawH);

  const linearB = material === 'madera' ? 50 : 40;
  const brightnessMul = material === 'madera' ? 0.55 : 0.65;

  const frame = sctx.getImageData(0, 0, drawW, drawH);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 4) continue;

    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    let v = L * 1.35 - linearB;
    v *= brightnessMul;
    v = clamp(v, 0, 255);
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  sctx.putImageData(frame, 0, 0);
  return stamp;
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

/** Textura quemada encima de la madera base, como relieve (muy bajo). */
async function drawMaderaBurnOverlay(ctx: CanvasRenderingContext2D) {
  if (ctx.canvas.width !== OUTPUT_WIDTH || ctx.canvas.height !== OUTPUT_HEIGHT) return;
  try {
    const burn = await loadImage(MADERA_BURN_OVERLAY);
    const scale = Math.max(OUTPUT_WIDTH / burn.naturalWidth, OUTPUT_HEIGHT / burn.naturalHeight);
    const drawW = Math.round(burn.naturalWidth * scale);
    const drawH = Math.round(burn.naturalHeight * scale);
    const left = Math.round((OUTPUT_WIDTH - drawW) / 2);
    const top = Math.round((OUTPUT_HEIGHT - drawH) / 2);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(burn, left, top, drawW, drawH);
    ctx.restore();
  } catch {
    // sin overlay si no hay archivo
  }
}

export async function generateMockup(optimizedLogo: File, material: MockupMaterial): Promise<File> {
  const logoSrc = await fileToDataUrl(optimizedLogo);
  const logoImage = await loadImage(logoSrc);

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo generar mockup');

  await drawTexture(ctx, material);
  if (material === 'madera') {
    await drawMaderaBurnOverlay(ctx);
  }

  const targetLogoW = Math.round(OUTPUT_WIDTH * LOGO_SCALE);
  const maxH = Math.round(OUTPUT_HEIGHT * LOGO_SCALE);
  const fitScale = Math.min(targetLogoW / logoImage.naturalWidth, maxH / logoImage.naturalHeight);
  const drawW = Math.max(1, Math.round(logoImage.naturalWidth * fitScale));
  const drawH = Math.max(1, Math.round(logoImage.naturalHeight * fitScale));
  const left = Math.round((OUTPUT_WIDTH - drawW) / 2);
  const top = Math.round((OUTPUT_HEIGHT - drawH) / 2);

  const stampLayer = buildStampLayerCanvas(logoImage, drawW, drawH, material);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(stampLayer, left, top);
  ctx.restore();

  const blob = await toBlob(canvas, 'image/jpeg', 0.92);
  return new File([blob], `mockup_${material}.jpg`, { type: 'image/jpeg' });
}
