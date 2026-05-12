import { precioLinkDesdeTransferencia } from '@/lib/precios/precioLink';
import { claveMedidaMm, normalizarMedidaMm } from '@/lib/precios/preciosDims';

export type SelloGrupoCodigo = 'chicos' | 'medianos' | 'grandes' | 'xl';

/** Entrada mínima para resolver precio de sello rectangular (pedidos, mockups). */
export type PreciosResolverInput = {
  precioTransferenciaPorGrupo: Record<SelloGrupoCodigo, number>;
  /** Clave `claveMedidaMm(ancho,largo)` → grupo */
  medidaAGrupo: Map<string, SelloGrupoCodigo>;
  /** Clave → precio fijo (pisa grupo) */
  precioTransferenciaPorMedidaFija: Map<string, number>;
};

export type PrecioSelloRectangularResuelto =
  | {
      fuente: 'MEDIDA_FIJA';
      ancho: number;
      largo: number;
      precioTransferencia: number;
      precioLink: number;
    }
  | {
      fuente: 'GRUPO';
      ancho: number;
      largo: number;
      grupoCodigo: SelloGrupoCodigo;
      tituloGrupo?: string;
      precioTransferencia: number;
      precioLink: number;
    };

/**
 * Resuelve precio de sello clásico rectangular: primero tabla de medidas fijas, si no, grupo por medida.
 */
export function resolverPrecioSelloRectangular(
  anchoMm: number,
  largoMm: number,
  input: PreciosResolverInput,
): PrecioSelloRectangularResuelto | null {
  const { ancho, largo } = normalizarMedidaMm(anchoMm, largoMm);
  const k = claveMedidaMm(ancho, largo);

  const fija = input.precioTransferenciaPorMedidaFija.get(k);
  if (fija !== undefined) {
    const t = Math.max(0, Math.round(fija));
    return {
      fuente: 'MEDIDA_FIJA',
      ancho,
      largo,
      precioTransferencia: t,
      precioLink: precioLinkDesdeTransferencia(t),
    };
  }

  const grupo = input.medidaAGrupo.get(k);
  if (!grupo) return null;

  const raw = input.precioTransferenciaPorGrupo[grupo];
  const t = Math.max(0, Math.round(Number(raw) || 0));
  return {
    fuente: 'GRUPO',
    ancho,
    largo,
    grupoCodigo: grupo,
    precioTransferencia: t,
    precioLink: precioLinkDesdeTransferencia(t),
  };
}
