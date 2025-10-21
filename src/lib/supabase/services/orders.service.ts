import { supabase } from '../client';
import type { Orden, OrdenInsert, OrdenUpdate, Sello, SelloInsert, SelloUpdate } from '../types';

// Servicio para órdenes
export class OrdersService {
  // Obtener todas las órdenes con información del cliente
  static async getAll() {
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        *,
        clientes:cliente_id (
          id,
          nombre,
          apellido,
          telefono,
          mail
        ),
        direcciones:direccion_id (
          id,
          domicilio,
          localidad,
          provincia
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Obtener una orden específica con sus sellos
  static async getById(id: string) {
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        *,
        clientes:cliente_id (
          id,
          nombre,
          apellido,
          telefono,
          mail,
          medio_contacto
        ),
        direcciones:direccion_id (
          id,
          domicilio,
          localidad,
          provincia,
          codigo_postal,
          nombre,
          apellido,
          telefono
        ),
        sellos (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Crear nueva orden
  static async create(orden: OrdenInsert) {
    const { data, error } = await supabase
      .from('ordenes')
      .insert(orden)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar orden
  static async update(id: string, updates: OrdenUpdate) {
    const { data, error } = await supabase
      .from('ordenes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar orden
  static async delete(id: string) {
    const { error } = await supabase
      .from('ordenes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener órdenes por estado
  static async getByEstado(estado: string) {
    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        *,
        clientes:cliente_id (
          id,
          nombre,
          apellido,
          telefono
        )
      `)
      .eq('estado_orden', estado)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

// Servicio para sellos
export class SellosService {
  // Obtener sellos de una orden
  static async getByOrdenId(ordenId: string) {
    const { data, error } = await supabase
      .from('sellos')
      .select('*')
      .eq('orden_id', ordenId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Crear nuevo sello
  static async create(sello: SelloInsert) {
    const { data, error } = await supabase
      .from('sellos')
      .insert(sello)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar sello
  static async update(id: string, updates: SelloUpdate) {
    const { data, error } = await supabase
      .from('sellos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar sello
  static async delete(id: string) {
    const { error } = await supabase
      .from('sellos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener sellos por estado de fabricación
  static async getByEstadoFabricacion(estado: string) {
    const { data, error } = await supabase
      .from('sellos')
      .select(`
        *,
        ordenes:orden_id (
          id,
          cliente_id,
          clientes:cliente_id (
            nombre,
            apellido
          )
        )
      `)
      .eq('estado_fabricacion', estado)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}
