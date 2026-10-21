/**
 * Registro de ediciones de vectores (`vector_ediciones`, PLAN_CORRECCION_AUTONOMA_VECTORES §4).
 *
 * Se llama después de guardar un vector en un sello. Nunca frena ni rompe el
 * guardado: corre en segundo plano y, si algo falla (por ejemplo, la tabla
 * todavía no existe), solo deja un aviso en la consola.
 */
import { supabase } from '../client';
import { uploadFile } from './storage.service';
import { autoCorregir, chequearSvg, type FresaReport, type FresaTarget } from '@/lib/fresa/chequeoFresa';
import { FRESA_ANALYSIS_VERSION } from '@/lib/fresa/config';
import type { FixOperation } from '@/lib/fresa/fix';
import {
  resultadoDe,
  resumirChequeo,
  segundosDeEdicion,
  tipoDeCaso,
  type EdicionEleccion,
  type EdicionFila,
  type EdicionOrigen,
} from '@/lib/vectorizacion/edicionesMetricas';

export interface RegistrarEdicionInput {
  origen: EdicionOrigen;
  selloId: string | null;
  ordenId?: string | null;
  /** El vector antes de cualquier corrección. */
  original: string;
  /** El que se guardó en el sello. */
  final: string;
  eleccion: EdicionEleccion;
  /** Operaciones de la versión guardada (automáticas y registro del editor). */
  operaciones?: FixOperation[] | null;
  /**
   * ¿Quien guardó vio la propuesta automática? En Revisión sí (se elige entre
   * Original y Automático); en Asignar y en el chequeo de un sello guardado,
   * solo si la pidió. Si no la vio, la automática se calcula igual («modo
   * sombra») pero no cuenta como rechazada.
   */
  propuestaVista: boolean;
  /** Medida contra la que se corrige el original (la del pedido). */
  target: FresaTarget;
  /** Medida con la que se guardó (si se agrandó el sello, distinta de `target`). */
  targetFinal?: FresaTarget;
  /** Corrección automática ya calculada (si no, se calcula acá; queda en caché). */
  auto?: { report: FresaReport; fix: { svg: string; after: FresaReport } | null } | null;
  tipoSello?: string | null;
  alimento?: boolean;
}

/** null = no se sabe todavía; false = la tabla no está (migración sin aplicar). */
let tablaDisponible: boolean | null = null;

async function hayTabla(): Promise<boolean> {
  if (tablaDisponible != null) return tablaDisponible;
  const { error } = await supabase.from('vector_ediciones' as never).select('id').limit(1);
  tablaDisponible = !error;
  if (error) console.warn('[vector_ediciones] la tabla no está disponible; no se registran ediciones.', error.message);
  return tablaDisponible;
}

async function subir(path: string, svg: string): Promise<string | null> {
  try {
    await uploadFile('vector', new File([svg], path.split('/').pop() ?? 'vector.svg', { type: 'image/svg+xml' }), path);
    return path;
  } catch (e) {
    console.warn('[vector_ediciones] no se pudo subir', path, e);
    return null;
  }
}

async function currentUserEmail(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function registrarEdicion(input: RegistrarEdicionInput): Promise<void> {
  try {
    if (!(await hayTabla())) return;
    const auto = input.auto ?? (await autoCorregir(input.original, input.target));
    const autoSvg = auto.fix?.svg ?? null;
    const finalTarget = input.targetFinal ?? input.target;
    const sameTarget = JSON.stringify(finalTarget) === JSON.stringify(input.target);
    const reportFinal =
      sameTarget && input.final === input.original
        ? auto.report
        : sameTarget && autoSvg && input.final === autoSvg
          ? auto.fix!.after
          : await chequearSvg(input.final, finalTarget);

    let ordenId = input.ordenId ?? null;
    if (!ordenId && input.selloId) {
      const { data } = await supabase.from('sellos').select('orden_id').eq('id', input.selloId).maybeSingle();
      ordenId = (data as { orden_id?: string | null } | null)?.orden_id ?? null;
    }

    // Los SVG, sin repetir: si el final es el original o el automático, se reusa el archivo.
    const base = `ediciones/${input.selloId ?? 'sin-sello'}/${Date.now()}`;
    const pOriginal = await subir(`${base}-original.svg`, input.original);
    const pAuto = autoSvg && autoSvg !== input.original ? await subir(`${base}-auto.svg`, autoSvg) : null;
    const pFinal =
      input.final === input.original
        ? pOriginal
        : autoSvg && input.final === autoSvg
          ? pAuto
          : await subir(`${base}-final.svg`, input.final);

    const chequeoOriginal = resumirChequeo(auto.report);
    const huboPropuesta = Boolean(autoSvg) && input.propuestaVista;
    const row = {
      usuario_email: await currentUserEmail(),
      sello_id: input.selloId,
      orden_id: ordenId,
      origen: input.origen,
      eleccion: input.eleccion,
      resultado: resultadoDe(input.eleccion, huboPropuesta),
      tipo_caso: tipoDeCaso({ tipoSello: input.tipoSello, alimento: input.alimento, chequeoOriginal }),
      svg_original_path: pOriginal,
      svg_auto_path: pAuto,
      svg_final_path: pFinal,
      operaciones: input.operaciones ?? null,
      chequeo_original: chequeoOriginal,
      chequeo_auto: resumirChequeo(auto.fix?.after),
      chequeo_final: resumirChequeo(reportFinal),
      ancho_mm: reportFinal.widthMm || null,
      alto_mm: reportFinal.heightMm || null,
      tipo_sello: input.tipoSello ?? null,
      alimento: Boolean(input.alimento),
      version_algoritmo: FRESA_ANALYSIS_VERSION,
      segundos_edicion: segundosDeEdicion(input.operaciones),
    };
    const { error } = await supabase.from('vector_ediciones' as never).insert(row as never);
    if (error) console.warn('[vector_ediciones] no se pudo registrar', error);
  } catch (e) {
    console.warn('[vector_ediciones] no se pudo registrar', e);
  }
}

/** Ediciones desde una fecha (para los indicadores). */
export async function fetchEdiciones(desdeIso: string): Promise<EdicionFila[] | null> {
  const { data, error } = await supabase
    .from('vector_ediciones' as never)
    .select('sello_id, created_at, resultado, tipo_caso')
    .gte('created_at', desdeIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) {
    console.warn('[vector_ediciones] no se pudo leer', error);
    return null;
  }
  return (data ?? []) as unknown as EdicionFila[];
}

/** Por sello, las fechas en que se marcó rehacer por error en el vector. */
export async function fetchRehacerPorVector(selloIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!selloIds.length) return out;
  for (let i = 0; i < selloIds.length; i += 200) {
    const { data, error } = await supabase
      .from('sello_rehacer_eventos')
      .select('sello_id, created_at, motivo')
      .in('sello_id', selloIds.slice(i, i + 200))
      .in('motivo', ['ERROR_EN_EL_VECTOR', 'ERROR_MEDIDA_O_VECTOR']);
    if (error) {
      console.warn('[vector_ediciones] no se pudieron leer los rehacer', error);
      continue;
    }
    for (const r of (data ?? []) as Array<{ sello_id: string; created_at: string }>) {
      out.set(r.sello_id, [...(out.get(r.sello_id) ?? []), r.created_at]);
    }
  }
  return out;
}
