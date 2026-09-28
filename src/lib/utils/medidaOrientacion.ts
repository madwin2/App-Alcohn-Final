/**
 * Convención Alcohn / producción: las medidas se expresan siempre como
 * lado más largo × lado más corto, sin importar la orientación del diseño.
 */

export function ordenMedidaLargoCorto(a: number, b: number): { largo: number; corto: number } {
  return { largo: Math.max(a, b), corto: Math.min(a, b) };
}

/** `widthMm` = lado largo, `heightMm` = lado corto. */
export function ordenMedidaLargoCortoMm(
  widthMm: number,
  heightMm: number,
): { widthMm: number; heightMm: number } {
  return {
    widthMm: Math.max(widthMm, heightMm),
    heightMm: Math.min(widthMm, heightMm),
  };
}
