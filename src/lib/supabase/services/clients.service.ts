import { supabase } from '../client';
import type { Cliente, ClienteInsert, ClienteUpdate, Direccion, DireccionInsert, DireccionUpdate } from '../types';

// Servicio para clientes
export class ClientsService {
  // Obtener todos los clientes
  static async getAll() {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Obtener cliente específico con sus direcciones
  static async getById(id: string) {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        direcciones (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Crear nuevo cliente
  static async create(cliente: ClienteInsert) {
    const { data, error } = await supabase
      .from('clientes')
      .insert(cliente)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar cliente
  static async update(id: string, updates: ClienteUpdate) {
    const { data, error } = await supabase
      .from('clientes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar cliente
  static async delete(id: string) {
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Buscar clientes por nombre o apellido
  static async search(query: string) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

// Servicio para direcciones
export class DireccionesService {
  // Obtener direcciones de un cliente
  static async getByClienteId(clienteId: string) {
    const { data, error } = await supabase
      .from('direcciones')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('activa', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Crear nueva dirección
  static async create(direccion: DireccionInsert) {
    const { data, error } = await supabase
      .from('direcciones')
      .insert(direccion)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar dirección
  static async update(id: string, updates: DireccionUpdate) {
    const { data, error } = await supabase
      .from('direcciones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar dirección (marcar como inactiva)
  static async delete(id: string) {
    const { data, error } = await supabase
      .from('direcciones')
      .update({ activa: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
