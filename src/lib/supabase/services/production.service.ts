import { supabase } from '../client';
import type { Programa, ProgramaInsert, ProgramaUpdate, Sello } from '../types';

// Servicio para programas de producción
export class ProductionService {
  // Obtener todos los programas
  static async getAll() {
    const { data, error } = await supabase
      .from('programa')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Obtener programa específico con sus sellos
  static async getById(id: string) {
    const { data, error } = await supabase
      .from('programa')
      .select(`
        *,
        sellos (
          *,
          ordenes:orden_id (
            id,
            clientes:cliente_id (
              nombre,
              apellido
            )
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Crear nuevo programa
  static async create(programa: ProgramaInsert) {
    const { data, error } = await supabase
      .from('programa')
      .insert(programa)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar programa
  static async update(id: string, updates: ProgramaUpdate) {
    const { data, error } = await supabase
      .from('programa')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar programa
  static async delete(id: string) {
    const { error } = await supabase
      .from('programa')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener programas por estado de fabricación
  static async getByEstadoFabricacion(estado: string) {
    const { data, error } = await supabase
      .from('programa')
      .select('*')
      .eq('estado_fabricacion', estado)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Obtener sellos por programa
  static async getSellosByPrograma(programaId: string) {
    const { data, error } = await supabase
      .from('sellos')
      .select(`
        *,
        ordenes:orden_id (
          id,
          clientes:cliente_id (
            nombre,
            apellido
          )
        )
      `)
      .eq('programa_id', programaId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Asignar sello a programa
  static async asignarSelloAPrograma(selloId: string, programaId: string) {
    const { data, error } = await supabase
      .from('sellos')
      .update({ programa_id: programaId })
      .eq('id', selloId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Remover sello de programa
  static async removerSelloDePrograma(selloId: string) {
    const { data, error } = await supabase
      .from('sellos')
      .update({ programa_id: null })
      .eq('id', selloId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
