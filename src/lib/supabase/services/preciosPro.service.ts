import { supabase } from '@/lib/supabase/client';
import { normalizarMedidaMm, claveMedidaMm, parseNumDb } from '@/lib/precios/preciosDims';
import {
  PRECIOS_NOTA_DEFAULT,
  SEED_ABECEDARIOS,
  SEED_ACCESORIOS,
  SEED_GRUPOS,
  SEED_MEDIDAS_FIJAS,
  SEED_MEDIDAS_GRUPO,
  SEED_REDONDOS,
} from '@/lib/precios/preciosSeedData';
import type { PreciosResolverInput, SelloGrupoCodigo } from '@/lib/precios/resolverPrecioSello';

export type PreciosFormState = {
  notaPresupuesto: string | null;
  sellosGrupos: Array<{
    codigo: SelloGrupoCodigo;
    titulo: string;
    medidas: string;
    precioTransferencia: number;
  }>;
  accesorios: {
    soldador: number;
    baseRemachadora: number;
    mangoGolpe: number;
  };
  abecedarios: Array<{
    id: string;
    categoria: string;
    detalle: string;
    precioTransferencia: number;
  }>;
  sellosRedondos: Array<{
    id: string;
    rango: string;
    simple: number;
    intermedio: number;
    complejo: number;
  }>;
  otrasMedidas: Array<{
    ancho: number;
    largo: number;
    etiqueta: string | null;
    precioTransferencia: number;
  }>;
};

const ACC_UI_TO_DB = {
  soldador: 'soldador',
  baseRemachadora: 'base_remachadora',
  mangoGolpe: 'mango_golpe',
} as const;

const ACC_DB_TO_UI: Record<string, keyof PreciosFormState['accesorios']> = {
  soldador: 'soldador',
  base_remachadora: 'baseRemachadora',
  mango_golpe: 'mangoGolpe',
};

export async function ensurePreciosSeed(userId: string): Promise<void> {
  const { count: nGrupos, error: eCountG } = await supabase
    .from('precios_sello_grupo')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountG) throw eCountG;

  if ((nGrupos ?? 0) < 4) {
    const { error: e0 } = await supabase.from('precios_config').upsert(
      { user_id: userId, nota_presupuesto: PRECIOS_NOTA_DEFAULT },
      { onConflict: 'user_id' },
    );
    if (e0) throw e0;

    const gruposRows = SEED_GRUPOS.map((g) => ({
      user_id: userId,
      codigo: g.codigo,
      titulo: g.titulo,
      medidas_resumen: g.medidas_resumen,
      precio_transferencia: g.precio_transferencia,
      orden: g.orden,
    }));
    const { error: e1 } = await supabase.from('precios_sello_grupo').upsert(gruposRows, {
      onConflict: 'user_id,codigo',
    });
    if (e1) throw e1;
  }

  const { count: nMg, error: eCountMg } = await supabase
    .from('precios_sello_medida_grupo')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountMg) throw eCountMg;

  if ((nMg ?? 0) === 0) {
    const mg = SEED_MEDIDAS_GRUPO.map((m) => {
      const { ancho, largo } = normalizarMedidaMm(m.ancho, m.largo);
      return {
        user_id: userId,
        ancho,
        largo,
        grupo_codigo: m.grupo_codigo,
      };
    });
    const { error: e2 } = await supabase.from('precios_sello_medida_grupo').insert(mg);
    if (e2) throw e2;
  }

  const { count: nMf, error: eCountMf } = await supabase
    .from('precios_sello_medida_fija')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountMf) throw eCountMf;

  if ((nMf ?? 0) === 0) {
    const mf = SEED_MEDIDAS_FIJAS.map((m) => {
      const { ancho, largo } = normalizarMedidaMm(m.ancho, m.largo);
      return {
        user_id: userId,
        ancho,
        largo,
        etiqueta: m.etiqueta,
        precio_transferencia: m.precio_transferencia,
      };
    });
    const { error: e3 } = await supabase.from('precios_sello_medida_fija').insert(mf);
    if (e3) throw e3;
  }

  const { count: nAcc, error: eCountAcc } = await supabase
    .from('precios_accesorio')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountAcc) throw eCountAcc;

  if ((nAcc ?? 0) < 3) {
    const acc = SEED_ACCESORIOS.map((a) => ({
      user_id: userId,
      codigo: a.codigo,
      etiqueta: a.etiqueta,
      precio_transferencia: a.precio_transferencia,
    }));
    const { error: e4 } = await supabase.from('precios_accesorio').upsert(acc, { onConflict: 'user_id,codigo' });
    if (e4) throw e4;
  }

  const { count: nAbc, error: eCountAbc } = await supabase
    .from('precios_abecedario')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountAbc) throw eCountAbc;

  if ((nAbc ?? 0) === 0) {
    const abc = SEED_ABECEDARIOS.map((a) => ({
      user_id: userId,
      categoria: a.categoria,
      detalle: a.detalle,
      precio_transferencia: a.precio_transferencia,
      orden: a.orden,
    }));
    const { error: e5 } = await supabase.from('precios_abecedario').insert(abc);
    if (e5) throw e5;
  }

  const { count: nRd, error: eCountRd } = await supabase
    .from('precios_sello_redondo')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCountRd) throw eCountRd;

  if ((nRd ?? 0) === 0) {
    const rd = SEED_REDONDOS.map((r) => ({
      user_id: userId,
      rango: r.rango,
      precio_simple: r.precio_simple,
      precio_intermedio: r.precio_intermedio,
      precio_complejo: r.precio_complejo,
      orden: r.orden,
    }));
    const { error: e6 } = await supabase.from('precios_sello_redondo').insert(rd);
    if (e6) throw e6;
  }
}

/** Solo SELECT (RLS de lectura equipo). Sin seed: no intenta inserts como otro usuario. */
async function buildPreciosFormStateFromRows(catalogUserId: string): Promise<PreciosFormState> {
  const [cfg, grupos, accs, abc, rd, mf] = await Promise.all([
    supabase.from('precios_config').select('nota_presupuesto').eq('user_id', catalogUserId).maybeSingle(),
    supabase
      .from('precios_sello_grupo')
      .select('codigo, titulo, medidas_resumen, precio_transferencia, orden')
      .eq('user_id', catalogUserId)
      .order('orden', { ascending: true }),
    supabase.from('precios_accesorio').select('codigo, precio_transferencia').eq('user_id', catalogUserId),
    supabase
      .from('precios_abecedario')
      .select('id, categoria, detalle, precio_transferencia, orden')
      .eq('user_id', catalogUserId)
      .order('orden', { ascending: true }),
    supabase
      .from('precios_sello_redondo')
      .select('id, rango, precio_simple, precio_intermedio, precio_complejo, orden')
      .eq('user_id', catalogUserId)
      .order('orden', { ascending: true }),
    supabase
      .from('precios_sello_medida_fija')
      .select('ancho, largo, etiqueta, precio_transferencia')
      .eq('user_id', catalogUserId)
      .order('ancho', { ascending: true })
      .order('largo', { ascending: true }),
  ]);

  if (cfg.error) throw cfg.error;
  if (grupos.error) throw grupos.error;
  if (accs.error) throw accs.error;
  if (abc.error) throw abc.error;
  if (rd.error) throw rd.error;
  if (mf.error) throw mf.error;

  const accMap: PreciosFormState['accesorios'] = {
    soldador: 0,
    baseRemachadora: 0,
    mangoGolpe: 0,
  };
  for (const row of accs.data ?? []) {
    const cod = row.codigo as string;
    const uiKey = ACC_DB_TO_UI[cod];
    if (uiKey) accMap[uiKey] = Math.round(parseNumDb(row.precio_transferencia));
  }

  const ordenGrupo: SelloGrupoCodigo[] = ['chicos', 'medianos', 'grandes', 'xl'];
  const gRows = [...(grupos.data ?? [])].sort(
    (a, b) => ordenGrupo.indexOf(a.codigo as SelloGrupoCodigo) - ordenGrupo.indexOf(b.codigo as SelloGrupoCodigo),
  );

  return {
    notaPresupuesto: cfg.data?.nota_presupuesto ?? PRECIOS_NOTA_DEFAULT,
    sellosGrupos: gRows.map((g) => ({
      codigo: g.codigo as SelloGrupoCodigo,
      titulo: g.titulo,
      medidas: g.medidas_resumen ?? '',
      precioTransferencia: Math.round(parseNumDb(g.precio_transferencia)),
    })),
    accesorios: accMap,
    abecedarios: (abc.data ?? []).map((r) => ({
      id: r.id,
      categoria: r.categoria,
      detalle: r.detalle,
      precioTransferencia: Math.round(parseNumDb(r.precio_transferencia)),
    })),
    sellosRedondos: (rd.data ?? []).map((r) => ({
      id: r.id,
      rango: r.rango,
      simple: Math.round(parseNumDb(r.precio_simple)),
      intermedio: Math.round(parseNumDb(r.precio_intermedio)),
      complejo: Math.round(parseNumDb(r.precio_complejo)),
    })),
    otrasMedidas: (mf.data ?? []).map((r) => {
      const ancho = parseNumDb(r.ancho);
      const largo = parseNumDb(r.largo);
      return {
        ancho,
        largo,
        etiqueta: r.etiqueta,
        precioTransferencia: Math.round(parseNumDb(r.precio_transferencia)),
      };
    }),
  };
}

export async function fetchPreciosFormState(userId: string): Promise<PreciosFormState> {
  await ensurePreciosSeed(userId);
  return buildPreciosFormStateFromRows(userId);
}

/** Vista del catálogo compartido (misma fuente que cotización). Sin permisos de escritura. */
export async function fetchPreciosFormStateReadOnly(): Promise<PreciosFormState | null> {
  const uid = await resolvePreciosCatalogUserId();
  if (!uid) return null;
  return buildPreciosFormStateFromRows(uid);
}

export async function persistPreciosFormState(userId: string, state: PreciosFormState): Promise<void> {
  const { error: e0 } = await supabase.from('precios_config').upsert(
    { user_id: userId, nota_presupuesto: state.notaPresupuesto },
    { onConflict: 'user_id' },
  );
  if (e0) throw e0;

  for (const g of state.sellosGrupos) {
    const { error } = await supabase
      .from('precios_sello_grupo')
      .update({
        titulo: g.titulo,
        medidas_resumen: g.medidas,
        precio_transferencia: g.precioTransferencia,
      })
      .eq('user_id', userId)
      .eq('codigo', g.codigo);
    if (error) throw error;
  }

  for (const [uiKey, dbCod] of Object.entries(ACC_UI_TO_DB) as Array<
    [keyof PreciosFormState['accesorios'], string]
  >) {
    const { error } = await supabase
      .from('precios_accesorio')
      .update({ precio_transferencia: state.accesorios[uiKey] })
      .eq('user_id', userId)
      .eq('codigo', dbCod);
    if (error) throw error;
  }

  for (const row of state.abecedarios) {
    const { error } = await supabase
      .from('precios_abecedario')
      .update({ precio_transferencia: row.precioTransferencia })
      .eq('user_id', userId)
      .eq('id', row.id);
    if (error) throw error;
  }

  for (const row of state.sellosRedondos) {
    const { error } = await supabase
      .from('precios_sello_redondo')
      .update({
        precio_simple: row.simple,
        precio_intermedio: row.intermedio,
        precio_complejo: row.complejo,
      })
      .eq('user_id', userId)
      .eq('id', row.id);
    if (error) throw error;
  }

  for (const m of state.otrasMedidas) {
    const { ancho, largo } = normalizarMedidaMm(m.ancho, m.largo);
    const { error } = await supabase.from('precios_sello_medida_fija').upsert(
      {
        user_id: userId,
        ancho,
        largo,
        etiqueta: m.etiqueta,
        precio_transferencia: m.precioTransferencia,
      },
      { onConflict: 'user_id,ancho,largo' },
    );
    if (error) throw error;
  }
}

/** Para pedidos / mockups: solo precios rectangulares (grupo + fijas). */
export async function fetchPreciosResolverInput(userId: string): Promise<PreciosResolverInput | null> {
  await ensurePreciosSeed(userId);

  const [grupos, mg, mf] = await Promise.all([
    supabase.from('precios_sello_grupo').select('codigo, precio_transferencia').eq('user_id', userId),
    supabase.from('precios_sello_medida_grupo').select('ancho, largo, grupo_codigo').eq('user_id', userId),
    supabase.from('precios_sello_medida_fija').select('ancho, largo, precio_transferencia').eq('user_id', userId),
  ]);

  if (grupos.error) throw grupos.error;
  if (mg.error) throw mg.error;
  if (mf.error) throw mf.error;

  if (!grupos.data?.length) return null;

  const precioTransferenciaPorGrupo = {} as Record<SelloGrupoCodigo, number>;
  for (const g of grupos.data) {
    const c = g.codigo as SelloGrupoCodigo;
    precioTransferenciaPorGrupo[c] = Math.round(parseNumDb(g.precio_transferencia));
  }
  for (const c of ['chicos', 'medianos', 'grandes', 'xl'] as const) {
    if (precioTransferenciaPorGrupo[c] === undefined) {
      precioTransferenciaPorGrupo[c] = 0;
    }
  }

  const medidaAGrupo = new Map<string, SelloGrupoCodigo>();
  for (const r of mg.data ?? []) {
    const a = parseNumDb(r.ancho);
    const l = parseNumDb(r.largo);
    const k = claveMedidaMm(a, l);
    medidaAGrupo.set(k, r.grupo_codigo as SelloGrupoCodigo);
  }

  const precioTransferenciaPorMedidaFija = new Map<string, number>();
  for (const r of mf.data ?? []) {
    const a = parseNumDb(r.ancho);
    const l = parseNumDb(r.largo);
    const k = claveMedidaMm(a, l);
    precioTransferenciaPorMedidaFija.set(k, Math.round(parseNumDb(r.precio_transferencia)));
  }

  return { precioTransferenciaPorGrupo, medidaAGrupo, precioTransferenciaPorMedidaFija };
}

let cotizacionCache: { input: PreciosResolverInput; at: number } | null = null;
const COTIZ_CACHE_MS = 5 * 60 * 1000;

/** UUID del usuario dueño del catálogo (primera fila legible con políticas de equipo). */
export async function resolvePreciosCatalogUserId(): Promise<string | null> {
  const { data, error } = await supabase.from('precios_sello_grupo').select('user_id').limit(1);
  if (error || !data?.length) return null;
  return data[0].user_id as string;
}

/** Catálogo para cotizar en la app (cualquier usuario autenticado con política de lectura equipo). */
export async function fetchPreciosResolverInputForCotizacion(): Promise<PreciosResolverInput | null> {
  if (cotizacionCache && Date.now() - cotizacionCache.at < COTIZ_CACHE_MS) {
    return cotizacionCache.input;
  }
  const uid = await resolvePreciosCatalogUserId();
  if (!uid) {
    cotizacionCache = null;
    return null;
  }
  const input = await fetchPreciosResolverInput(uid);
  if (input) cotizacionCache = { input, at: Date.now() };
  else cotizacionCache = null;
  return input;
}
