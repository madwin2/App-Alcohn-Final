import { supabase } from '../client';
import { Program, ProgramStamp } from '../../types/index';
import { Database } from '../types';

type ProgramaRow = Database['public']['Tables']['programa']['Row'];
type SelloRow = Database['public']['Tables']['sellos']['Row'];

// Mapear estado de fabricación
const mapFabricationState = (estado: string | null): 'SIN_HACER' | 'HACIENDO' | 'VERIFICAR' | 'HECHO' | 'REHACER' | 'RETOCAR' => {
  const mapping: Record<string, 'SIN_HACER' | 'HACIENDO' | 'VERIFICAR' | 'HECHO' | 'REHACER' | 'RETOCAR'> = {
    'Sin Hacer': 'SIN_HACER',
    'Haciendo': 'HACIENDO',
    'Hecho': 'HECHO',
    'Verificado': 'VERIFICAR',
    'Rehacer': 'REHACER',
  };
  return estado ? (mapping[estado] || 'SIN_HACER') : 'SIN_HACER';
};

const mapFabricationStateToDB = (estado: 'SIN_HACER' | 'HACIENDO' | 'VERIFICAR' | 'HECHO' | 'REHACER' | 'RETOCAR'): string => {
  const mapping: Record<string, string> = {
    'SIN_HACER': 'Sin Hacer',
    'HACIENDO': 'Haciendo',
    'HECHO': 'Hecho',
    'VERIFICAR': 'Verificado',
    'REHACER': 'Rehacer',
    'RETOCAR': 'Haciendo',
  };
  return mapping[estado] || 'Sin Hacer';
};

// Mapear tipo de sello
const mapStampType = (tipo: string | null): 'CLASICO' | '3MM' | 'LACRE' | 'ALIMENTO' | 'ABC' => {
  const mapping: Record<string, 'CLASICO' | '3MM' | 'LACRE' | 'ALIMENTO' | 'ABC'> = {
    'Clasico': 'CLASICO',
    '3mm': '3MM',
    'Lacre': 'LACRE',
    'Alimento': 'ALIMENTO',
    'ABC': 'ABC',
  };
  return tipo ? (mapping[tipo] || 'CLASICO') : 'CLASICO';
};

// Mapear máquina
const mapMachine = (maquina: string | null): 'C' | 'G' | 'XL' | 'ABC' => {
  const mapping: Record<string, 'C' | 'G' | 'XL' | 'ABC'> = {
    'C': 'C',
    'G': 'G',
    'XL': 'XL',
    'ABC': 'ABC',
    'Circular': 'C', // Mapear Circular a C
  };
  return maquina ? (mapping[maquina] || 'C') : 'C';
};

// Obtener todos los programas con sus sellos
export const getPrograms = async (): Promise<Program[]> => {
  try {
    const { data: programas, error: programasError } = await supabase
      .from('programa')
      .select('*')
      .not('nombre', 'is', null) // Filtrar programas sin nombre
      .neq('nombre', '') // Filtrar programas con nombre vacío
      .order('fecha', { ascending: false });

    if (programasError) throw programasError;
    if (!programas) return [];
    
    // Filtrar adicionalmente programas con nombres vacíos o solo espacios en blanco
    const validPrograms = programas.filter(p => p.nombre && p.nombre.trim() !== '');

    // Obtener sellos para cada programa
    const programaIds = programas.map(p => p.id);
    const { data: sellos, error: sellosError } = await supabase
      .from('sellos')
      .select('*')
      .in('programa_id', programaIds);

    if (sellosError) throw sellosError;

    // Agrupar sellos por programa
    const sellosPorPrograma = new Map<string, SelloRow[]>();
    sellos?.forEach(sello => {
      if (sello.programa_id) {
        const lista = sellosPorPrograma.get(sello.programa_id) || [];
        lista.push(sello);
        sellosPorPrograma.set(sello.programa_id, lista);
      }
    });

    // Mapear a Program
    const programs: Program[] = validPrograms.map(programa => {
      const sellosDelPrograma = sellosPorPrograma.get(programa.id) || [];

      // Determinar lengthUsed basado en los largos usados
      let lengthUsed: 63 | 38 | 25 | 19 | 12 = 63;
      if (programa.largo_usado_63 && Number(programa.largo_usado_63) > 0) lengthUsed = 63;
      else if (programa.largo_usado_38 && Number(programa.largo_usado_38) > 0) lengthUsed = 38;
      else if (programa.largo_usado_25 && Number(programa.largo_usado_25) > 0) lengthUsed = 25;
      else if (programa.largo_usado_19 && Number(programa.largo_usado_19) > 0) lengthUsed = 19;
      else if (programa.largo_usado_12 && Number(programa.largo_usado_12) > 0) lengthUsed = 12;

      const stamps: ProgramStamp[] = sellosDelPrograma.map(sello => {
        const widthMm = sello.ancho_real ? Number(sello.ancho_real) * 10 : 50;
        const heightMm = sello.largo_real ? Number(sello.largo_real) * 10 : 30;

        return {
          id: sello.id,
          designName: sello.diseno || 'Sin diseño',
          widthMm,
          heightMm,
          stampType: mapStampType(sello.tipo),
          previewUrl: sello.foto_sello || undefined,
          isPriority: sello.estado_fabricacion === 'Prioridad',
          deadlineAt: sello.fecha_limite || undefined,
          createdAt: sello.created_at || undefined,
        };
      });

      return {
        id: programa.id,
        name: programa.nombre,
        description: '', // No hay campo descripción en la BD
        version: '1.0.0', // Valor por defecto
        status: programa.estado_fabricacion === 'Hecho' ? 'active' : 'active', // Siempre activo por ahora
        category: 'PRODUCTION', // Valor por defecto
        machine: mapMachine(programa.maquina),
        stampCount: programa.cantidad_sellos || stamps.length,
        productionDate: programa.fecha || new Date().toISOString().split('T')[0],
        notes: undefined, // No hay campo notas en la BD
        fabricationState: mapFabricationState(programa.estado_fabricacion),
        isVerified: programa.verificado || false,
        stamps,
        lengthUsed,
        createdAt: programa.created_at || new Date().toISOString(),
        lastUpdated: programa.updated_at || new Date().toISOString(),
        createdBy: 'system', // Valor por defecto
        tags: [],
        settings: {},
      };
    });

    return programs;
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  }
};

// Crear programa
export const createProgram = async (program: Partial<Program>): Promise<Program> => {
  try {
    const programaData = {
      nombre: program.name || 'Nuevo Programa',
      fecha: program.productionDate || new Date().toISOString().split('T')[0],
      maquina: program.machine || 'C',
      estado_fabricacion: program.fabricationState ? mapFabricationStateToDB(program.fabricationState) as any : 'Sin Hacer',
      verificado: program.isVerified || false,
      tiempo_maximo: undefined,
      largo_usado_63: program.lengthUsed === 63 ? 0 : null,
      largo_usado_38: program.lengthUsed === 38 ? 0 : null,
      largo_usado_25: program.lengthUsed === 25 ? 0 : null,
      largo_usado_19: program.lengthUsed === 19 ? 0 : null,
      largo_usado_12: program.lengthUsed === 12 ? 0 : null,
    };

    const { data: nuevoPrograma, error } = await supabase
      .from('programa')
      .insert(programaData)
      .select()
      .single();

    if (error) throw error;

    // Si hay sellos, asociarlos al programa
    if (program.stamps && program.stamps.length > 0) {
      const stampIds = program.stamps.map(s => s.id).filter(Boolean);
      if (stampIds.length > 0) {
        await supabase
          .from('sellos')
          .update({ programa_id: nuevoPrograma.id })
          .in('id', stampIds);
      }
    }

    return await getProgramById(nuevoPrograma.id) || program as Program;
  } catch (error) {
    console.error('Error creating program:', error);
    throw error;
  }
};

// Obtener programa por ID
export const getProgramById = async (programId: string): Promise<Program | null> => {
  try {
    const { data: programa, error } = await supabase
      .from('programa')
      .select('*')
      .eq('id', programId)
      .single();

    if (error) throw error;
    if (!programa) return null;

    const { data: sellos } = await supabase
      .from('sellos')
      .select('*')
      .eq('programa_id', programId);

    // Mapear igual que en getPrograms
    let lengthUsed: 63 | 38 | 25 | 19 | 12 = 63;
    if (programa.largo_usado_63 && Number(programa.largo_usado_63) > 0) lengthUsed = 63;
    else if (programa.largo_usado_38 && Number(programa.largo_usado_38) > 0) lengthUsed = 38;
    else if (programa.largo_usado_25 && Number(programa.largo_usado_25) > 0) lengthUsed = 25;
    else if (programa.largo_usado_19 && Number(programa.largo_usado_19) > 0) lengthUsed = 19;
    else if (programa.largo_usado_12 && Number(programa.largo_usado_12) > 0) lengthUsed = 12;

    const stamps: ProgramStamp[] = (sellos || []).map(sello => {
      const widthMm = sello.ancho_real ? Number(sello.ancho_real) * 10 : 50;
      const heightMm = sello.largo_real ? Number(sello.largo_real) * 10 : 30;

      return {
        id: sello.id,
        designName: sello.diseno || 'Sin diseño',
        widthMm,
        heightMm,
        stampType: mapStampType(sello.tipo),
        previewUrl: sello.foto_sello || undefined,
        isPriority: sello.estado_fabricacion === 'Prioridad',
        deadlineAt: sello.fecha_limite || undefined,
        createdAt: sello.created_at || undefined,
      };
    });

    return {
      id: programa.id,
      name: programa.nombre,
      description: '',
      version: '1.0.0',
      status: 'active',
      category: 'PRODUCTION',
      machine: mapMachine(programa.maquina),
      stampCount: programa.cantidad_sellos || stamps.length,
      productionDate: programa.fecha || new Date().toISOString().split('T')[0],
      notes: undefined,
      fabricationState: mapFabricationState(programa.estado_fabricacion),
      isVerified: programa.verificado || false,
      stamps,
      lengthUsed,
      createdAt: programa.created_at || new Date().toISOString(),
      lastUpdated: programa.updated_at || new Date().toISOString(),
      createdBy: 'system',
      tags: [],
      settings: {},
    };
  } catch (error) {
    console.error('Error fetching program:', error);
    throw error;
  }
};

// Actualizar programa
export const updateProgram = async (programId: string, updates: Partial<Program>): Promise<Program> => {
  try {
    const updateData: Partial<ProgramaRow> = {};

    if (updates.name) updateData.nombre = updates.name;
    if (updates.productionDate) updateData.fecha = updates.productionDate;
    if (updates.machine) updateData.maquina = updates.machine as any;
    if (updates.fabricationState) {
      updateData.estado_fabricacion = mapFabricationStateToDB(updates.fabricationState) as any;
    }
    if (updates.isVerified !== undefined) updateData.verificado = updates.isVerified;

    const { error } = await supabase
      .from('programa')
      .update(updateData)
      .eq('id', programId);

    if (error) throw error;

    return await getProgramById(programId) || updates as Program;
  } catch (error) {
    console.error('Error updating program:', error);
    throw error;
  }
};

// Eliminar programa
export const deleteProgram = async (programId: string): Promise<void> => {
  try {
    // Primero desasociar los sellos
    await supabase
      .from('sellos')
      .update({ programa_id: null })
      .eq('programa_id', programId);

    // Luego eliminar el programa
    const { error } = await supabase
      .from('programa')
      .delete()
      .eq('id', programId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting program:', error);
    throw error;
  }
};





