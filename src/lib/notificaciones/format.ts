import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function shortPedidoId(ordenId: string | null | undefined): string {
  if (!ordenId) return '';
  return ordenId.replace(/-/g, '').slice(0, 8);
}

export function clienteNombreFromParts(
  nombre: string | null | undefined,
  apellido: string | null | undefined,
): string {
  const full = `${nombre ?? ''} ${apellido ?? ''}`.trim();
  return full || 'Cliente';
}

export function formatRelativeEs(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'ahora';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'ayer';
  if (diffD < 7) return `hace ${diffD} días`;
  return format(date, 'd MMM', { locale: es });
}

export function joinCampos(campos: string[]): string {
  if (campos.length === 0) return '';
  if (campos.length === 1) return campos[0];
  if (campos.length === 2) return `${campos[0]} y ${campos[1]}`;
  return `${campos.slice(0, -1).join(', ')} y ${campos[campos.length - 1]}`;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && (b == null || b === '')) return true;
  if (b == null && (a == null || a === '')) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (String(a).trim() !== '' && String(b).trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return na === nb;
  }
  return String(a) === String(b);
}

export function selloEnCurso(estado: string | null | undefined): boolean {
  return Boolean(estado) && estado !== 'Sin Hacer';
}

export function formatMoneyArs(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
