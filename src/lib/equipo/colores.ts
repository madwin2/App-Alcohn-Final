/** Paleta fija de 10 colores bien distintos para el corcho y el calendario del equipo. */
export const COLORES_EQUIPO = [
  '#EF4444', // rojo
  '#F97316', // naranja
  '#EAB308', // amarillo
  '#22C55E', // verde
  '#14B8A6', // teal
  '#3B82F6', // azul
  '#8B5CF6', // violeta
  '#EC4899', // rosa
  '#78716C', // piedra
  '#0EA5E9', // cielo
] as const;

export type ColorEquipo = (typeof COLORES_EQUIPO)[number];

export const COLOR_EQUIPO_DEFAULT = '#9CA3AF';

export function esColorValido(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/** Devuelve true si otro integrante activo ya usa ese color (comparación case-insensitive). */
export function colorYaUsado(
  color: string,
  usadosPorOtros: string[],
): boolean {
  const target = color.toLowerCase();
  return usadosPorOtros.some((c) => c.toLowerCase() === target);
}
