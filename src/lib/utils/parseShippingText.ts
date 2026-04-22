/**
 * Parseo de texto libre de datos de envío (Argentina).
 * Soporta líneas con/sin etiquetas y bloques en orden libre.
 */

export type ParsedShippingData = {
  fullName: string;
  province: string;
  locality: string;
  address: string;
  postalCode: string;
  email: string;
  phone: string;
};

const nfd = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normKey = (s: string) =>
  nfd(s)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Palabra suelta que no puede ser "nombre" */
const NOT_NAME_ALONE = new Set(
  ['capital', 'sucursal', 'localidad', 'domicilio', 'provincia', 'caba', 'piso', 'dpto', 'depto', 'suc', 'pje'].map((w) =>
    normKey(w),
  ),
);

const PROV_KEYS_SORTED: Array<{ key: string; display: string }> = [
  { key: 'SANTIAGO DEL ESTERO', display: 'Santiago del Estero' },
  { key: 'CIUDAD AUTONOMA DE BUENOS AIRES', display: 'Capital Federal' },
  { key: 'TIERRA DEL FUEGO', display: 'Tierra del Fuego' },
  { key: 'ENTRE RIOS', display: 'Entre Ríos' },
  { key: 'LA RIOJA', display: 'La Rioja' },
  { key: 'RIO NEGRO', display: 'Río Negro' },
  { key: 'SANTA CRUZ', display: 'Santa Cruz' },
  { key: 'SANTA FE', display: 'Santa Fe' },
  { key: 'SAN JUAN', display: 'San Juan' },
  { key: 'SAN LUIS', display: 'San Luis' },
  { key: 'BUENOS AIRES', display: 'Buenos Aires' },
  { key: 'CAPITAL FEDERAL', display: 'Capital Federal' },
  { key: 'LA PAMPA', display: 'La Pampa' },
  { key: 'SALTA', display: 'Salta' },
  { key: 'CHACO', display: 'Chaco' },
  { key: 'CHUBUT', display: 'Chubut' },
  { key: 'CORDOBA', display: 'Córdoba' },
  { key: 'CORRIENTES', display: 'Corrientes' },
  { key: 'MENDOZA', display: 'Mendoza' },
  { key: 'MISIONES', display: 'Misiones' },
  { key: 'TUCUMAN', display: 'Tucumán' },
  { key: 'FORMOSA', display: 'Formosa' },
  { key: 'NEUQUEN', display: 'Neuquén' },
  { key: 'CATAMARCA', display: 'Catamarca' },
  { key: 'JUJUY', display: 'Jujuy' },
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function matchProvinceInLine(line: string): { display: string } | null {
  const cleaned = line
    .replace(/^provincia\s*([:.]|-)?\s*/i, '')
    .replace(/^prov\.\s*/i, '')
    .replace(/^provincia de (la|el|los)?\s*/i, '')
    .replace(/^prov\.\s*de\s*/i, '')
    .trim();
  const nk = normKey(cleaned);
  if (/^BS\s*AS$|^BSAS$/.test(nk) || (nk.includes('BUENOS') && nk.includes('AIRES'))) {
    return { display: 'Buenos Aires' };
  }
  if (/^CABA$|^C\.?A\.?B\.?A\.?$/.test(nk)) return { display: 'Capital Federal' };
  for (const { key, display } of PROV_KEYS_SORTED) {
    if (nk === key) return { display };
  }
  return null;
}

function looksLikeAddressLine(line: string): boolean {
  if (line.length < 7) return false;
  if (/\b(av\.?|calle|pasaje|pje|rincon|b°|barrio|mz|lote|depto|dpto|piso|km\s|s\/c|s\/n)\b/i.test(line)) return true;
  if (/\d/.test(line)) {
    const parts = line.split(/\s+/).filter(Boolean);
    return parts.length >= 2;
  }
  return false;
}

const extractPhone = (raw: string): string => {
  const candidates = raw.match(/\+?54[\d\s-]{8,}|\b15[\d\s-]{6,}|\b\d{2,4}[\s.-]?\d{6,}\b/gi);
  if (candidates) {
    for (const c of candidates) {
      const d = c.replace(/\D/g, '');
      if (d.length >= 8) return d.startsWith('54') ? d : d.replace(/^0+/, '') || d;
    }
  }
  const all = (raw.match(/\d/g) || []).join('');
  if (all.length >= 8) {
    if (all.length >= 10 && !all.startsWith('54')) return all.slice(-10);
    return all;
  }
  return '';
};

function splitLabeled(line: string): { key: string; value: string } | null {
  const m = line.match(/^\s*([^:.\-–—]+?)\s*[:.\-–—]\s*(.+)$/u);
  if (!m) return null;
  return { key: m[1].trim().toLowerCase(), value: m[2].trim() };
}

function isLikelyPersonName(value: string): boolean {
  const v = value.replace(/^nombre( con el que recibe( el pedido)?)?\s*[:.]\s*/i, '').trim();
  if (v.length < 2) return false;
  if (EMAIL_RE.test(v)) return false;
  if (/^[\d\s-+]+$/.test(v)) return false;
  if (matchProvinceInLine(v)) return false;
  if (looksLikeAddressLine(v)) return false;
  if (/^\d{4,5}$/.test(v.trim())) return false;
  const first = (v.split(/\s+/)[0] || '') as string;
  if (v.split(/\s+/).length === 1) {
    if (NOT_NAME_ALONE.has(normKey(first))) return false;
    if (first.length < 2) return false;
  }
  if (!/^[A-Za-zÁÉÍÓÚÑÜáéíóúñü'.\-]+(\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü'.\-]+)*$/u.test(v)) return false;
  return true;
}

function normalizeKeyLabel(k: string): string {
  return k
    .replace(/^e-?mail$/, 'email')
    .replace(/^(cód\.?\s*postal|cod\.?\s*postal|cp|codigo\s*postal)$/, 'cp')
    .replace(/^(núm\.?\s*de\s*tel[ée]fono|telefono|teléfono|tel|cel|celular|whatsapp|movil)$/, 'telefono')
    .replace(/^(localidad|ciudad|barrio|partido)$/, 'localidad')
    .replace(/^(domicilio|dirección|direccion|calle|sucursal|entre)$/, 'domicilio')
    .replace(/^provincia$/, 'provincia')
    .replace(/^(nombre( con el que recibe( el pedido)?)?|destinatario|receptor)$/, 'nombre');
}

export function parseShippingText(rawText: string): ParsedShippingData {
  const out: ParsedShippingData = {
    fullName: '',
    province: '',
    locality: '',
    address: '',
    postalCode: '',
    email: rawText.match(EMAIL_RE)?.[0] ?? '',
    phone: extractPhone(rawText),
  };

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/^\(?(cel|celular|whatsapp|wsp|tel|telefono|phone)\)?\s*[:.]-?\s*/i, '').trim())
    .filter((l) => l.length > 0);

  const n = lines.length;
  const used = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    const pair = splitLabeled(lines[i]);
    if (!pair) continue;
    const k = normalizeKeyLabel(pair.key);
    if (k === 'email' && pair.value) {
      out.email = pair.value.match(EMAIL_RE)?.[0] || pair.value;
      used[i] = true;
    } else if (k === 'cp' && pair.value) {
      const cp = pair.value.match(/\b\d{4,5}\b/)?.[0];
      if (cp) {
        out.postalCode = cp;
        used[i] = true;
      }
    } else if (k === 'telefono' && pair.value) {
      out.phone = extractPhone(pair.value) || out.phone;
      used[i] = true;
    } else if (k === 'localidad' && pair.value) {
      out.locality = pair.value;
      used[i] = true;
    } else if ((k === 'domicilio' || k === 'calle' || k === 'sucursal') && pair.value) {
      out.address = pair.value;
      used[i] = true;
    } else if (k === 'provincia' && pair.value) {
      const p = matchProvinceInLine(pair.value);
      if (p) {
        out.province = p.display;
        used[i] = true;
      }
    } else if (k === 'nombre' && pair.value) {
      out.fullName = pair.value.trim();
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    if (EMAIL_RE.test(lines[i])) {
      out.email = out.email || (lines[i].match(EMAIL_RE)?.[0] ?? '');
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const t = lines[i].trim();
    if (/^(AR-?)?\d{4,5}(-[A-Z]{1,3})?$/i.test(t.replace(/\s/g, ''))) {
      out.postalCode = t.match(/\d{4,5}/)?.[0] || out.postalCode;
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const t = lines[i].trim();
    if (matchProvinceInLine(t)) {
      out.province = matchProvinceInLine(t)!.display;
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    if (looksLikeAddressLine(lines[i])) {
      if (!out.address) out.address = lines[i].trim();
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const t = lines[i].trim();
    if (t.length < 2) continue;
    if (EMAIL_RE.test(t)) continue;
    if (/^\d{4,5}$/.test(t)) {
      if (!out.postalCode) out.postalCode = t;
      used[i] = true;
      continue;
    }
    const pOnly = t.replace(/\D/g, '');
    if (pOnly.length >= 8 && looksLikeAddressLine(t) === false) {
      if (/^\D*\d/.test(t)) {
        out.phone = extractPhone(t) || pOnly;
        used[i] = true;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    if (isLikelyPersonName(lines[i]) && !out.fullName) {
      out.fullName = lines[i].replace(/^nombre( con el que recibe( el pedido)?)?\s*[:.]\s*/i, '').trim();
      used[i] = true;
    }
  }

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const t = lines[i].trim();
    if (t.length < 1 || t.length > 50) continue;
    if (EMAIL_RE.test(t)) continue;
    if (matchProvinceInLine(t)) continue;
    if (looksLikeAddressLine(t)) continue;
    if (isLikelyPersonName(t)) continue;
    if (!out.locality) {
      out.locality = t;
      used[i] = true;
    }
  }

  if (!out.postalCode) {
    for (const line of lines) {
      const m = line.match(/\b\d{4,5}\b/);
      if (m) {
        out.postalCode = m[0]!;
        break;
      }
    }
  }
  if (!out.phone) out.phone = extractPhone(rawText);
  if (!out.email) out.email = rawText.match(EMAIL_RE)?.[0] ?? '';

  return out;
}
