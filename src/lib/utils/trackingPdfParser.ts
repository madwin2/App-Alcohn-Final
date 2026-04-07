import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface TrackingPdfEntry {
  fullName: string;
  trackingNumber: string;
}

const NAME_LINE_REGEX = /^[A-Za-zÁÉÍÓÚÑáéíóúñ'`.-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ'`.-]+){1,3}$/;
const TRACKING_REGEX = /\bTN\s*([A-Z0-9]{10,})\b/i;
const INVALID_NAME_WORDS = [
  'DESTINATARIO',
  'REMITENTE',
  'BUENOS',
  'AIRES',
  'BARRIO',
  'CALLE',
  'AV',
  'PISO',
  'DPTO',
  'CP',
  'DOM',
  'SUCURSAL',
];
const INVALID_NAME_PHRASES = [
  'SAN SALVADOR',
  'BUENOS AIRES',
  'MAR DEL PLATA',
  'CORDOBA CAPITAL',
];

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const looksLikeName = (line: string): boolean => {
  const clean = normalizeWhitespace(line);
  if (!clean || clean.length < 5) return false;
  if (/\d/.test(clean)) return false;
  if (!NAME_LINE_REGEX.test(clean)) return false;
  const upper = clean.toUpperCase();
  if (INVALID_NAME_WORDS.some((word) => upper.includes(word))) return false;
  if (INVALID_NAME_PHRASES.some((phrase) => upper.includes(phrase))) return false;
  return true;
};

const extractLikelyName = (line: string): string | null => {
  const clean = normalizeWhitespace(line);
  if (!clean) return null;

  // Regla pedida: usar siempre la primera línea tras DESTINATARIO.
  // Solo limpiamos ruido obvio para no perder páginas por validaciones estrictas.
  const upper = clean.toUpperCase();
  if (upper.startsWith('CP:')) return null;

  // Si viene pegado con dirección ("Nombre Apellido calle 123"), cortar en primer número.
  const firstDigitIndex = clean.search(/\d/);
  const head = firstDigitIndex >= 0 ? clean.slice(0, firstDigitIndex).trim() : clean;
  return normalizeWhitespace(head || clean);
};

const pageItemsToLines = (items: TextItem[]): string[] => {
  type Bucket = { y: number; parts: Array<{ x: number; text: string }> };
  const buckets: Bucket[] = [];

  for (const item of items) {
    const text = normalizeWhitespace(item.str || '');
    if (!text) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let bucket = buckets.find((b) => Math.abs(b.y - y) <= 2);
    if (!bucket) {
      bucket = { y, parts: [] };
      buckets.push(bucket);
    }
    bucket.parts.push({ x, text });
  }

  buckets.sort((a, b) => b.y - a.y);
  return buckets
    .map((bucket) =>
      normalizeWhitespace(
        bucket.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.text)
          .join(' ')
      )
    )
    .filter(Boolean);
};

const dedupeEntries = (entries: TrackingPdfEntry[]): TrackingPdfEntry[] => {
  const seen = new Set<string>();
  const output: TrackingPdfEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.trackingNumber}::${entry.fullName.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
};

export const parseTrackingPdf = async (file: File): Promise<TrackingPdfEntry[]> => {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const matches: TrackingPdfEntry[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((i): i is TextItem => 'str' in i);
    const lines = pageItemsToLines(items);

    const destinatarioIndexes = lines
      .map((line, index) => (line.toUpperCase().includes('DESTINATARIO') ? index : -1))
      .filter((index) => index >= 0);

    for (const idx of destinatarioIndexes) {
      // Regla estricta: usar SOLO la primera línea después de DESTINATARIO
      const fullName = idx + 1 <= lines.length - 1 ? extractLikelyName(lines[idx + 1]) : null;
      if (!fullName) continue;

      let trackingNumber: string | null = null;
      // Correo Argentino suele poner TN arriba del destinatario
      for (let i = Math.max(0, idx - 10); i <= Math.min(lines.length - 1, idx + 4); i += 1) {
        const tn = lines[i].match(TRACKING_REGEX)?.[1];
        if (tn) {
          trackingNumber = tn.trim();
        }
      }

      if (trackingNumber) {
        matches.push({ fullName, trackingNumber });
      }
    }
  }

  return dedupeEntries(matches);
};

export const normalizePersonName = (value: string): string =>
  normalizeWhitespace(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  );
