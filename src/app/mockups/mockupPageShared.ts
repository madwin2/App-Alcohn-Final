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
