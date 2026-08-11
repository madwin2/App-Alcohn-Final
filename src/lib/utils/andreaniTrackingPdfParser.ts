import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { TrackingPdfEntry } from '@/lib/utils/trackingPdfParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Ej: "N° de seguimiento: 360003058027210" (encoding de ° puede variar). */
const ANDREANI_TRACKING_REGEX =
  /N\s*[°ºo]?\s*de\s*seguimiento\s*:\s*([0-9]{10,20})/i;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const pageItemsToLines = (items: TextItem[]): string[] => {
  type Bucket = { y: number; parts: Array<{ x: number; text: string }> };
  const buckets: Bucket[] = [];

  for (const item of items) {
    const text = normalizeWhitespace(item.str || '');
    if (!text) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let bucket = buckets.find((b) => Math.abs(b.y - y) <= 2.5);
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
          .join(' '),
      ),
    )
    .filter(Boolean);
};

const extractTrackingFromLines = (lines: string[]): string | null => {
  for (const line of lines) {
    const m = line.match(ANDREANI_TRACKING_REGEX);
    if (m?.[1]) return m[1].trim();
  }
  // Fallback: línea con solo dígitos largos cerca de "seguimiento"
  for (let i = 0; i < lines.length; i += 1) {
    if (!/seguimiento/i.test(lines[i])) continue;
    const inline = lines[i].match(/([0-9]{10,20})/);
    if (inline?.[1]) return inline[1];
    const next = lines[i + 1]?.match(/^([0-9]{10,20})\s*$/);
    if (next?.[1]) return next[1];
  }
  return null;
};

const extractNameFromLines = (lines: string[]): string | null => {
  const idx = lines.findIndex((l) => /^destinatario\s*:?\s*$/i.test(l) || /^destinatario\s*:/i.test(l));
  if (idx < 0) return null;

  // "Destinatario: NOMBRE" en la misma línea
  const same = lines[idx].match(/^destinatario\s*:\s*(.+)$/i);
  if (same?.[1]?.trim()) {
    return normalizeWhitespace(same[1]);
  }

  for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i += 1) {
    const line = normalizeWhitespace(lines[i]);
    if (!line) continue;
    if (/^(n\s*[°ºo]?\s*interno|peso|alto|remitente|bulto)/i.test(line)) continue;
    // Cortar si viene pegado con dirección
    const firstDigit = line.search(/\d/);
    const head = firstDigit >= 0 ? line.slice(0, firstDigit).trim() : line;
    if (head.length >= 2) return normalizeWhitespace(head);
  }
  return null;
};

export const extractAndreaniTrackingEntryFromLines = (
  lines: string[],
): Pick<TrackingPdfEntry, 'fullName' | 'trackingNumber'> | null => {
  const fullName = extractNameFromLines(lines);
  const trackingNumber = extractTrackingFromLines(lines);
  if (!fullName || !trackingNumber) return null;
  return { fullName, trackingNumber };
};

export const listAndreaniTrackingNumbersByPage = async (
  buffer: ArrayBuffer | Uint8Array,
): Promise<(string | null)[]> => {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out: (string | null)[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((i): i is TextItem => 'str' in i);
    const lines = pageItemsToLines(items);
    out.push(extractAndreaniTrackingEntryFromLines(lines)?.trackingNumber ?? null);
  }
  return out;
};

export const parseAndreaniTrackingPdf = async (file: File): Promise<TrackingPdfEntry[]> => {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const matches: TrackingPdfEntry[] = [];
  const seen = new Set<string>();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((i): i is TextItem => 'str' in i);
    const lines = pageItemsToLines(items);
    const entry = extractAndreaniTrackingEntryFromLines(lines);
    if (!entry) continue;
    const key = `${pageNumber}::${entry.trackingNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ ...entry, pageNumber });
  }

  return matches;
};
