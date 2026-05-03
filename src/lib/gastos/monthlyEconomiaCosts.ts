/**
 * Gastos fijos ideales (`fixed`) + categorías extras (`extras`) por mes → Economía.
 * `realFixed`: mismo desglose que `fixed` pero con lo pagado de verdad; solo registro en Gastos (no altera Economía).
 */

export const STORAGE_MONTHLY_V2 = 'gastos_mensuales_v2';
export const STORAGE_MONTHLY_V1 = 'gastos_mensuales_v1';
export const STORAGE_KEY_FIXED_LEGACY = 'economia_fixed_monthly_cost_ars';

export type SalaryEntry = { id: string; nombre: string; monto: number };

export type FixedCostsMonth = {
  monotributos: number;
  sueldos: SalaryEntry[];
  contador: number;
  electricidad: number;
  agua: number;
  internet: number;
  alquiler: number;
  seguro: number;
  credito: number;
};

export type ExtrasMonth = {
  publicidad: number;
  envios: number;
  inversiones_empresa: number;
  compra_dolares: number;
  gastos_varios: number;
  automatizaciones: number;
  remodelaciones: number;
  impuestos: number;
  inversion_cyprea: number;
};

export type MonthCostsBundle = {
  fixed: FixedCostsMonth;
  extras: ExtrasMonth;
  /** Misma estructura que `fixed`: montos reales pagados (no es el presupuesto de Economía). */
  realFixed: FixedCostsMonth;
};

export function newSalaryEntry(): SalaryEntry {
  return { id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), nombre: '', monto: 0 };
}

/**
 * Una fila por usuario de la app (`id` = `user_id` de Supabase). Conserva montos; empareja por id o por nombre único.
 * El resto de filas (sueldos extra) se mantienen al final.
 */
export function ensureSueldosForUsers(
  sueldos: SalaryEntry[],
  appUsers: Array<{ id: string; name: string }>,
): SalaryEntry[] {
  if (!appUsers.length) return sueldos;

  const byId = new Map(sueldos.map((s) => [s.id, s]));
  const consumed = new Set<string>();
  const out: SalaryEntry[] = [];

  for (const u of appUsers) {
    let row = byId.get(u.id);
    if (!row) {
      const candidates = sueldos.filter(
        (s) =>
          !consumed.has(s.id) && s.nombre.trim().toLowerCase() === u.name.trim().toLowerCase(),
      );
      if (candidates.length === 1) row = candidates[0];
    }
    if (row) {
      consumed.add(row.id);
      out.push({ id: u.id, nombre: u.name, monto: Number(row.monto) || 0 });
    } else {
      out.push({ id: u.id, nombre: u.name, monto: 0 });
    }
  }

  for (const s of sueldos) {
    if (!consumed.has(s.id)) {
      consumed.add(s.id);
      out.push(s);
    }
  }

  return out;
}

export function sueldosListsEqual(a: SalaryEntry[], b: SalaryEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].nombre !== b[i].nombre || a[i].monto !== b[i].monto) return false;
  }
  return true;
}

export function emptyFixed(): FixedCostsMonth {
  return {
    monotributos: 0,
    sueldos: [],
    contador: 0,
    electricidad: 0,
    agua: 0,
    internet: 0,
    alquiler: 0,
    seguro: 0,
    credito: 0,
  };
}

export function emptyExtras(): ExtrasMonth {
  return {
    publicidad: 0,
    envios: 0,
    inversiones_empresa: 0,
    compra_dolares: 0,
    gastos_varios: 0,
    automatizaciones: 0,
    remodelaciones: 0,
    impuestos: 0,
    inversion_cyprea: 0,
  };
}

export function emptyBundle(): MonthCostsBundle {
  return { fixed: emptyFixed(), extras: emptyExtras(), realFixed: emptyFixed() };
}

export function sumSueldos(sueldos: SalaryEntry[]): number {
  return sueldos.reduce((acc, s) => acc + (Number(s.monto) || 0), 0);
}

/** Aguinaldo mensual = suma de sueldos / 12 */
export function aguinaldoFromSueldos(sueldos: SalaryEntry[]): number {
  return sumSueldos(sueldos) / 12;
}

export function totalFixedCosts(f: FixedCostsMonth): number {
  const sueldosTotal = sumSueldos(f.sueldos);
  const aguinaldo = sueldosTotal / 12;
  return (
    f.monotributos +
    sueldosTotal +
    f.contador +
    f.electricidad +
    f.agua +
    f.internet +
    f.alquiler +
    f.seguro +
    f.credito +
    aguinaldo
  );
}

/** Columna "Gastos extras" en Economía: envíos, gastos varios, automatizaciones, remodelaciones, impuestos */
export function gastosExtrasParaTabla(e: ExtrasMonth): number {
  return (
    e.envios + e.gastos_varios + e.automatizaciones + e.remodelaciones + e.impuestos
  );
}

export function readLegacyFixedScalar(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIXED_LEGACY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function parseV1Row(raw: Record<string, unknown>): ExtrasMonth {
  const e = emptyExtras();
  const num = (k: string) => {
    const v = raw[k];
    return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
  };
  e.publicidad = num('publicidad');
  e.envios = num('envios');
  e.compra_dolares = num('compra_dolares');
  e.inversiones_empresa = num('inversiones_empresa');
  e.gastos_varios = num('gastos_varios');
  e.automatizaciones = num('automatizaciones');
  e.impuestos = num('impuestos');
  e.remodelaciones = num('remodelacion') || num('remodelaciones');
  e.inversion_cyprea = num('inversion_cyprea');
  return e;
}

function parseV1Store(raw: string | null): Record<string, ExtrasMonth> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const out: Record<string, ExtrasMonth> = {};
    for (const [month, row] of Object.entries(parsed)) {
      out[month] = parseV1Row(row || {});
    }
    return out;
  } catch {
    return {};
  }
}

function parseV2Store(raw: string | null): Record<string, MonthCostsBundle> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, MonthCostsBundle> = {};
    for (const [month, val] of Object.entries(parsed)) {
      const b = normalizeBundle(val);
      out[month] = b;
    }
    return out;
  } catch {
    return null;
  }
}

function normalizeSalary(raw: unknown): SalaryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const monto = Number(o.monto) || 0;
  const nombre = typeof o.nombre === 'string' ? o.nombre : '';
  const id = typeof o.id === 'string' && o.id ? o.id : newSalaryEntry().id;
  return { id, nombre, monto };
}

function normalizeFixed(raw: unknown): FixedCostsMonth {
  const f = emptyFixed();
  if (!raw || typeof raw !== 'object') return f;
  const o = raw as Record<string, unknown>;
  f.monotributos = Number(o.monotributos) || 0;
  f.contador = Number(o.contador) || 0;
  f.electricidad = Number(o.electricidad) || 0;
  f.agua = Number(o.agua) || 0;
  f.internet = Number(o.internet) || 0;
  f.alquiler = Number(o.alquiler) || 0;
  f.seguro = Number(o.seguro) || 0;
  f.credito = Number(o.credito) || 0;
  if (Array.isArray(o.sueldos)) {
    f.sueldos = o.sueldos.map(normalizeSalary).filter(Boolean) as SalaryEntry[];
  }
  return f;
}

function normalizeExtras(raw: unknown): ExtrasMonth {
  const e = emptyExtras();
  if (!raw || typeof raw !== 'object') return e;
  const o = raw as Record<string, unknown>;
  e.publicidad = Number(o.publicidad) || 0;
  e.envios = Number(o.envios) || 0;
  e.inversiones_empresa = Number(o.inversiones_empresa) || 0;
  e.compra_dolares = Number(o.compra_dolares) || 0;
  e.gastos_varios = Number(o.gastos_varios) || 0;
  e.automatizaciones = Number(o.automatizaciones) || 0;
  e.remodelaciones = Number(o.remodelaciones) || 0;
  e.impuestos = Number(o.impuestos) || 0;
  e.inversion_cyprea = Number(o.inversion_cyprea) || 0;
  return e;
}

function normalizeBundle(raw: unknown): MonthCostsBundle {
  if (!raw || typeof raw !== 'object') return emptyBundle();
  const o = raw as Record<string, unknown>;
  if ('fixed' in o || 'extras' in o || 'realFixed' in o) {
    return {
      fixed: normalizeFixed(o.fixed),
      extras: normalizeExtras(o.extras),
      realFixed: normalizeFixed(o.realFixed),
    };
  }
  return emptyBundle();
}

/** Carga todos los meses: v2, o migración desde v1 + fijos vacíos */
export function loadAllMonthlyCosts(): Record<string, MonthCostsBundle> {
  const v2 = parseV2Store(localStorage.getItem(STORAGE_MONTHLY_V2));
  if (v2 && Object.keys(v2).length > 0) return v2;
  const v1Extras = parseV1Store(localStorage.getItem(STORAGE_MONTHLY_V1));
  const out: Record<string, MonthCostsBundle> = {};
  for (const [month, extras] of Object.entries(v1Extras)) {
    out[month] = { fixed: emptyFixed(), extras, realFixed: emptyFixed() };
  }
  return out;
}

export const GASTOS_MONTHLY_UPDATED_EVENT = 'alcohn-gastos-monthly';

export function saveAllMonthlyCosts(data: Record<string, MonthCostsBundle>) {
  localStorage.setItem(STORAGE_MONTHLY_V2, JSON.stringify(data));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GASTOS_MONTHLY_UPDATED_EVENT));
  }
}

/**
 * Total costos fijos del mes: si el desglose da 0 y hay legado de un solo monto, usa el legado.
 */
export function getFixedTotalForMonth(bundle: MonthCostsBundle | undefined, legacyFallback: number): number {
  if (!bundle) return legacyFallback;
  const t = totalFixedCosts(bundle.fixed);
  if (t === 0 && legacyFallback > 0) return legacyFallback;
  return t;
}

export function getBundleForMonth(
  byMonth: Record<string, MonthCostsBundle>,
  monthKey: string,
): MonthCostsBundle {
  const b = byMonth[monthKey];
  if (!b) return emptyBundle();
  return {
    fixed: b.fixed,
    extras: b.extras,
    realFixed: b.realFixed ?? emptyFixed(),
  };
}
