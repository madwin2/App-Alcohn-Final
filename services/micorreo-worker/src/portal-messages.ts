/** Líneas de navegación / UI de MiCorreo que no son el mensaje útil. */
const BOILERPLATE_LINE = [
  /^nuevo env[ií]o$/i,
  /^hola,/i,
  /^mi cuenta$/i,
  /^individual$/i,
  /^masivo$/i,
  /^paqueter[ií]a$/i,
  /^carg[aá] tu env[ií]o/i,
  /^paso \d/i,
  /^plantilla de datos$/i,
  /^subir$/i,
  /^eliminar$/i,
  /^o arrastr[aá]/i,
  /^c[oó]digos de provincias/i,
  /^instructivo/i,
  /^carga_correo_/i,
  /^\.csv$/i,
  /^última actualizaci[oó]n/i,
  /^\[PAGO\]/i,
  /^\[GUARDAR\]/i,
];

/** Inicio del resumen del envío (ya no es el error del CSV). */
const SUMMARY_SECTION_LINE = [
  /^resumen$/i,
  /^origen$/i,
  /^destino$/i,
  /^editar$/i,
  /^carga de datos$/i,
  /^nombre y apellido/i,
  /^raz[oó]n social$/i,
  /^direcci[oó]n$/i,
  /^cantidad de env[ií]os$/i,
  /^tipo de env[ií]o$/i,
  /^medio de pago$/i,
  /^peso$/i,
  /^dimensiones$/i,
  /^valor declarado$/i,
];

const CSV_ERROR_HEADER = /el archivo contiene errores/i;

function isBoilerplateLine(line: string): boolean {
  return BOILERPLATE_LINE.some((re) => re.test(line.trim()));
}

function isSummarySectionLine(line: string): boolean {
  return SUMMARY_SECTION_LINE.some((re) => re.test(line.trim()));
}

function isErrorDetailLine(line: string): boolean {
  if (CSV_ERROR_HEADER.test(line)) return true;
  if (/\(Fila \d+\)/i.test(line)) return true;
  return /incorrecto|inv[aá]lid|verifique|ingrese|debe contener|obligatorio|no v[aá]lid|tel[eé]fono|sucursal|provincia|c[oó]digo postal|cp\b|correo electr|email|calle|altura/i.test(
    line,
  );
}

function collectCsvErrorLines(text: string): string[] {
  const archivoIdx = text.search(CSV_ERROR_HEADER);
  if (archivoIdx < 0) return [];

  const lines = text
    .slice(archivoIdx)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const collected: string[] = [];
  for (const line of lines) {
    if (collected.length > 0 && (isBoilerplateLine(line) || isSummarySectionLine(line))) break;
    if (collected.length > 0 && !isErrorDetailLine(line)) break;
    collected.push(line);
  }

  return collected;
}

/**
 * Reduce el innerText completo de MiCorreo al mensaje que debe ver el operador.
 */
export function extractMicorreoPortalMessage(rawText: string): string {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const csvLines = collectCsvErrorLines(text);
  if (csvLines.length) {
    return csvLines.join('\n');
  }

  const detalleMatch = text.match(/visualiza el detalle:\s*\n?\s*([^\n]+)/i);
  if (detalleMatch?.[1]) {
    const detail = detalleMatch[1].trim();
    if (detail.length > 0 && detail.length < 300 && isErrorDetailLine(detail)) {
      return `El archivo contiene errores, a continuación se visualiza el detalle:\n${detail}`;
    }
  }

  const filaLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && /\(Fila \d+\)/i.test(l) && isErrorDetailLine(l));
  if (filaLines.length) {
    return `El archivo contiene errores:\n${filaLines.join('\n')}`;
  }

  for (const pattern of [
    /importaci[oó]n se realiz[oó] con [ée]xito\.?/i,
    /env[ií]os procesados con [ée]xito\.?/i,
    /etiqueta guardada en micorreo\. falta pagarla con saldo\.?/i,
    /saldo disponible insuficiente en micorreo\.?/i,
    /no se pudo habilitar el bot[oó]n pagar en micorreo\.?/i,
  ]) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  const meaningful = text
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 12 &&
        l.length <= 280 &&
        !isBoilerplateLine(l) &&
        !isSummarySectionLine(l) &&
        isErrorDetailLine(l),
    );
  if (meaningful.length) return meaningful.join('\n');

  if (text.length > 400) {
    return 'MiCorreo rechazó el envío. Revisá los datos del pedido.';
  }

  return text.slice(0, 400);
}
