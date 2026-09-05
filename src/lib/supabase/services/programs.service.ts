import { supabase } from '../client';
import {
  FabricationState,
  PlanchuelaSize,
  Program,
  ProgramLifecycleState,
  ProgramMachineType,
  ProgramStamp,
  StampSize,
} from '../../types/index';
import { Database } from '../types';
import { todayArgentinaDateKey } from '../../utils/argentinaDate';
import {
  accumulateLengthByPlanchuela,
  DEFAULT_PERDIDA_CORTE_CM,
  getMaxLengthMmForMachine,
  LARGO_MAXIMO_PLANCHUELA_MM,
  resolvePlanchuelaRef,
  stampLengthAlongMm,
  validatePlanchuelaLengthLimit,
} from '../../programas/material';
import { fetchLatestFabricacionParams } from './fabricacionParametros.service';

type ProgramaRow = Database['public']['Tables']['programa']['Row'];
type SelloRow = Database['public']['Tables']['sellos']['Row'];

export class ProgramServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramServiceError';
  }
}

const mapFabricationState = (estado: string | null | undefined): FabricationState => {
  const mapping: Record<string, FabricationState> = {
    'Sin Hacer': 'SIN_HACER',
    Haciendo: 'HACIENDO',
    Hecho: 'HECHO',
    Verificado: 'VERIFICAR',
    Verificar: 'VERIFICAR',
    Rehacer: 'REHACER',
    Retocar: 'RETOCAR',
    Programado: 'PROGRAMADO',
    Prioridad: 'SIN_HACER',
  };
  return estado ? mapping[estado] || 'SIN_HACER' : 'SIN_HACER';
};

const mapFabricationStateToDB = (estado: FabricationState): string => {
  const mapping: Record<FabricationState, string> = {
    SIN_HACER: 'Sin Hacer',
    HACIENDO: 'Haciendo',
    HECHO: 'Hecho',
    VERIFICAR: 'Verificar',
    REHACER: 'Rehacer',
    RETOCAR: 'Retocar',
    PROGRAMADO: 'Programado',
  };
  return mapping[estado] || 'Sin Hacer';
};

const mapStampType = (tipo: string | null): ProgramStamp['stampType'] => {
  const mapping: Record<string, ProgramStamp['stampType']> = {
    Clasico: 'CLASICO',
    '3mm': '3MM',
    Lacre: 'LACRE',
    Alimento: 'ALIMENTO',
    ABC: 'ABC',
  };
  return tipo ? mapping[tipo] || 'CLASICO' : 'CLASICO';
};

const mapMachine = (maquina: string | null | undefined): ProgramMachineType => {
  const mapping: Record<string, ProgramMachineType> = {
    C: 'C',
    G: 'G',
    XL: 'XL',
    ABC: 'ABC',
    Circular: 'C',
  };
  return maquina ? mapping[maquina] || 'C' : 'C';
};

const aspireForMachine = (
  machine: ProgramMachineType,
): 'Aspire C' | 'Aspire G' | 'Aspire XL' | null => {
  if (machine === 'C') return 'Aspire C';
  if (machine === 'G') return 'Aspire G';
  if (machine === 'XL') return 'Aspire XL';
  return null;
};

const LOCKED_STATES: ProgramLifecycleState[] = ['BLOQUEADO', 'EN_FABRICACION'];
const ELIGIBLE_FAB_STATES = new Set(['Sin Hacer', 'Prioridad', 'Rehacer']);

async function loadMaterialParams(): Promise<{
  perdidaCorteCm: number;
  maxMm: Partial<Record<'C' | 'G' | 'XL', number>>;
}> {
  try {
    const latest = await fetchLatestFabricacionParams();
    const raw = (latest?.params || {}) as Record<string, number>;
    return {
      perdidaCorteCm:
        typeof raw.selloPerdidaCorteCm === 'number' ? raw.selloPerdidaCorteCm : DEFAULT_PERDIDA_CORTE_CM,
      maxMm: {
        C:
          typeof (raw as any).largoMaximoPlanchuelaMm_C === 'number'
            ? (raw as any).largoMaximoPlanchuelaMm_C
            : LARGO_MAXIMO_PLANCHUELA_MM.C,
        G:
          typeof (raw as any).largoMaximoPlanchuelaMm_G === 'number'
            ? (raw as any).largoMaximoPlanchuelaMm_G
            : LARGO_MAXIMO_PLANCHUELA_MM.G,
        XL:
          typeof (raw as any).largoMaximoPlanchuelaMm_XL === 'number'
            ? (raw as any).largoMaximoPlanchuelaMm_XL
            : LARGO_MAXIMO_PLANCHUELA_MM.XL,
      },
    };
  } catch {
    return { perdidaCorteCm: DEFAULT_PERDIDA_CORTE_CM, maxMm: { ...LARGO_MAXIMO_PLANCHUELA_MM } };
  }
}

function mapSelloToProgramStamp(sello: SelloRow, perdidaCorteCm: number): ProgramStamp {
  const anchoCm = sello.ancho_real != null ? Number(sello.ancho_real) : null;
  const largoCm = sello.largo_real != null ? Number(sello.largo_real) : null;
  const dims = {
    anchoRealCm: anchoCm,
    largoRealCm: largoCm,
    tipoPlanchuela: sello.tipo_planchuela as PlanchuelaSize | null,
  };

  return {
    id: sello.id,
    designName: sello.diseno || 'Sin diseño',
    widthMm: anchoCm != null ? anchoCm * 10 : 50,
    heightMm: largoCm != null ? largoCm * 10 : 30,
    stampType: mapStampType(sello.tipo),
    previewUrl: sello.foto_sello || undefined,
    vectorPreviewUrl: sello.archivo_vector_preview || undefined,
    isPriority: Boolean((sello as any).es_prioritario) || sello.estado_fabricacion === 'Prioridad',
    deadlineAt: sello.fecha_limite || undefined,
    createdAt: sello.created_at || undefined,
    tipoPlanchuela: resolvePlanchuelaRef(dims),
    anchoRealCm: anchoCm,
    largoRealCm: largoCm,
    fabricationState: mapFabricationState(sello.estado_fabricacion),
    previousFabricationState: (sello as any).estado_fabricacion_previo
      ? mapFabricationState((sello as any).estado_fabricacion_previo)
      : null,
    machine: sello.maquina ? mapMachine(sello.maquina) : null,
    lengthAlongMm: stampLengthAlongMm(dims, perdidaCorteCm),
  };
}

function deriveLifecycleFromStamps(
  base: ProgramLifecycleState,
  bloqueado: boolean,
  stamps: ProgramStamp[],
): ProgramLifecycleState {
  if (bloqueado || base === 'BLOQUEADO') return 'BLOQUEADO';
  if (stamps.length === 0) return base === 'LISTO' ? 'LISTO' : 'BORRADOR';

  const allDone = stamps.every(
    (s) => s.fabricationState === 'HECHO' || s.fabricationState === 'VERIFICAR',
  );
  if (allDone) return 'FINALIZADO';

  const anyDoing = stamps.some(
    (s) => s.fabricationState === 'HACIENDO' || s.fabricationState === 'RETOCAR',
  );
  if (anyDoing) return 'EN_FABRICACION';

  return base;
}

function pickPrimaryLength(lengths: Program['lengthByPlanchuela']): StampSize {
  const order: StampSize[] = [63, 38, 25, 19, 12];
  for (const ref of order) {
    if ((lengths[ref] || 0) > 0) return ref;
  }
  return 63;
}

function lengthsToDbColumns(lengths: Program['lengthByPlanchuela']) {
  return {
    largo_usado_63: lengths[63] ?? null,
    largo_usado_38: lengths[38] ?? null,
    largo_usado_25: lengths[25] ?? null,
    largo_usado_19: lengths[19] ?? null,
    largo_usado_12: lengths[12] ?? null,
  };
}

function mapProgramaToProgram(
  programa: ProgramaRow,
  sellos: SelloRow[],
  perdidaCorteCm: number,
): Program {
  const stamps = sellos.map((s) => mapSelloToProgramStamp(s, perdidaCorteCm));
  const lengthByPlanchuela = accumulateLengthByPlanchuela(
    stamps.map((s) => ({
      anchoRealCm: s.anchoRealCm,
      largoRealCm: s.largoRealCm,
      tipoPlanchuela: s.tipoPlanchuela,
    })),
    perdidaCorteCm,
  );

  const bloqueado = Boolean((programa as any).bloqueado);
  const baseEstado = ((programa as any).estado_programa || 'BORRADOR') as ProgramLifecycleState;
  const estadoPrograma = deriveLifecycleFromStamps(baseEstado, bloqueado, stamps);

  return {
    id: programa.id,
    name: programa.nombre,
    description: (programa as any).descripcion || '',
    version: '1.0.0',
    status: 'active',
    category: 'PRODUCTION',
    machine: mapMachine(programa.maquina),
    stampCount: programa.cantidad_sellos || stamps.length,
    productionDate: programa.fecha || todayArgentinaDateKey(),
    notes: (programa as any).descripcion || undefined,
    fabricationState: mapFabricationState(programa.estado_fabricacion),
    isVerified: programa.verificado || false,
    stamps,
    lengthUsed: pickPrimaryLength(lengthByPlanchuela),
    lengthByPlanchuela,
    estadoPrograma,
    bloqueado,
    dirty: Boolean((programa as any).dirty ?? true),
    archivoZipUrl: (programa as any).archivo_zip_url ?? null,
    archivoZipGeneradoAt: (programa as any).archivo_zip_generado_at ?? null,
    createdAt: programa.created_at || new Date().toISOString(),
    lastUpdated: programa.updated_at || new Date().toISOString(),
    createdBy: 'system',
    tags: [],
    settings: {},
  };
}

async function assertProgramEditable(programId: string): Promise<ProgramaRow> {
  const { data, error } = await supabase.from('programa').select('*').eq('id', programId).single();
  if (error || !data) throw new ProgramServiceError('Programa no encontrado');

  const estado = ((data as any).estado_programa || 'BORRADOR') as ProgramLifecycleState;
  const bloqueado = Boolean((data as any).bloqueado);

  if (bloqueado || LOCKED_STATES.includes(estado)) {
    throw new ProgramServiceError(
      'El programa está bloqueado o en fabricación. Desbloquealo antes de editarlo.',
    );
  }

  return data;
}

async function markProgramDirtyAfterEdit(programId: string, hadZip: boolean): Promise<void> {
  const update: Record<string, unknown> = {
    dirty: true,
    updated_at: new Date().toISOString(),
  };
  if (hadZip) {
    update.estado_programa = 'BORRADOR';
  } else {
    const { data } = await supabase
      .from('programa')
      .select('estado_programa')
      .eq('id', programId)
      .maybeSingle();
    if ((data as any)?.estado_programa === 'LISTO') {
      update.estado_programa = 'BORRADOR';
    }
  }
  await supabase.from('programa').update(update as any).eq('id', programId);
}

async function recalculateAndPersistLengths(programId: string, perdidaCorteCm: number): Promise<void> {
  const { data: sellos } = await supabase.from('sellos').select('*').eq('programa_id', programId);
  const lengths = accumulateLengthByPlanchuela(
    (sellos || []).map((s) => ({
      anchoRealCm: s.ancho_real,
      largoRealCm: s.largo_real,
      tipoPlanchuela: s.tipo_planchuela as PlanchuelaSize | null,
    })),
    perdidaCorteCm,
  );

  await supabase
    .from('programa')
    .update({
      ...lengthsToDbColumns(lengths),
      cantidad_sellos: sellos?.length ?? 0,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', programId);
}

export const getPrograms = async (): Promise<Program[]> => {
  const { perdidaCorteCm } = await loadMaterialParams();

  const { data: programas, error: programasError } = await supabase
    .from('programa')
    .select('*')
    .not('nombre', 'is', null)
    .neq('nombre', '')
    .order('fecha', { ascending: false });

  if (programasError) throw programasError;
  if (!programas?.length) return [];

  const validPrograms = programas.filter((p) => p.nombre && p.nombre.trim() !== '');
  const programaIds = validPrograms.map((p) => p.id);

  const { data: sellos, error: sellosError } = await supabase
    .from('sellos')
    .select('*')
    .in('programa_id', programaIds);

  if (sellosError) throw sellosError;

  const sellosPorPrograma = new Map<string, SelloRow[]>();
  sellos?.forEach((sello) => {
    if (!sello.programa_id) return;
    const lista = sellosPorPrograma.get(sello.programa_id) || [];
    lista.push(sello);
    sellosPorPrograma.set(sello.programa_id, lista);
  });

  return validPrograms.map((programa) => {
    const program = mapProgramaToProgram(
      programa,
      sellosPorPrograma.get(programa.id) || [],
      perdidaCorteCm,
    );
    const stored = ((programa as any).estado_programa || 'BORRADOR') as ProgramLifecycleState;
    if (
      program.estadoPrograma !== stored
      && (program.estadoPrograma === 'EN_FABRICACION' || program.estadoPrograma === 'FINALIZADO')
      && stored !== 'BLOQUEADO'
    ) {
      void supabase
        .from('programa')
        .update({ estado_programa: program.estadoPrograma } as any)
        .eq('id', programa.id);
    }
    return program;
  });
};

export const getProgramById = async (programId: string): Promise<Program | null> => {
  const { perdidaCorteCm } = await loadMaterialParams();

  const { data: programa, error } = await supabase
    .from('programa')
    .select('*')
    .eq('id', programId)
    .single();

  if (error) throw error;
  if (!programa) return null;

  const { data: sellos } = await supabase.from('sellos').select('*').eq('programa_id', programId);
  return mapProgramaToProgram(programa, sellos || [], perdidaCorteCm);
};

export const createProgram = async (program: Partial<Program>): Promise<Program> => {
  const { perdidaCorteCm, maxMm } = await loadMaterialParams();
  const machine = (program.machine || 'C') as ProgramMachineType;
  const stampIds = (program.stamps || []).map((s) => s.id).filter(Boolean);

  if (stampIds.length > 0) {
    const { data: sellosCheck, error: checkErr } = await supabase
      .from('sellos')
      .select('*')
      .in('id', stampIds);
    if (checkErr) throw checkErr;

    const lengthsPreview = accumulateLengthByPlanchuela(
      (sellosCheck || []).map((s) => ({
        anchoRealCm: s.ancho_real,
        largoRealCm: s.largo_real,
        tipoPlanchuela: s.tipo_planchuela as PlanchuelaSize | null,
      })),
      perdidaCorteCm,
    );

    for (const [refStr, used] of Object.entries(lengthsPreview)) {
      const ref = Number(refStr) as PlanchuelaSize;
      const errMsg = validatePlanchuelaLengthLimit({
        machine,
        tipoPlanchuela: ref,
        currentMm: 0,
        extraMm: used || 0,
        maxOverrides: maxMm,
      });
      if (errMsg) throw new ProgramServiceError(errMsg);
    }
  }

  const programaData: Record<string, unknown> = {
    nombre: program.name || 'Nuevo Programa',
    fecha: program.productionDate || todayArgentinaDateKey(),
    maquina: machine,
    estado_fabricacion: 'Sin Hacer',
    verificado: program.isVerified || false,
    descripcion: program.description || null,
    bloqueado: false,
    dirty: true,
    estado_programa: 'BORRADOR',
    ...lengthsToDbColumns({}),
  };

  const { data: nuevoPrograma, error } = await supabase
    .from('programa')
    .insert(programaData as any)
    .select()
    .single();

  if (error) throw error;

  if (stampIds.length > 0) {
    await addStampsToProgram(nuevoPrograma.id, stampIds, { skipEditableCheck: true });
  }

  const created = await getProgramById(nuevoPrograma.id);
  if (!created) throw new ProgramServiceError('No se pudo leer el programa creado');
  return created;
};

export const updateProgram = async (
  programId: string,
  updates: Partial<Program>,
): Promise<Program> => {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) updateData.nombre = updates.name;
  if (updates.productionDate !== undefined) updateData.fecha = updates.productionDate;
  if (updates.machine !== undefined) updateData.maquina = updates.machine;
  if (updates.description !== undefined) updateData.descripcion = updates.description || null;
  if (updates.isVerified !== undefined) updateData.verificado = updates.isVerified;
  if (updates.fabricationState !== undefined) {
    updateData.estado_fabricacion = mapFabricationStateToDB(updates.fabricationState);
  }

  const { error } = await supabase.from('programa').update(updateData as any).eq('id', programId);
  if (error) throw error;

  const result = await getProgramById(programId);
  if (!result) throw new ProgramServiceError('Programa no encontrado tras actualizar');
  return result;
};

export type RemoveStampRestoreMode = 'PREVIOUS' | 'NEW';

export const deleteProgram = async (
  programId: string,
  options?: {
    restoreMode?: RemoveStampRestoreMode;
    newFabricationState?: FabricationState;
  },
): Promise<void> => {
  const program = await getProgramById(programId);
  if (!program) throw new ProgramServiceError('Programa no encontrado');

  if (program.bloqueado || LOCKED_STATES.includes(program.estadoPrograma)) {
    throw new ProgramServiceError('Desbloqueá el programa antes de borrarlo.');
  }

  const restoreMode = options?.restoreMode || 'PREVIOUS';
  for (const stamp of program.stamps) {
    await removeStampFromProgram(programId, stamp.id, {
      restoreMode,
      newFabricationState: options?.newFabricationState,
      skipEditableCheck: true,
      skipDirty: true,
    });
  }

  if (program.archivoZipUrl) {
    try {
      const pathMatch = program.archivoZipUrl.match(/programas-zip\/(.+)$/);
      if (pathMatch?.[1]) {
        await supabase.storage.from('programas-zip').remove([decodeURIComponent(pathMatch[1])]);
      }
    } catch (e) {
      console.warn('No se pudo borrar ZIP del storage:', e);
    }
  }

  const { error } = await supabase.from('programa').delete().eq('id', programId);
  if (error) throw error;
};

export const getEligibleStamps = async (opts: {
  machine: ProgramMachineType;
  excludeStampIds?: string[];
}): Promise<ProgramStamp[]> => {
  const { perdidaCorteCm } = await loadMaterialParams();

  const { data, error } = await supabase
    .from('sellos')
    .select('*')
    .is('programa_id', null)
    .eq('item_type', 'SELLO')
    .eq('estado_vectorizacion', 'VECTORIZADO')
    .not('archivo_vector_preview', 'is', null)
    .in('estado_fabricacion', ['Sin Hacer', 'Prioridad', 'Rehacer']);

  if (error) throw error;

  const exclude = new Set(opts.excludeStampIds || []);

  const filtered = (data || [])
    .filter((s) => {
      if (exclude.has(s.id)) return false;
      if (!ELIGIBLE_FAB_STATES.has(s.estado_fabricacion || '')) return false;
      if (opts.machine === 'ABC') {
        return s.maquina == null || s.tipo === 'ABC';
      }
      return s.maquina == null || s.maquina === opts.machine;
    })
    .map((s) => mapSelloToProgramStamp(s, perdidaCorteCm));

  filtered.sort((a, b) => {
    if (Boolean(a.isPriority) !== Boolean(b.isPriority)) return a.isPriority ? -1 : 1;
    const da = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
    const db = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ca - cb;
  });

  return filtered;
};

export const addStampsToProgram = async (
  programId: string,
  stampIds: string[],
  options?: { skipEditableCheck?: boolean; confirmMachineOverride?: boolean },
): Promise<Program> => {
  if (!stampIds.length) {
    const p = await getProgramById(programId);
    if (!p) throw new ProgramServiceError('Programa no encontrado');
    return p;
  }

  const programa = options?.skipEditableCheck
    ? (await supabase.from('programa').select('*').eq('id', programId).single()).data
    : await assertProgramEditable(programId);

  if (!programa) throw new ProgramServiceError('Programa no encontrado');

  const machine = mapMachine(programa.maquina);
  const { perdidaCorteCm, maxMm } = await loadMaterialParams();

  const { data: existingSellos } = await supabase.from('sellos').select('*').eq('programa_id', programId);
  const currentLengths = accumulateLengthByPlanchuela(
    (existingSellos || []).map((s) => ({
      anchoRealCm: s.ancho_real,
      largoRealCm: s.largo_real,
      tipoPlanchuela: s.tipo_planchuela as PlanchuelaSize | null,
    })),
    perdidaCorteCm,
  );

  const { data: newSellos, error: sellosErr } = await supabase
    .from('sellos')
    .select('*')
    .in('id', stampIds);

  if (sellosErr) throw sellosErr;
  if (!newSellos?.length) throw new ProgramServiceError('No se encontraron los sellos');

  for (const sello of newSellos) {
    if (sello.programa_id && sello.programa_id !== programId) {
      throw new ProgramServiceError(
        `El sello "${sello.diseno || sello.id}" ya está en otro programa. Quitarlo primero.`,
      );
    }
    if (sello.estado_vectorizacion !== 'VECTORIZADO' || !sello.archivo_vector_preview) {
      throw new ProgramServiceError(`Sello sin vectorizar: ${sello.diseno || sello.id}`);
    }
    if (!ELIGIBLE_FAB_STATES.has(sello.estado_fabricacion || '')) {
      throw new ProgramServiceError(
        `El sello "${sello.diseno || sello.id}" no está en un estado elegible (Sin Hacer / Rehacer).`,
      );
    }
    if (sello.maquina && mapMachine(sello.maquina) !== machine && machine !== 'ABC') {
      if (!options?.confirmMachineOverride) {
        throw new ProgramServiceError(
          `El sello "${sello.diseno || sello.id}" tiene máquina ${sello.maquina}, distinta a ${machine}. Confirmá el cambio de máquina.`,
        );
      }
    }

    const dims = {
      anchoRealCm: sello.ancho_real,
      largoRealCm: sello.largo_real,
      tipoPlanchuela: sello.tipo_planchuela as PlanchuelaSize | null,
    };
    const ref = resolvePlanchuelaRef(dims);
    const extraMm = stampLengthAlongMm(dims, perdidaCorteCm);
    if (ref && extraMm > 0) {
      const errMsg = validatePlanchuelaLengthLimit({
        machine,
        tipoPlanchuela: ref,
        currentMm: currentLengths[ref] || 0,
        extraMm,
        maxOverrides: maxMm,
      });
      if (errMsg) throw new ProgramServiceError(errMsg);
      currentLengths[ref] = (currentLengths[ref] || 0) + extraMm;
    }
  }

  const aspire = aspireForMachine(machine);

  for (const sello of newSellos) {
    const updatePayload: Record<string, unknown> = {
      programa_id: programId,
      estado_fabricacion_previo: sello.estado_fabricacion,
      estado_fabricacion: 'Programado',
      updated_at: new Date().toISOString(),
    };
    if (!sello.maquina || options?.confirmMachineOverride) {
      if (machine !== 'ABC') updatePayload.maquina = machine;
    }
    if (aspire) updatePayload.estado_aspire = aspire;

    const { error } = await supabase.from('sellos').update(updatePayload as any).eq('id', sello.id);
    if (error) throw error;
  }

  await recalculateAndPersistLengths(programId, perdidaCorteCm);
  await markProgramDirtyAfterEdit(programId, Boolean((programa as any).archivo_zip_url));

  const total = (existingSellos?.length || 0) + newSellos.length;
  if (programa.nombre && /x\d+/.test(programa.nombre)) {
    const newName = programa.nombre.replace(/x\d+/, `x${total}`);
    await supabase.from('programa').update({ nombre: newName } as any).eq('id', programId);
  }

  const result = await getProgramById(programId);
  if (!result) throw new ProgramServiceError('Programa no encontrado');
  return result;
};

export const removeStampFromProgram = async (
  programId: string,
  stampId: string,
  options: {
    restoreMode: RemoveStampRestoreMode;
    newFabricationState?: FabricationState;
    skipEditableCheck?: boolean;
    skipDirty?: boolean;
  },
): Promise<Program | null> => {
  if (!options.skipEditableCheck) {
    await assertProgramEditable(programId);
  }

  const { data: sello, error } = await supabase.from('sellos').select('*').eq('id', stampId).single();
  if (error || !sello) throw new ProgramServiceError('Sello no encontrado');
  if (sello.programa_id !== programId) {
    throw new ProgramServiceError('El sello no pertenece a este programa');
  }

  let nextState: string;
  if (options.restoreMode === 'PREVIOUS') {
    nextState = (sello as any).estado_fabricacion_previo || 'Sin Hacer';
  } else {
    if (!options.newFabricationState) {
      throw new ProgramServiceError('Debés elegir un estado de fabricación nuevo');
    }
    nextState = mapFabricationStateToDB(options.newFabricationState);
  }

  const { error: updErr } = await supabase
    .from('sellos')
    .update({
      programa_id: null,
      estado_fabricacion_previo: null,
      estado_fabricacion: nextState,
      estado_aspire: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', stampId);

  if (updErr) throw updErr;

  const { perdidaCorteCm } = await loadMaterialParams();
  await recalculateAndPersistLengths(programId, perdidaCorteCm);

  if (!options.skipDirty) {
    const { data: programa } = await supabase
      .from('programa')
      .select('archivo_zip_url, nombre, cantidad_sellos')
      .eq('id', programId)
      .maybeSingle();
    await markProgramDirtyAfterEdit(programId, Boolean((programa as any)?.archivo_zip_url));

    if (programa?.nombre && /x\d+/.test(programa.nombre)) {
      const remaining = Math.max(0, (programa.cantidad_sellos || 1) - 1);
      const newName = programa.nombre.replace(/x\d+/, `x${remaining}`);
      await supabase.from('programa').update({ nombre: newName } as any).eq('id', programId);
    }
  }

  return getProgramById(programId);
};

export const lockProgram = async (programId: string, userId?: string): Promise<Program> => {
  const { error } = await supabase
    .from('programa')
    .update({
      bloqueado: true,
      bloqueado_at: new Date().toISOString(),
      bloqueado_por: userId || null,
      estado_programa: 'BLOQUEADO',
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', programId);

  if (error) throw error;
  const result = await getProgramById(programId);
  if (!result) throw new ProgramServiceError('Programa no encontrado');
  return result;
};

export const unlockProgram = async (programId: string): Promise<Program> => {
  const { error } = await supabase
    .from('programa')
    .update({
      bloqueado: false,
      bloqueado_at: null,
      bloqueado_por: null,
      estado_programa: 'BORRADOR',
      dirty: true,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', programId);

  if (error) throw error;
  const result = await getProgramById(programId);
  if (!result) throw new ProgramServiceError('Programa no encontrado');
  return result;
};

export type ProgramBaseMachine = 'C' | 'G' | 'XL';

export type ProgramBaseFileInfo = {
  maquina: ProgramBaseMachine;
  archivo_base_url: string;
  updated_at: string;
};

export const getBaseFileUrl = async (machine: ProgramMachineType): Promise<string | null> => {
  if (machine === 'ABC') return null;
  const { data, error } = await supabase
    .from('programa_archivos_base')
    .select('archivo_base_url')
    .eq('maquina', machine)
    .maybeSingle();
  if (error) throw error;
  return data?.archivo_base_url || null;
};

export const listProgramBaseFiles = async (): Promise<ProgramBaseFileInfo[]> => {
  const { data, error } = await supabase
    .from('programa_archivos_base')
    .select('maquina, archivo_base_url, updated_at')
    .order('maquina');
  if (error) throw error;
  return (data || []) as ProgramBaseFileInfo[];
};

/** Sube un .crv3d (u otro archivo Aspire) al bucket programas-base y lo registra en programa_archivos_base. */
export const uploadProgramBaseFile = async (
  machine: ProgramBaseMachine,
  file: File,
): Promise<ProgramBaseFileInfo> => {
  const ext = (file.name.split('.').pop() || 'crv3d').toLowerCase();
  const allowed = new Set(['crv3d', 'crv', 'zip']);
  if (!allowed.has(ext)) {
    throw new ProgramServiceError('Formato no válido. Usá un archivo .crv3d (o .crv).');
  }

  const path = `${machine}/programa-base.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('programas-base')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/octet-stream',
    });

  if (uploadError) {
    throw new ProgramServiceError(`No se pudo subir el archivo: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage.from('programas-base').getPublicUrl(path);
  const archivo_base_url = publicData.publicUrl;
  const updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('programa_archivos_base')
    .upsert(
      { maquina: machine, archivo_base_url, updated_at } as any,
      { onConflict: 'maquina' },
    )
    .select('maquina, archivo_base_url, updated_at')
    .single();

  if (error) {
    throw new ProgramServiceError(`Archivo subido pero no se pudo registrar: ${error.message}`);
  }

  return data as ProgramBaseFileInfo;
};

export const markProgramPackageReady = async (
  programId: string,
  zipUrl: string,
): Promise<Program> => {
  const { error } = await supabase
    .from('programa')
    .update({
      archivo_zip_url: zipUrl,
      archivo_zip_generado_at: new Date().toISOString(),
      dirty: false,
      estado_programa: 'LISTO',
      updated_at: new Date().toISOString(),
    } as any)
    .eq('id', programId);

  if (error) throw error;
  const result = await getProgramById(programId);
  if (!result) throw new ProgramServiceError('Programa no encontrado');
  return result;
};

export const releaseStampFromAnyProgram = async (stampId: string): Promise<void> => {
  const { data: sello } = await supabase
    .from('sellos')
    .select('id, programa_id, estado_fabricacion_previo, estado_fabricacion')
    .eq('id', stampId)
    .maybeSingle();

  if (!sello?.programa_id) return;

  const programId = sello.programa_id;
  const prev = (sello as any).estado_fabricacion_previo || 'Sin Hacer';

  await supabase
    .from('sellos')
    .update({
      programa_id: null,
      estado_fabricacion_previo: null,
      estado_fabricacion: prev,
      estado_aspire: null,
    } as any)
    .eq('id', stampId);

  const { perdidaCorteCm } = await loadMaterialParams();
  await recalculateAndPersistLengths(programId, perdidaCorteCm);

  const { data: programa } = await supabase
    .from('programa')
    .select('archivo_zip_url, estado_programa, bloqueado')
    .eq('id', programId)
    .maybeSingle();

  if (!programa) return;

  const estado = (programa as any).estado_programa as ProgramLifecycleState;
  const update: Record<string, unknown> = {
    dirty: true,
    updated_at: new Date().toISOString(),
  };
  if (estado === 'LISTO') update.estado_programa = 'BORRADOR';
  await supabase.from('programa').update(update as any).eq('id', programId);
};

export const canDownloadPackage = (machine: ProgramMachineType): boolean => machine !== 'ABC';

export const getMachineMaxLengthMm = getMaxLengthMmForMachine;
