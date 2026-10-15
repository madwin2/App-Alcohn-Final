import type { ZoneKind, ZoneSeverity } from './analyze';
import type { FresaGroup } from './engine';
import type { FresaReport, FresaSizeSource } from './chequeoFresa';
import type { FixOperation } from './fix';

/** 0.334 → "0,33" */
export function mm(v: number, decimals = 2): string {
  return v.toFixed(decimals).replace('.', ',');
}

export const KIND_LABEL: Record<ZoneKind, string> = {
  hueco_cerrado: 'Hueco que se tapa',
  paso_angosto: 'Letras que se pegan',
  rincon: 'Rincón o ranura angosta',
  angulo: 'Ángulo',
};

export const KIND_HELP: Record<ZoneKind, string> = {
  hueco_cerrado:
    'Un blanco encerrado (como el ojo de una letra) donde la fresa no baja a la profundidad mínima en ningún lado: en el sello se ve tapado.',
  paso_angosto:
    'Entre dos partes del diseño (por ejemplo, dos letras) hay un tramo donde la fresa sube por encima de la profundidad mínima: ahí se pegan. Que el resto del canal sea poco hondo no importa; importa este tramo.',
  rincon:
    'Una ranura o rincón dentro de una misma pieza. La fresa sube y lo marca menos hondo, y eso está bien. Se avisa solo si la fresa casi no entra.',
  angulo:
    'Un ángulo que se cierra en punta (el interior de la M, la V). La fresa sube y la punta igual lo marca: no hace falta corregirlo.',
};

export const SEVERITY_LABEL: Record<ZoneSeverity, string> = {
  alta: 'Hay que corregir',
  media: 'Se pierde el detalle',
  baja: 'Marca menos hondo · OK',
};

/** Colores del mapa de profundidad (de "no se saca" a "casi la mínima"). */
export const DEPTH_BAND_FILL = ['#1e3a8a', '#2563eb', '#60a5fa', '#bfdbfe'];

export function depthBandLabel(fromMm: number, toMm: number): string {
  if (toMm <= 0) return 'No se saca';
  return `${mm(fromMm)}–${mm(toMm)} mm`;
}

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
  if (g.kinds.includes('rincon')) return KIND_LABEL.rincon;
  return KIND_LABEL.angulo;
}

export function groupDetail(g: FresaGroup, minDepthMm: number): string {
  const depth =
    g.reachDepthMm <= 0.01 ? 'la fresa casi no entra' : `baja a ≈${mm(g.reachDepthMm)} mm (mínimo ${mm(minDepthMm)})`;
  return `Hueco ≈${mm(g.gapWidthMm)} mm · ${depth}`;
}

/** Qué hizo la corrección, en una frase ("Se separaron 8 letras (0,14–0,26 mm)."). */
export function resumenOperaciones(ops: FixOperation[]): string {
  if (!ops.length) return 'No se encontró una forma de corregir sin cambiar el diseño.';
  const parts: string[] = [];
  const esp = ops.filter((o) => o.kind === 'espaciar');
  if (esp.length) {
    const hi = Math.max(...esp.map((o) => o.mm));
    const arcos = esp.filter((o) => o.axis === 'arco').length;
    const renglones = esp.length - arcos;
    const que = [
      renglones ? (renglones === 1 ? '1 renglón' : `${renglones} renglones`) : '',
      arcos ? (arcos === 1 ? '1 texto en arco' : `${arcos} textos en arco`) : '',
    ]
      .filter(Boolean)
      .join(' y ');
    parts.push(`se abrió el espaciado de ${que} (hasta ${mm(hi)} mm entre letras)`);
  }
  const sep = ops.filter((o) => o.kind === 'separar');
  if (sep.length) {
    const lo = Math.min(...sep.map((o) => o.mm));
    const hi = Math.max(...sep.map((o) => o.mm));
    const rango = Math.abs(hi - lo) < 0.01 ? `${mm(lo)} mm` : `${mm(lo)}–${mm(hi)} mm`;
    parts.push(`se ${sep.length === 1 ? 'separó 1 letra' : `separaron ${sep.length} letras`} (${rango})`);
  }
  const acomp = ops.filter((o) => o.kind === 'acompanar').reduce((n, o) => n + (o.kind === 'acompanar' ? o.renglones : 0), 0);
  if (acomp) parts.push(`se ${acomp === 1 ? 'ensanchó 1 renglón' : `ensancharon ${acomp} renglones`} del mismo bloque para que quede parejo`);
  const ojos = ops.filter((o) => o.kind === 'agrandar_ojo').length;
  if (ojos) parts.push(`se ${ojos === 1 ? 'agrandó 1 ojo' : `agrandaron ${ojos} ojos`} de letra`);
  const ranuras = ops.filter((o) => o.kind === 'ensanchar').length;
  if (ranuras) parts.push(`se ${ranuras === 1 ? 'ensanchó 1 ranura' : `ensancharon ${ranuras} ranuras`}`);
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Línea de criterio para mostrar arriba del visor. */
export function criterioTexto(r: FresaReport): string {
  const p = r.profile;
  const minGap = r.check?.minGapMm ?? 0;
  return `${p.label} · V-carve: donde se angosta, la fresa sube. Entre letras y en los ojos tiene que bajar al menos ${mm(p.minDepthMm, 1)} mm (blanco de ${mm(minGap)} mm)`;
}
