import type { SelloGrupoCodigo } from '@/lib/precios/resolverPrecioSello';

export const PRECIOS_NOTA_DEFAULT =
  'Si se pasó un presupuesto con el valor anterior se respeta (dentro de los últimos 10 días).';

type GrupoDef = {
  codigo: SelloGrupoCodigo;
  titulo: string;
  medidas_resumen: string;
  precio_transferencia: number;
  orden: number;
};

export const SEED_GRUPOS: readonly GrupoDef[] = [
  {
    codigo: 'chicos',
    titulo: 'Sellos chicos',
    medidas_resumen:
      '1×1, 2×1, 3×1, 4×1, 5×1, 6×1, 7×1, 8×1, 2×2, 3×2, 4×2, 2.5×2.5, 3×2.5',
    precio_transferencia: 69500,
    orden: 1,
  },
  {
    codigo: 'medianos',
    titulo: 'Sellos medianos',
    medidas_resumen:
      '9×1, 5×2, 6×2, 7×2, 8×2, 4×2.5, 5×2.5, 6×2.5, 7×2.5, 3×3, 4×3, 5×3, 6×3, 4×4, 5×4',
    precio_transferencia: 83500,
    orden: 2,
  },
  {
    codigo: 'grandes',
    titulo: 'Sellos grandes',
    medidas_resumen: '9×2, 8×2.5, 9×2.5, 10×2.5, 10×2, 7×3, 8×3, 6×4, 7×4, 8×4',
    precio_transferencia: 98500,
    orden: 3,
  },
  {
    codigo: 'xl',
    titulo: 'Sellos XL',
    medidas_resumen: '9×3, 10×3, 9×4, 10×4, 5×5, 6×5, 7×5, 6×6, 7×6',
    precio_transferencia: 148500,
    orden: 4,
  },
] as const;

const L = (a: number, l: number, g: SelloGrupoCodigo) => ({ ancho: a, largo: l, grupo_codigo: g });

/** Medidas → grupo (fuente de verdad para autorrelleno y mockups). */
export const SEED_MEDIDAS_GRUPO = [
  L(1, 1, 'chicos'),
  L(2, 1, 'chicos'),
  L(3, 1, 'chicos'),
  L(4, 1, 'chicos'),
  L(5, 1, 'chicos'),
  L(6, 1, 'chicos'),
  L(7, 1, 'chicos'),
  L(8, 1, 'chicos'),
  L(2, 2, 'chicos'),
  L(3, 2, 'chicos'),
  L(4, 2, 'chicos'),
  L(2.5, 2.5, 'chicos'),
  L(3, 2.5, 'chicos'),
  L(9, 1, 'medianos'),
  L(5, 2, 'medianos'),
  L(6, 2, 'medianos'),
  L(7, 2, 'medianos'),
  L(8, 2, 'medianos'),
  L(4, 2.5, 'medianos'),
  L(5, 2.5, 'medianos'),
  L(6, 2.5, 'medianos'),
  L(7, 2.5, 'medianos'),
  L(3, 3, 'medianos'),
  L(4, 3, 'medianos'),
  L(5, 3, 'medianos'),
  L(6, 3, 'medianos'),
  L(4, 4, 'medianos'),
  L(5, 4, 'medianos'),
  L(9, 2, 'grandes'),
  L(8, 2.5, 'grandes'),
  L(9, 2.5, 'grandes'),
  L(10, 2.5, 'grandes'),
  L(10, 2, 'grandes'),
  L(7, 3, 'grandes'),
  L(8, 3, 'grandes'),
  L(6, 4, 'grandes'),
  L(7, 4, 'grandes'),
  L(8, 4, 'grandes'),
  L(9, 3, 'xl'),
  L(10, 3, 'xl'),
  L(9, 4, 'xl'),
  L(10, 4, 'xl'),
  L(5, 5, 'xl'),
  L(6, 5, 'xl'),
  L(7, 5, 'xl'),
  L(6, 6, 'xl'),
  L(7, 6, 'xl'),
] as const;

const tercio = 4 / 3;

export const SEED_MEDIDAS_FIJAS = [
  { ancho: 8, largo: 5, etiqueta: null as string | null, precio_transferencia: 161500 },
  { ancho: 9, largo: 5, etiqueta: null, precio_transferencia: 183000 },
  { ancho: 10, largo: 5, etiqueta: null, precio_transferencia: 189000 },
  { ancho: 11, largo: 5, etiqueta: null, precio_transferencia: 205000 },
  { ancho: 12, largo: 5, etiqueta: null, precio_transferencia: 218000 },
  { ancho: 13, largo: 5, etiqueta: null, precio_transferencia: 232000 },
  { ancho: 14, largo: 5, etiqueta: null, precio_transferencia: 246000 },
  { ancho: 15, largo: 5, etiqueta: null, precio_transferencia: 260000 },
  { ancho: 8, largo: 6, etiqueta: null, precio_transferencia: 165500 },
  { ancho: 9, largo: 6, etiqueta: null, precio_transferencia: 187000 },
  { ancho: 10, largo: 6, etiqueta: null, precio_transferencia: 194000 },
  { ancho: 11, largo: 6, etiqueta: null, precio_transferencia: 210000 },
  { ancho: 12, largo: 6, etiqueta: null, precio_transferencia: 224000 },
  { ancho: 13, largo: 6, etiqueta: null, precio_transferencia: 239000 },
  { ancho: 14, largo: 6, etiqueta: null, precio_transferencia: 253000 },
  { ancho: 15, largo: 6, etiqueta: null, precio_transferencia: 267000 },
  { ancho: 11, largo: tercio, etiqueta: '11×4/3', precio_transferencia: 155000 },
  { ancho: 12, largo: tercio, etiqueta: '12×4/3', precio_transferencia: 160000 },
  { ancho: 13, largo: tercio, etiqueta: '13×4/3', precio_transferencia: 165000 },
] as const;

export const SEED_ACCESORIOS = [
  { codigo: 'soldador' as const, etiqueta: 'Soldador', precio_transferencia: 0 },
  { codigo: 'base_remachadora' as const, etiqueta: 'Base remachadora', precio_transferencia: 0 },
  { codigo: 'mango_golpe' as const, etiqueta: 'Mango de golpe', precio_transferencia: 0 },
] as const;

export const SEED_ABECEDARIOS = [
  { categoria: 'Números 0 al 9 solos', detalle: 'de 3 a 10 mm', precio_transferencia: 55000, orden: 1 },
  { categoria: 'Números 0 al 9', detalle: 'de 3 a 10 mm', precio_transferencia: 95000, orden: 2 },
  { categoria: 'Simple', detalle: 'Abc 6 mm', precio_transferencia: 206500, orden: 3 },
  { categoria: 'Simple', detalle: 'Abc 10 mm', precio_transferencia: 238000, orden: 4 },
  { categoria: 'Min y May', detalle: 'Abc 6 mm', precio_transferencia: 336500, orden: 5 },
  { categoria: 'Min y May', detalle: 'Abc 10 mm', precio_transferencia: 396000, orden: 6 },
  { categoria: 'Min ×2 y May', detalle: 'Abc 6 mm', precio_transferencia: 491500, orden: 7 },
  { categoria: 'Min ×2 y May', detalle: 'Abc 10 mm', precio_transferencia: 549500, orden: 8 },
  { categoria: 'Letras extras', detalle: '6 mm', precio_transferencia: 6000, orden: 9 },
  { categoria: 'Letras extras', detalle: '10 mm', precio_transferencia: 6300, orden: 10 },
] as const;

export const SEED_REDONDOS = [
  { rango: 'De 67 mm', precio_simple: 162000, precio_intermedio: 174000, precio_complejo: 186000, orden: 1 },
  { rango: 'De 68 a 76 mm', precio_simple: 174000, precio_intermedio: 186000, precio_complejo: 204000, orden: 2 },
  { rango: 'De 77 a 100 mm', precio_simple: 198000, precio_intermedio: 210000, precio_complejo: 234000, orden: 3 },
] as const;
