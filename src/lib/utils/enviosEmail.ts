/** Email por defecto en plantilla Correo cuando el cliente no tiene mail cargado ni en el texto. */
export const ENVIO_EMAIL_FALLBACK = 'alcohn.cnc@gmail.com';

const norm = (value: string | null | undefined) => (value || '').trim();

const isFallbackEmail = (email: string) => norm(email).toLowerCase() === ENVIO_EMAIL_FALLBACK.toLowerCase();

/**
 * Email para datos de envío / CSV Correo:
 * 1) mail del cliente en el sistema
 * 2) mail detectado en el texto pegado
 * 3) fallback Alcohn (solo envío, no persistir en `clientes`)
 */
export function resolveEnvioEmail(params: {
  customerEmail?: string | null;
  parsedEmail?: string | null;
}): string {
  const customer = norm(params.customerEmail);
  if (customer) return customer;
  const parsed = norm(params.parsedEmail);
  if (parsed) return parsed;
  return ENVIO_EMAIL_FALLBACK;
}

/** Mail a guardar en `clientes` al cargar envío (nunca el fallback). */
export function emailToPersistOnCliente(params: {
  customerEmail?: string | null;
  parsedEmail?: string | null;
}): string | null {
  if (norm(params.customerEmail)) return null;
  const parsed = norm(params.parsedEmail);
  if (!parsed || isFallbackEmail(parsed)) return null;
  return parsed;
}
