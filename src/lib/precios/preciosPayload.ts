/** Precios guardados en `precios_lista.data` (Supabase). Solo transferencia; link = redondeo(transfer × 1.15) en la app. */

export type SelloGrupoPrecio = {
  id: string;
  titulo: string;
  medidas: string;
  precioTransferencia: number;
};

export type AbecedarioPrecio = {
  categoria: string;
  detalle: string;
  precioTransferencia: number;
};

export type SelloRedondoPrecio = {
  rango: string;
  simple: number;
  intermedio: number;
  complejo: number;
};

export type OtraMedidaPrecio = {
  medida: string;
  precioTransferencia: number;
};

export type AccesoriosPrecios = {
  soldador: number;
  baseRemachadora: number;
  mangoGolpe: number;
};

export type PreciosPayload = {
  version: 1;
  notaRespetoPresupuesto?: string;
  sellosGrupos: SelloGrupoPrecio[];
  accesorios: AccesoriosPrecios;
  abecedarios: AbecedarioPrecio[];
  sellosRedondos: SelloRedondoPrecio[];
  otrasMedidas: OtraMedidaPrecio[];
};

export function precioLinkDesdeTransferencia(ars: number): number {
  const n = Number(ars);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1.15);
}

export const DEFAULT_PRECIOS_PAYLOAD: PreciosPayload = {
  version: 1,
  notaRespetoPresupuesto:
    'Si se pasó un presupuesto con el valor anterior se respeta (dentro de los últimos 10 días).',
  sellosGrupos: [
    {
      id: 'chicos',
      titulo: 'Sellos chicos',
      medidas:
        '1×1, 2×1, 3×1, 4×1, 5×1, 6×1, 7×1, 8×1, 2×2, 3×2, 4×2, 2.5×2.5, 3×2.5',
      precioTransferencia: 69500,
    },
    {
      id: 'medianos',
      titulo: 'Sellos medianos',
      medidas:
        '9×1, 5×2, 6×2, 7×2, 8×2, 4×2.5, 5×2.5, 6×2.5, 7×2.5, 3×3, 4×3, 5×3, 6×3, 4×4, 5×4',
      precioTransferencia: 83500,
    },
    {
      id: 'grandes',
      titulo: 'Sellos grandes',
      medidas: '9×2, 8×2.5, 9×2.5, 10×2.5, 10×2, 7×3, 8×3, 6×4, 7×4, 8×4',
      precioTransferencia: 98500,
    },
    {
      id: 'xl',
      titulo: 'Sellos XL',
      medidas: '9×3, 10×3, 9×4, 10×4, 5×5, 6×5, 7×5, 6×6, 7×6',
      precioTransferencia: 148500,
    },
  ],
  accesorios: {
    soldador: 0,
    baseRemachadora: 0,
    mangoGolpe: 0,
  },
  abecedarios: [
    { categoria: 'Números 0 al 9 solos', detalle: 'de 3 a 10 mm', precioTransferencia: 55000 },
    { categoria: 'Números 0 al 9', detalle: 'de 3 a 10 mm', precioTransferencia: 95000 },
    { categoria: 'Simple', detalle: 'Abc 6 mm', precioTransferencia: 206500 },
    { categoria: 'Simple', detalle: 'Abc 10 mm', precioTransferencia: 238000 },
    { categoria: 'Min y May', detalle: 'Abc 6 mm', precioTransferencia: 336500 },
    { categoria: 'Min y May', detalle: 'Abc 10 mm', precioTransferencia: 396000 },
    { categoria: 'Min ×2 y May', detalle: 'Abc 6 mm', precioTransferencia: 491500 },
    { categoria: 'Min ×2 y May', detalle: 'Abc 10 mm', precioTransferencia: 549500 },
    { categoria: 'Letras extras', detalle: '6 mm', precioTransferencia: 6000 },
    { categoria: 'Letras extras', detalle: '10 mm', precioTransferencia: 6300 },
  ],
  sellosRedondos: [
    { rango: 'De 67 mm', simple: 162000, intermedio: 174000, complejo: 186000 },
    { rango: 'De 68 a 76 mm', simple: 174000, intermedio: 186000, complejo: 204000 },
    { rango: 'De 77 a 100 mm', simple: 198000, intermedio: 210000, complejo: 234000 },
  ],
  otrasMedidas: [
    { medida: '8×5', precioTransferencia: 161500 },
    { medida: '9×5', precioTransferencia: 183000 },
    { medida: '10×5', precioTransferencia: 189000 },
    { medida: '11×5', precioTransferencia: 205000 },
    { medida: '12×5', precioTransferencia: 218000 },
    { medida: '13×5', precioTransferencia: 232000 },
    { medida: '14×5', precioTransferencia: 246000 },
    { medida: '15×5', precioTransferencia: 260000 },
    { medida: '8×6', precioTransferencia: 165500 },
    { medida: '9×6', precioTransferencia: 187000 },
    { medida: '10×6', precioTransferencia: 194000 },
    { medida: '11×6', precioTransferencia: 210000 },
    { medida: '12×6', precioTransferencia: 224000 },
    { medida: '13×6', precioTransferencia: 239000 },
    { medida: '14×6', precioTransferencia: 253000 },
    { medida: '15×6', precioTransferencia: 267000 },
    { medida: '11×4/3', precioTransferencia: 155000 },
    { medida: '12×4/3', precioTransferencia: 160000 },
    { medida: '13×4/3', precioTransferencia: 165000 },
  ],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** Combina lo guardado en BD con defaults (por si faltan claves nuevas en versiones futuras). */
export function mergePreciosPayload(raw: unknown): PreciosPayload {
  const base = structuredClone(DEFAULT_PRECIOS_PAYLOAD);
  if (!isRecord(raw)) return base;

  if (typeof raw.notaRespetoPresupuesto === 'string') {
    base.notaRespetoPresupuesto = raw.notaRespetoPresupuesto;
  }

  const grupos = raw.sellosGrupos;
  if (Array.isArray(grupos)) {
    for (const g of grupos) {
      if (!isRecord(g) || typeof g.id !== 'string') continue;
      const idx = base.sellosGrupos.findIndex((x) => x.id === g.id);
      if (idx >= 0) {
        base.sellosGrupos[idx] = {
          ...base.sellosGrupos[idx],
          titulo: str(g.titulo, base.sellosGrupos[idx].titulo),
          medidas: str(g.medidas, base.sellosGrupos[idx].medidas),
          precioTransferencia: num(g.precioTransferencia, base.sellosGrupos[idx].precioTransferencia),
        };
      }
    }
  }

  const acc = raw.accesorios;
  if (isRecord(acc)) {
    base.accesorios = {
      soldador: num(acc.soldador, base.accesorios.soldador),
      baseRemachadora: num(acc.baseRemachadora, base.accesorios.baseRemachadora),
      mangoGolpe: num(acc.mangoGolpe, base.accesorios.mangoGolpe),
    };
  }

  const abc = raw.abecedarios;
  if (Array.isArray(abc) && abc.length === base.abecedarios.length) {
    base.abecedarios = abc.map((row, i) => {
      const d = isRecord(row) ? row : {};
      const def = base.abecedarios[i]!;
      return {
        categoria: str(d.categoria, def.categoria),
        detalle: str(d.detalle, def.detalle),
        precioTransferencia: num(d.precioTransferencia, def.precioTransferencia),
      };
    });
  }

  const red = raw.sellosRedondos;
  if (Array.isArray(red) && red.length === base.sellosRedondos.length) {
    base.sellosRedondos = red.map((row, i) => {
      const d = isRecord(row) ? row : {};
      const def = base.sellosRedondos[i]!;
      return {
        rango: str(d.rango, def.rango),
        simple: num(d.simple, def.simple),
        intermedio: num(d.intermedio, def.intermedio),
        complejo: num(d.complejo, def.complejo),
      };
    });
  }

  const otras = raw.otrasMedidas;
  if (Array.isArray(otras) && otras.length === base.otrasMedidas.length) {
    base.otrasMedidas = otras.map((row, i) => {
      const d = isRecord(row) ? row : {};
      const def = base.otrasMedidas[i]!;
      return {
        medida: str(d.medida, def.medida),
        precioTransferencia: num(d.precioTransferencia, def.precioTransferencia),
      };
    });
  }

  return base;
}
