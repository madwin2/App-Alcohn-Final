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

function isBoilerplateLine(line: string): boolean {
  return BOILERPLATE_LINE.some((re) => re.test(line.trim()));
}

function collectCsvErrorLines(text: string): string[] {
  const archivoIdx = text.search(/el archivo contiene errores/i);
  if (archivoIdx < 0) return [];

  const lines = text
    .slice(archivoIdx)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const collected: string[] = [];
  for (const line of lines) {
    if (collected.length > 0 && isBoilerplateLine(line)) break;
    collected.push(line);
    if (collected.length > 12) break;
  }

  return collected.filter((line) => !isBoilerplateLine(line) || /archivo contiene errores/i.test(line));
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

  const detalleMatch = text.match(
    /visualiza el detalle:\s*\n?\s*([^\n]+)/i,
  );
  if (detalleMatch?.[1]) {
    const detail = detalleMatch[1].trim();
    if (detail.length > 0 && detail.length < 300 && !isBoilerplateLine(detail)) {
      return `El archivo contiene errores, a continuación se visualiza el detalle:\n${detail}`;
    }
  }

  const filaLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && /\(Fila \d+\)/i.test(l) && !isBoilerplateLine(l));
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
        /error|inv[aá]lid|fila|tel[eé]fono|sucursal|provincia|cp\b|c[oó]digo postal|correo electr|email|obligatorio|rechaz|no se pudo|verifique|ingrese/i.test(
          l,
        ),
    );
  if (meaningful.length) return meaningful.join('\n');

  if (text.length > 400) {
    return 'MiCorreo rechazó el envío. Revisá los datos del pedido.';
  }

  return text.slice(0, 400);
}
