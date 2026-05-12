/**
 * Cotización de sellos rectangulares: reglas en **cm** (planchuelas / umbrales) y catálogo Supabase (precios_* en cm).
 *
 * En pedidos, `requestedWidthMm` / `requestedHeightMm` son **milímetros**; se convierten a cm con `/10` para cotizar.
 * El parseo del campo de texto de medida es en **mm** (como siempre en la app).
 */

import { normalizarMedidaMm, claveMedidaMm, parseNumDb } from '@/lib/precios/preciosDims';
import { resolverPrecioSelloRectangular, type PreciosResolverInput, type SelloGrupoCodigo } from '@/lib/precios/resolverPrecioSello';
import { SEED_MEDIDAS_GRUPO } from '@/lib/precios/preciosSeedData';

const EPS = 1e-4;

/** Entre 2 y 2,5 cm de altura (excl. 2, incl. hacia 2,5) cotizamos como 2,5 cm (grilla de planchuela). */
export function reglaAlturaEntre2y25Cm(largoCm: number): number {
  if (largoCm > 2 + EPS && largoCm < 2.5 - EPS) return 2.5;
  return largoCm;
}

/**
 * Regla ancho ~5 cm: 5×1 chico vs 5×2 mediano — entre 1 y 1,3 cm de altura queda en línea 1;
 * desde 1,3 hasta &lt;2 cm se toma la línea 2.
 */
export function reglaAnchoCincoCm(anchoCm: number, largoCm: number): { ancho: number; largo: number } {
  let a = anchoCm;
  let l = largoCm;
  if (Math.abs(a - 5) > 0.06) return { ancho: a, largo: l };
  if (l > 1 + EPS && l < 1.3 - EPS) l = 1;
  else if (l >= 1.3 - EPS && l < 2 - EPS) l = 2;
  return { ancho: a, largo: l };
}

export function normalizarMedidaPlanchuelaCm(anchoCm: number, largoCm: number): { ancho: number; largo: number } {
  let { ancho: a, largo: l } = normalizarMedidaMm(anchoCm, largoCm);
  const r5 = reglaAnchoCincoCm(a, l);
  a = r5.ancho;
  l = r5.largo;
  l = reglaAlturaEntre2y25Cm(l);
  return normalizarMedidaMm(a, l);
}

const L_LINE_TOL = 0.18;

function seedsMismaLineaLargo(lObjetivo: number): typeof SEED_MEDIDAS_GRUPO {
  const largosUniq = [...new Set(SEED_MEDIDAS_GRUPO.map((s) => s.largo))].sort((x, y) => x - y);
  let bestL = largosUniq[0]!;
  let bestD = Infinity;
  for (const L of largosUniq) {
    const d = Math.abs(L - lObjetivo);
    if (d < bestD) {
      bestD = d;
      bestL = L;
    }
  }
  if (bestD > L_LINE_TOL) return [];
  return SEED_MEDIDAS_GRUPO.filter((s) => Math.abs(s.largo - bestL) < 1e-3);
}

/** Si no hay clave exacta en BD: misma “línea” de largo que la tabla y ancho máximo semilla ≤ medida. */
export function inferirGrupoPorSemillas(anchoCm: number, largoCm: number): SelloGrupoCodigo | null {
  const col = seedsMismaLineaLargo(largoCm);
  if (col.length === 0) return null;
  const candidates = col.filter((s) => s.ancho <= anchoCm + 1e-3);
  if (candidates.length) {
    const best = candidates.reduce((m, s) => (s.ancho > m.ancho ? s : m));
    return best.grupo_codigo as SelloGrupoCodigo;
  }
  const up = col.filter((s) => s.ancho >= anchoCm - 1e-3);
  if (up.length) {
    const best = up.reduce((m, s) => (s.ancho < m.ancho ? s : m));
    return best.grupo_codigo as SelloGrupoCodigo;
  }
  return null;
}

function grupoPorSemillaMasCercana2D(anchoCm: number, largoCm: number): SelloGrupoCodigo | null {
  let best: SelloGrupoCodigo | null = null;
  let bestD = Infinity;
  for (const s of SEED_MEDIDAS_GRUPO) {
    const d = Math.abs(s.ancho - anchoCm) + Math.abs(s.largo - largoCm);
    if (d < bestD) {
      bestD = d;
      best = s.grupo_codigo as SelloGrupoCodigo;
    }
  }
  return bestD <= 0.55 ? best : null;
}

export type CotizacionSelloRectangular = {
  precioTransferencia: number;
  /** Texto corto para depuración / UI */
  detalle: string;
};

/**
 * Precio transferencia para sello clásico rectangular (cm), usando catálogo ya cargado.
 */
export function cotizarSelloRectangularCm(
  anchoCm: number,
  largoCm: number,
  input: PreciosResolverInput,
): CotizacionSelloRectangular | null {
  if (!Number.isFinite(anchoCm) || !Number.isFinite(largoCm) || anchoCm <= 0 || largoCm <= 0) return null;

  const { ancho: as, largo: ls } = normalizarMedidaPlanchuelaCm(anchoCm, largoCm);

  const exact = resolverPrecioSelloRectangular(as, ls, input);
  if (exact) {
    return {
      precioTransferencia: exact.precioTransferencia,
      detalle:
        exact.fuente === 'MEDIDA_FIJA'
          ? `Fija ${claveMedidaMm(as, ls)} cm`
          : `Grupo ${exact.grupoCodigo} (${claveMedidaMm(as, ls)} cm)`,
    };
  }

  const g1 = inferirGrupoPorSemillas(as, ls);
  if (g1) {
    const t = Math.round(Number(input.precioTransferenciaPorGrupo[g1]) || 0);
    return {
      precioTransferencia: t,
      detalle: `Grupo ${g1} (tabla ${claveMedidaMm(as, ls)} cm)`,
    };
  }

  const g2 = grupoPorSemillaMasCercana2D(as, ls);
  if (g2) {
    const t = Math.round(Number(input.precioTransferenciaPorGrupo[g2]) || 0);
    return {
      precioTransferencia: t,
      detalle: `Grupo ${g2} (aprox. ${claveMedidaMm(as, ls)} cm)`,
    };
  }

  return null;
}

/** Parse "40×40", "35,5×25" o "40" (cuadrado) en **milímetros** → `requestedWidthMm` / `requestedHeightMm`. */
export function parseMedidaMmAString(raw: string): { anchoMm: number; altoMm: number } | null {
  const t = raw.trim().replace(/,/g, '.').replace(/\s/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(?:[xX×](\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const wMm = parseFloat(m[1]);
  const hMm = m[2] !== undefined ? parseFloat(m[2]) : wMm;
  if (!Number.isFinite(wMm) || !Number.isFinite(hMm) || wMm <= 0 || hMm <= 0) return null;
  return {
    anchoMm: Math.max(1, Math.round(wMm)),
    altoMm: Math.max(1, Math.round(hMm)),
  };
}

export function mmPedidoAcm(anchoMm: number, altoMm: number): { anchoCm: number; altoCm: number } {
  return {
    anchoCm: parseNumDb(anchoMm) / 10,
    altoCm: parseNumDb(altoMm) / 10,
  };
}
