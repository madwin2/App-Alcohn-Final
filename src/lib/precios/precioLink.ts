/** Precio por link de pago: +15 % sobre transferencia, en pesos enteros. */
export function precioLinkDesdeTransferencia(ars: number): number {
  const n = Number(ars);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1.15);
}
