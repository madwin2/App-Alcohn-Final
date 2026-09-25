/**
 * Parser de archivos .crv3d de Vectric Aspire.
 *
 * Port de scripts/crv3d_inspect.py. Un .crv3d es un contenedor OLE2 / Compound
 * File Binary; se abre con el paquete npm `cfb`.
 */

import * as CFB from 'cfb';

const WIDE_PREFIX = new Uint8Array([0xff, 0xfe, 0xff]);
const OLE2_MAGIC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]);

/** Firma de registro de capa: 04 00 00 00 + 16 bytes UUID + prefijo de cadena ancha. */
const LAYER_RECORD_PREFIX = new Uint8Array([0x04, 0x00, 0x00, 0x00]);

/**
 * Los vectores del paquete se llaman "<orden>_<sello_id>.svg". Aspire crea una
 * capa con ese nombre; si el SVG trae capas internas, les pega el nombre al
 * final ("...svgCapa 1"), así que el UUID se busca adentro del nombre.
 */
const SELLO_IN_LAYER =
  /(?:(?<orden>\d{1,3})_)?(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export type Crv3dLayer = {
  name: string;
  objectCount: number;
  selloId: string | null;
  orden: number | null;
};

export type Crv3dInfo = {
  version: string;
  parameters: Record<string, string>;
  layers: Crv3dLayer[];
  selloIds: string[];
  piezasEnCorte: number | null;
  previewGif: Uint8Array | null;
};

export class Crv3dParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Crv3dParseError';
  }
}

function toUint8(data: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return new Uint8Array(data);
  return new Uint8Array(data);
}

function bytesEqual(a: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset + expected.length > a.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (a[offset + i] !== expected[i]) return false;
  }
  return true;
}

function findBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function readUInt32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}

function readWideString(data: Uint8Array, at: number): { text: string | null; next: number } {
  if (!bytesEqual(data, at, WIDE_PREFIX)) {
    return { text: null, next: at };
  }
  const length = data[at + 3]!;
  const start = at + 4;
  const end = start + length * 2;
  if (end > data.length) {
    return { text: null, next: Math.min(end, data.length) };
  }
  try {
    const text = new TextDecoder('utf-16le').decode(data.subarray(start, end));
    return { text, next: end };
  } catch {
    return { text: null, next: end };
  }
}

function parseSelloFromName(name: string): { selloId: string | null; orden: number | null } {
  const match = SELLO_IN_LAYER.exec(name);
  if (!match?.groups?.uuid) {
    return { selloId: null, orden: null };
  }
  const ordenRaw = match.groups.orden;
  return {
    selloId: match.groups.uuid.toLowerCase(),
    orden: ordenRaw != null ? Number.parseInt(ordenRaw, 10) : null,
  };
}

export function parseParameters(data: Uint8Array): Record<string, string> {
  const params: Record<string, string> = {};
  let at = 0;
  while (true) {
    at = findBytes(data, WIDE_PREFIX, at);
    if (at === -1) break;

    const { text: name, next: after } = readWideString(data, at);
    if (!name) {
      at += 3;
      continue;
    }
    if (data.length < after + 4) break;

    const typeTag = readUInt32LE(data, after);
    if (typeTag === 3) {
      const { text: value, next: end } = readWideString(data, after + 4);
      if (value != null) {
        params[name] = value;
        at = end;
        continue;
      }
    }
    at = after;
  }
  return params;
}

export function parseLayers(data: Uint8Array): Crv3dLayer[] {
  const layers: Crv3dLayer[] = [];
  let searchFrom = 0;

  while (true) {
    const prefixAt = findBytes(data, LAYER_RECORD_PREFIX, searchFrom);
    if (prefixAt === -1) break;

    const wideAt = prefixAt + 4 + 16;
    if (!bytesEqual(data, wideAt, WIDE_PREFIX)) {
      searchFrom = prefixAt + 1;
      continue;
    }

    const length = data[wideAt + 3]!;
    const nameStart = wideAt + 4;
    const nameEnd = nameStart + length * 2;
    if (nameEnd > data.length) {
      searchFrom = prefixAt + 1;
      continue;
    }

    let name: string;
    try {
      name = new TextDecoder('utf-16le').decode(data.subarray(nameStart, nameEnd));
    } catch {
      searchFrom = prefixAt + 1;
      continue;
    }

    // Equivalente a name.isprintable() de Python: descartar basura binaria.
    if (![...name].every((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 || ch === '\t' || ch === '\n' || ch === '\r';
    })) {
      searchFrom = prefixAt + 1;
      continue;
    }

    const tail = data.subarray(nameEnd, nameEnd + 14);
    const objectCount = tail.length >= 14 ? readUInt32LE(tail, 10) : -1;
    const { selloId, orden } = parseSelloFromName(name);

    layers.push({ name, objectCount, selloId, orden });
    searchFrom = nameEnd;
  }

  return layers;
}

export function parseVersion(data: Uint8Array): string {
  const parts: string[] = [];
  let at = 0;
  while (parts.length < 2) {
    at = findBytes(data, WIDE_PREFIX, at);
    if (at === -1) break;
    const { text, next } = readWideString(data, at);
    at = next;
    if (text) parts.push(text.trim());
  }
  return parts.join(' ');
}

function contentToUint8(content: CFB.CFB$Blob | undefined | null): Uint8Array | null {
  if (content == null) return null;
  return toUint8(content as Uint8Array | number[]);
}

function readStream(cfb: CFB.CFB$Container, path: string): Uint8Array | null {
  // cfb.find es case-insensitive pero exige el slash inicial en paths compuestos.
  const candidates = [
    path,
    `/${path}`,
    `Root Entry/${path}`,
    path.replace(/\//g, '\\'),
    `\\${path.replace(/\//g, '\\')}`,
  ];
  for (const candidate of candidates) {
    const entry = CFB.find(cfb, candidate);
    if (entry?.content != null && entry.size > 0) {
      return contentToUint8(entry.content);
    }
  }
  return null;
}

function dedupeSelloIds(layers: Crv3dLayer[]): string[] {
  const seen = new Set<string>();
  const ordered: { id: string; orden: number | null }[] = [];

  for (const layer of layers) {
    if (!layer.selloId || seen.has(layer.selloId)) continue;
    seen.add(layer.selloId);
    ordered.push({ id: layer.selloId, orden: layer.orden });
  }

  ordered.sort((a, b) => {
    if (a.orden == null && b.orden == null) return 0;
    if (a.orden == null) return 1;
    if (b.orden == null) return -1;
    return a.orden - b.orden;
  });

  return ordered.map((x) => x.id);
}

function piezasEnCorte(layers: Crv3dLayer[]): number | null {
  for (const layer of layers) {
    if (layer.name === 'Corte') return layer.objectCount;
  }
  return null;
}

/**
 * Parsea un .crv3d desde bytes. Si el archivo no es OLE2 válido, lanza
 * Crv3dParseError con un mensaje claro (no explota con basura genérica).
 */
export function parseCrv3d(bytes: ArrayBuffer): Crv3dInfo {
  const raw = toUint8(bytes);

  if (raw.length < 8 || !bytesEqual(raw, 0, OLE2_MAGIC)) {
    throw new Crv3dParseError('El archivo no es un .crv3d válido (no es OLE2).');
  }

  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.parse(raw);
  } catch (e) {
    throw new Crv3dParseError(
      e instanceof Error
        ? `No se pudo abrir el contenedor OLE2: ${e.message}`
        : 'No se pudo abrir el contenedor OLE2.',
    );
  }

  const versionRaw = readStream(cfb, 'VersionData/Version');
  const docRaw = readStream(cfb, 'VectorData/DocumentData');
  const layersRaw = readStream(cfb, 'VectorData/2dDataV2');
  const previewRaw = readStream(cfb, 'PreviewData/Preview2D_GIF');

  const layers = layersRaw ? parseLayers(layersRaw) : [];

  return {
    version: versionRaw ? parseVersion(versionRaw) : '',
    parameters: docRaw ? parseParameters(docRaw) : {},
    layers,
    selloIds: dedupeSelloIds(layers),
    piezasEnCorte: piezasEnCorte(layers),
    previewGif: previewRaw && previewRaw.length > 0 ? previewRaw : null,
  };
}

/** Helpers exportados para armar fixtures de test. */
export const __crv3dTestUtils = {
  WIDE_PREFIX,
  writeWideString(text: string): Uint8Array {
    const chars = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      chars[i * 2] = code & 0xff;
      chars[i * 2 + 1] = (code >> 8) & 0xff;
    }
    const out = new Uint8Array(4 + chars.length);
    out.set(WIDE_PREFIX, 0);
    out[3] = text.length;
    out.set(chars, 4);
    return out;
  },
  writeLayerRecord(name: string, objectCount: number, layerUuid?: Uint8Array): Uint8Array {
    const uuid = layerUuid ?? new Uint8Array(16);
    const nameBytes = __crv3dTestUtils.writeWideString(name);
    const tail = new Uint8Array(14);
    tail[10] = objectCount & 0xff;
    tail[11] = (objectCount >> 8) & 0xff;
    tail[12] = (objectCount >> 16) & 0xff;
    tail[13] = (objectCount >> 24) & 0xff;
    const out = new Uint8Array(4 + 16 + nameBytes.length + 14);
    out.set(LAYER_RECORD_PREFIX, 0);
    out.set(uuid, 4);
    out.set(nameBytes, 20);
    out.set(tail, 20 + nameBytes.length);
    return out;
  },
  writeStringParam(name: string, value: string): Uint8Array {
    const nameBytes = __crv3dTestUtils.writeWideString(name);
    const typeTag = new Uint8Array([3, 0, 0, 0]);
    const valueBytes = __crv3dTestUtils.writeWideString(value);
    const out = new Uint8Array(nameBytes.length + 4 + valueBytes.length);
    out.set(nameBytes, 0);
    out.set(typeTag, nameBytes.length);
    out.set(valueBytes, nameBytes.length + 4);
    return out;
  },
};
