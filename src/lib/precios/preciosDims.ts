/** Normaliza medidas en mm para claves estables (4 decimales). */
export function normalizarMedidaMm(ancho: number, largo: number): { ancho: number; largo: number } {
  const ra = Math.round(ancho * 1e4) / 1e4;
  const rl = Math.round(largo * 1e4) / 1e4;
  return { ancho: ra, largo: rl };
}

export function claveMedidaMm(ancho: number, largo: number): string {
  const { ancho: a, largo: l } = normalizarMedidaMm(ancho, largo);
  return `${a}:${l}`;
}

export function etiquetaMedidaFila(ancho: number, largo: number, etiqueta: string | null): string {
  if (etiqueta) return etiqueta;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n));
  return `${fmt(ancho)}×${fmt(largo)}`;
}

export function parseNumDb(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
