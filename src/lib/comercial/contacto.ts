/** Claves en mockup_solicitudes.metadata_web para contacto comercial automático. */
export const CONTACTO_COMERCIAL_ELIGIBLE_KEY = 'contacto_comercial_eligible_at';
export const CONTACTO_COMERCIAL_ENVIADO_KEY = 'contacto_comercial_enviado_at';
export const CONTACTO_COMERCIAL_TIPO_KEY = 'contacto_comercial_tipo';

export const COMERCIAL_CONTACTO_WEBHOOK_TIPO = 'generador_muestras_contacto' as const;

export type ContactoComercialEstado = 'sin_programar' | 'programado' | 'enviado';

export function resolveContactoComercialEstado(
  meta: Record<string, unknown> | null | undefined,
): ContactoComercialEstado {
  if (meta?.[CONTACTO_COMERCIAL_ENVIADO_KEY]) return 'enviado';
  if (meta?.[CONTACTO_COMERCIAL_ELIGIBLE_KEY]) return 'programado';
  return 'sin_programar';
}

export function contactoComercialEstadoLabel(estado: ContactoComercialEstado): string {
  switch (estado) {
    case 'enviado':
      return 'Contactado';
    case 'programado':
      return 'Programado';
    default:
      return 'Sin enviar';
  }
}
