import type { ZoneKind, ZoneSeverity } from './analyze';
import type { FresaGroup } from './engine';
import type { FresaReport, FresaSizeSource } from './chequeoFresa';

/** 0.334 → "0,33" */
export function mm(v: number, decimals = 2): string {
  return v.toFixed(decimals).replace('.', ',');
}

export const KIND_LABEL: Record<ZoneKind, string> = {
  hueco_cerrado: 'Hueco que se tapa',
  paso_angosto: 'Partes muy juntas',
  rincon: 'Rincón o ranura angosta',
};

export const KIND_HELP: Record<ZoneKind, string> = {
  hueco_cerrado:
    'Un blanco encerrado (como el ojo de una letra) más chico que la fresa: queda poco profundo y en el cuero se ve tapado.',
  paso_angosto:
    'El espacio entre dos partes del diseño (por ejemplo, dos letras) es más angosto que la fresa: no se separan bien.',
  rincon:
    'Una ranura o rincón dentro de una misma pieza. La fresa cónica lo redondea; si es chico suele aceptarse.',
};

export const SEVERITY_LABEL: Record<ZoneSeverity, string> = {
  alta: 'No llega',
  media: 'Llega poco',
  baja: 'Rincón chico',
};

/** Clases de color por gravedad (chip/punto). */
export const SEVERITY_DOT: Record<ZoneSeverity, string> = {
  alta: 'bg-rose-500',
  media: 'bg-amber-500',
  baja: 'bg-slate-400',
};

/** Colores de relleno de las zonas en el visor. */
export const SEVERITY_FILL: Record<ZoneSeverity, string> = {
  alta: '#e11d48',
  media: '#f59e0b',
  baja: '#64748b',
};

export const SIZE_SOURCE_LABEL: Record<FresaSizeSource, string> = {
  fabricacion: 'medida de fabricación',
  pedida: 'medida pedida',
  sugerida: 'medida sugerida (falta confirmarla)',
  escala: 'misma escala que el original',
  declarada: 'medida del archivo',
};

export function groupTitle(g: FresaGroup): string {
  if (g.kinds.length === 1) return KIND_LABEL[g.kinds[0]];
  if (g.kinds.includes('hueco_cerrado')) return KIND_LABEL.hueco_cerrado;
  if (g.kinds.includes('paso_angosto')) return KIND_LABEL.paso_angosto;
  return KIND_LABEL.rincon;
}

export function groupDetail(g: FresaGroup, minDepthMm: number): string {
  const depth = g.reachDepthMm <= 0.01 ? 'casi no entra' : `llega a ≈${mm(g.reachDepthMm)} de ${mm(minDepthMm)} mm`;
  return `Hueco ≈${mm(g.gapWidthMm)} mm · ${depth}`;
}

/** Línea de criterio para mostrar arriba del visor. */
export function criterioTexto(r: FresaReport): string {
  const p = r.profile;
  const minGap = r.check?.minGapMm ?? 0;
  return `${p.label} · para llegar a ${mm(p.minDepthMm, 1)} mm el blanco necesita al menos ${mm(minGap)} mm de ancho`;
}
