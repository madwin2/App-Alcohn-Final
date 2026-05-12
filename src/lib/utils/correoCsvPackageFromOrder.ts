import type { ItemType, StampType } from '@/lib/types';

/** Fila MiCorreo: largo, ancho, altura (cm), peso (kg). */
export type CorreoCsvPaquete = {
  largo: string;
  ancho: string;
  altura: string;
  peso: string;
};

const DEFAULT_PAQUETE: CorreoCsvPaquete = {
  largo: '25',
  ancho: '8',
  altura: '8',
  peso: '0.5',
};

const SOLDADOR_PAQUETE: CorreoCsvPaquete = {
  largo: '40',
  ancho: '15',
  altura: '20',
  peso: '1',
};

const ABECEDARIO_PAQUETE: CorreoCsvPaquete = {
  largo: '25',
  ancho: '13',
  altura: '13',
  peso: '1',
};

function isAbecedarioItem(item: { itemType?: ItemType; stampType?: StampType }): boolean {
  return item.itemType === 'ABECEDARIO' || item.stampType === 'ABC';
}

/** Líneas que cuentan como «sello» para la regla de 2+ sellos → peso 1. */
function isSelloLineItem(item: { itemType?: ItemType; stampType?: StampType }): boolean {
  if (item.stampType === 'ABC') return false;
  const t = item.itemType ?? 'SELLO';
  return t === 'SELLO';
}

/**
 * Peso y medidas declarados en el CSV Masiva Correo según contenido del pedido.
 * Prioridad de medidas: soldador, luego abecedario o base aluminio, sino default; el peso sube a 1 si aplica cualquier regla.
 */
export function resolveCorreoCsvPaqueteFromOrderItems(
  items: Array<{ itemType?: ItemType; stampType?: StampType }>,
): CorreoCsvPaquete {
  const hasSoldador = items.some((i) => i.itemType === 'SOLDADOR');
  const hasAbecedario = items.some(isAbecedarioItem);
  const hasBaseAluminio = items.some((i) => i.itemType === 'BASE_REMACHADORA');
  const sellosCount = items.filter(isSelloLineItem).length;

  let pkg: CorreoCsvPaquete;

  if (hasSoldador) {
    pkg = { ...SOLDADOR_PAQUETE };
  } else if (hasAbecedario || hasBaseAluminio) {
    pkg = { ...ABECEDARIO_PAQUETE };
  } else {
    pkg = { ...DEFAULT_PAQUETE };
  }

  const pesoUnKg =
    hasSoldador || hasAbecedario || hasBaseAluminio || sellosCount >= 2;

  if (pesoUnKg) {
    return { ...pkg, peso: '1' };
  }

  return pkg;
}
