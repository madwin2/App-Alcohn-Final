import JSZip from 'jszip';
import { uniqueZipName } from './helpers';
import type { VectorResult } from './types';

export async function zipVectorResults(results: VectorResult[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const result of results) {
    if (!result.svg || result.error || result.empty) continue;
    const fileName = uniqueZipName(result.name || 'vector', used);
    zip.file(fileName, result.svg);
  }
  return zip.generateAsync({ type: 'blob' });
}

export function zipDownloadName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `vectores-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, name: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
}
