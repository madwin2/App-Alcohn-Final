import type { Customer, NewOrderFormData } from '@/lib/types/index';

/**
 * Datos que manda la extensión de WhatsApp al abrir "Nuevo pedido" desde un
 * chat (`/extension/nuevo-pedido#d=...`). Van en el fragmento de la URL para
 * que no lleguen al servidor ni a los logs de Vercel.
 */
export interface PrefillExtension {
  telefono: string;
  nombre?: string;
  apellido?: string;
  email?: string;
}

type ClienteInicial = Partial<NewOrderFormData['customer']>;

const limpiar = (v: unknown, max = 120): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function base64UrlADecodificado(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Lee `#d=<base64url(JSON)>`. Devuelve null si no hay datos válidos. */
export function leerPrefillDeHash(hash: string): PrefillExtension | null {
  const m = /(?:^#|&)d=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const raw = JSON.parse(base64UrlADecodificado(m[1])) as Record<string, unknown>;
    const telefono = limpiar(raw.telefono, 20).replace(/\D/g, '');
    if (telefono.length < 8) return null;
    const email = limpiar(raw.email);
    return {
      telefono,
      nombre: limpiar(raw.nombre) || undefined,
      apellido: limpiar(raw.apellido) || undefined,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Datos del paso 1. Lo que ya tiene la app del cliente manda sobre lo que
 * viene del chat: el nombre de WhatsApp suele ser un apodo o tener emojis, y
 * al crear el pedido la app actualiza el cliente con lo que quede cargado.
 */
export function clienteInicialDesdePrefill(
  prefill: PrefillExtension,
  existente: Pick<Customer, 'firstName' | 'lastName' | 'email' | 'phoneE164'> | null,
): ClienteInicial {
  return {
    firstName: existente?.firstName?.trim() || prefill.nombre || '',
    lastName: existente?.lastName?.trim() || prefill.apellido || '',
    email: existente?.email?.trim() || prefill.email || '',
    phoneE164: prefill.telefono,
    channel: 'WHATSAPP',
  };
}
