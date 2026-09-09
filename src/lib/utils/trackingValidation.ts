import type { ShippingCarrier } from '@/lib/types/index';

const CARRIER_LABELS: Record<ShippingCarrier, string> = {
  ANDREANI: 'Andreani',
  CORREO_ARGENTINO: 'Correo Argentino',
  VIA_CARGO: 'Vía Cargo',
  OTRO: 'Otro',
  RETIRO_EN_PERSONA: 'Retiro en Persona',
};

/** Prefijos conocidos que permiten detectar empresa desde el número de seguimiento. */
export function detectCarrierFromTracking(value: string): ShippingCarrier | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('3600')) return 'ANDREANI';
  if (cleaned.startsWith('000')) return 'CORREO_ARGENTINO';
  return null;
}

export function trackingMatchesCarrier(
  value: string,
  carrier: ShippingCarrier | null | undefined,
): boolean {
  const detected = detectCarrierFromTracking(value);
  if (!detected) return true; // número genérico/desconocido → sin conflicto
  if (!carrier || carrier === 'OTRO' || carrier === 'RETIRO_EN_PERSONA' || carrier === 'VIA_CARGO') {
    // Si la empresa actual no tiene prefijo propio, cualquier prefijo conocido es conflicto
    return false;
  }
  return detected === carrier;
}

export function hasTrackingCarrierConflict(
  value: string,
  carrier: ShippingCarrier | null | undefined,
): boolean {
  const detected = detectCarrierFromTracking(value);
  if (!detected) return false;
  if (!carrier) return true;
  return detected !== carrier;
}

export function carrierDisplayLabel(carrier: ShippingCarrier | null | undefined): string {
  if (!carrier) return 'sin empresa';
  return CARRIER_LABELS[carrier] ?? carrier;
}

export function trackingPrefixHint(value: string): string {
  const cleaned = value.trim();
  if (cleaned.startsWith('3600')) return '3600';
  if (cleaned.startsWith('000')) return '000';
  return cleaned.slice(0, 4) || '—';
}
