import type { LogoValidationResult, MedidaAlternativaCm } from '@/lib/utils/mockupPipeline';

export type UiStep = 1 | 2 | 3 | 4;

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

export async function fetchUrlAsFile(url: string, fileName: string): Promise<File> {
  const response = await fetch(url);
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

export function persistAlternativasMedidasLocal(solicitudId: string, alternativas: MedidaAlternativaCm[]) {
  try {
    const raw = localStorage.getItem(LS_ALT_MEDIDAS);
    const prev = (() => {
      try {
        const p = JSON.parse(raw || '[]');
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })() as Array<{ solicitudId: string; alternativas: MedidaAlternativaCm[]; at: string }>;
    const entry = {
      solicitudId,
      alternativas,
      at: new Date().toISOString(),
    };
    const next = [entry, ...prev.filter((x) => x.solicitudId !== solicitudId)].slice(0, 300);
    localStorage.setItem(LS_ALT_MEDIDAS, JSON.stringify(next));
  } catch {
    // ignore
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
