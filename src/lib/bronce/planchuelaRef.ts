/** Código de referencia en BD (sellos.tipo_planchuela / bronce_consumo.tipo_planchuela_ref). */
export type PlanchuelaRef = 12 | 19 | 25 | 38 | 63;

/** Medida real de la planchuela en mm (para mostrar en UI). */
export const PLANCHUELA_REF_REAL_MM: Record<PlanchuelaRef, number> = {
  12: 12,
  19: 20,
  25: 25,
  38: 40,
  63: 63,
};

export const PLANCHUELA_REF_ORDER: PlanchuelaRef[] = [12, 19, 25, 38, 63];

export function planchuelaRefLabel(ref: PlanchuelaRef): string {
  return `${PLANCHUELA_REF_REAL_MM[ref]} mm`;
}

export function isPlanchuelaRef(value: number): value is PlanchuelaRef {
  return PLANCHUELA_REF_ORDER.includes(value as PlanchuelaRef);
}
