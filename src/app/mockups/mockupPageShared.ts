import type { LogoValidationResult, MedidaAlternativaCm } from '@/lib/utils/mockupPipeline';

export type UiStep = 1 | 2 | 3;

export const getFileExtension = (fileName: string, fallback: string) => {
  const parts = fileName.split('.');
  if (parts.length <= 1) return fallback;
  return parts[parts.length - 1].toLowerCase();
};

export const revokeBlobUrl = (url: string | null) => {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
};

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen para IA'));
    reader.readAsDataURL(file);
  });

const loadImageFromSrc = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen para IA'));
    img.src = src;
  });

/**
 * Vercel rechaza el body de serverless con 413 si supera ~4.5 MB.
 * El JSON con data URL en base64 infla ~33%, así que recortamos lado y peso.
 */
const AI_API_MAX_SIDE = 1536;
const AI_API_MAX_DATA_URL_CHARS = 2_800_000;

export async function fileToAiApiDataUrl(file: File): Promise<string> {
  const src = await fileToDataUrl(file);
  if (src.length <= AI_API_MAX_DATA_URL_CHARS) {
    const img = await loadImageFromSrc(src).catch(() => null);
    const side = img ? Math.max(img.naturalWidth, img.naturalHeight) : 0;
    if (!img || side <= AI_API_MAX_SIDE) return src;
  }

  const image = await loadImageFromSrc(src);
  const naturalW = Math.max(1, image.naturalWidth || image.width);
  const naturalH = Math.max(1, image.naturalHeight || image.height);
  let maxSide = Math.min(AI_API_MAX_SIDE, Math.max(naturalW, naturalH));

  for (let i = 0; i < 8; i += 1) {
    const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen para IA');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length <= AI_API_MAX_DATA_URL_CHARS) return dataUrl;
    maxSide = Math.max(256, Math.floor(maxSide * 0.7));
  }

  throw new Error('La imagen es demasiado pesada para enviarla a la IA. Probá un PNG/JPG más liviano.');
}

export const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('No se pudo convertir resultado IA');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
};

/** Evita CDN/navegador sirviendo un PNG viejo tras sobrescribir el mismo path en Storage. */
export function storageUrlWithCacheBust(url: string, version?: number | string): string {
  if (!url?.trim()) return url;
  const v = String(version ?? Date.now());
  try {
    const u = new URL(url);
    u.searchParams.set('v', v);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(v)}`;
  }
}

export async function fetchUrlAsFile(
  url: string,
  fileName: string,
  options?: { cacheBust?: number | string },
): Promise<File> {
  const fetchUrl =
    options?.cacheBust != null ? storageUrlWithCacheBust(url, options.cacheBust) : url;
  const response = await fetch(fetchUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo descargar el archivo guardado');
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/png' });
}

export function validationToRecord(v: LogoValidationResult): Record<string, unknown> {
  return {
    hasTransparentBackground: v.hasTransparentBackground,
    hasWhiteBackground: v.hasWhiteBackground,
    isMonochrome: v.isMonochrome,
    approved: v.approved,
    details: v.details,
  };
}

export function recordToValidation(r: Record<string, unknown> | null): LogoValidationResult | null {
  if (!r || typeof r !== 'object') return null;
  return {
    hasTransparentBackground: Boolean(r.hasTransparentBackground),
    hasWhiteBackground: Boolean(r.hasWhiteBackground),
    isMonochrome: Boolean(r.isMonochrome),
    approved: Boolean(r.approved),
    details: typeof r.details === 'string' ? r.details : '',
  };
}

export const LS_ALT_MEDIDAS = 'mockup_medidas_alternativas_v1';

type MedidasLsEntry = {
  solicitudId: string;
  alternativas: MedidaAlternativaCm[];
  /** Si falta o no coincide la longitud, se asume todo true (compatibilidad). */
  enviar?: boolean[];
  at: string;
};

export function persistAlternativasMedidasLocal(
  solicitudId: string,
  alternativas: MedidaAlternativaCm[],
  enviar?: boolean[],
) {
  try {
    const raw = localStorage.getItem(LS_ALT_MEDIDAS);
    const prev = (() => {
      try {
        const p = JSON.parse(raw || '[]');
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })() as MedidasLsEntry[];
    const flags =
      enviar && enviar.length === alternativas.length
        ? enviar.map(Boolean)
        : alternativas.map(() => true);
    const entry: MedidasLsEntry = {
      solicitudId,
      alternativas,
      enviar: flags,
      at: new Date().toISOString(),
    };
    const next = [entry, ...prev.filter((x) => x.solicitudId !== solicitudId)].slice(0, 300);
    localStorage.setItem(LS_ALT_MEDIDAS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function persistSeleccionMedidasEnvioLocal(solicitudId: string, enviar: boolean[]) {
  try {
    const raw = localStorage.getItem(LS_ALT_MEDIDAS);
    const prev = (() => {
      try {
        const p = JSON.parse(raw || '[]');
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })() as MedidasLsEntry[];
    const hit = prev.find((x) => x.solicitudId === solicitudId);
    if (!hit?.alternativas || hit.alternativas.length !== enviar.length) return;
    const entry: MedidasLsEntry = {
      ...hit,
      enviar: enviar.map(Boolean),
      at: new Date().toISOString(),
    };
    const next = [entry, ...prev.filter((x) => x.solicitudId !== solicitudId)].slice(0, 300);
    localStorage.setItem(LS_ALT_MEDIDAS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function leerSeleccionMedidasEnvioLocal(solicitudId: string, len: number): boolean[] {
  try {
    const raw = localStorage.getItem(LS_ALT_MEDIDAS);
    const p = JSON.parse(raw || '[]');
    if (!Array.isArray(p)) return Array(len).fill(true);
    const hit = p.find((x: { solicitudId?: string }) => x?.solicitudId === solicitudId) as MedidasLsEntry | undefined;
    const e = hit?.enviar;
    if (!Array.isArray(e) || e.length !== len) return Array(len).fill(true);
    return e.map((x) => x === true);
  } catch {
    return Array(len).fill(true);
  }
}

export function leerAlternativasMedidasLocal(solicitudId: string): MedidaAlternativaCm[] | null {
  try {
    const raw = localStorage.getItem(LS_ALT_MEDIDAS);
    const p = JSON.parse(raw || '[]');
    if (!Array.isArray(p)) return null;
    const hit = p.find((x: { solicitudId?: string }) => x?.solicitudId === solicitudId);
    if (!hit?.alternativas || !Array.isArray(hit.alternativas)) return null;
    return hit.alternativas as MedidaAlternativaCm[];
  } catch {
    return null;
  }
}
