import { supabase } from '../client';
import { ClientsService, OrdersService, SellosService } from './index';
import type { ClienteInsert, OrdenInsert, SelloInsert } from '../types';

export interface CreateOrderData {
  // Datos del cliente
  cliente: {
    nombre: string;
    apellido: string;
    telefono: string;
    mail?: string;
    medio_contacto?: 'Whatsapp' | 'Facebook' | 'Instagram' | 'Mail';
    dni?: string;
  };
  
  // Datos de la orden
  orden: {
    empresa_envio?: 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro';
    tipo_envio?: 'Domicilio' | 'Sucursal' | 'Retiro';
    estado_orden?: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado';
    estado_envio?: 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado';
    seguimiento?: string;
  };
  
  // Datos del sello
  sello: {
    tipo: 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC';
    valor: number;
    senia: number;
    fecha_limite?: string;
    diseno?: string;
    nota?: string;
    estado_fabricacion?: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar';
    estado_venta?: 'Señado' | 'Foto' | 'Transferido';
    archivo_base?: string;
    foto_sello?: string;
    tipo_planchuela?: number;
    tiempo?: number;
    maquina?: 'C' | 'G' | 'XL' | 'ABC' | 'Circular';
    largo_real?: number;
    ancho_real?: number;
  };
}

export class OrdersCompleteService {
  // Crear un pedido completo (cliente + orden + sello)
  static async createCompleteOrder(data: CreateOrderData) {
    try {
      console.log('Creating complete order with data:', data);
      
      // 1. Crear cliente
      console.log('Creating cliente...');
      const cliente = await ClientsService.create({
        nombre: data.cliente.nombre,
        apellido: data.cliente.apellido,
        telefono: data.cliente.telefono,
        mail: data.cliente.mail || null,
        medio_contacto: data.cliente.medio_contacto || null,
        dni: data.cliente.dni || null
      });
      console.log('Cliente created:', cliente);

      // 2. Crear orden
      console.log('Creating orden...');
      const orden = await OrdersService.create({
        cliente_id: cliente.id,
        empresa_envio: data.orden.empresa_envio || null,
        tipo_envio: data.orden.tipo_envio || null,
        estado_orden: data.orden.estado_orden || 'Señado',
        estado_envio: data.orden.estado_envio || 'Sin envio',
        seguimiento: data.orden.seguimiento || null,
        fecha: new Date().toISOString().split('T')[0]
      });
      console.log('Orden created:', orden);

      // 3. Crear sello
      console.log('Creating sello...');
      const sello = await SellosService.create({
        orden_id: orden.id,
        tipo: data.sello.tipo,
        valor: data.sello.valor,
        senia: data.sello.senia,
        fecha_limite: data.sello.fecha_limite || null,
        diseno: data.sello.diseno || null,
        nota: data.sello.nota || null,
        estado_fabricacion: data.sello.estado_fabricacion || 'Sin Hacer',
        estado_venta: data.sello.estado_venta || 'Señado',
        archivo_base: data.sello.archivo_base || null,
        foto_sello: data.sello.foto_sello || null,
        tipo_planchuela: data.sello.tipo_planchuela || null,
        tiempo: data.sello.tiempo || null,
        maquina: data.sello.maquina || null,
        largo_real: data.sello.largo_real || null,
        ancho_real: data.sello.ancho_real || null
      });
      console.log('Sello created:', sello);

      return {
        cliente,
        orden,
        sello
      };
    } catch (error) {
      console.error('Error creating complete order:', error);
      
      // Proporcionar más información sobre el error
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === '42501') {
          throw new Error('Error de permisos: Las políticas de seguridad están bloqueando la inserción. Ejecuta el script fix_rls_policies.sql en Supabase.');
        }
      }
      
      throw error;
    }
  }

  // Crear múltiples sellos para una orden existente
  static async addSellosToOrder(ordenId: string, sellos: Omit<SelloInsert, 'orden_id'>[]) {
    try {
      const createdSellos = [];
      
      for (const selloData of sellos) {
        const sello = await SellosService.create({
          ...selloData,
          orden_id: ordenId
        });
        createdSellos.push(sello);
      }
      
      return createdSellos;
    } catch (error) {
      console.error('Error adding sellos to order:', error);
      throw error;
    }
  }

  // Obtener orden completa con cliente y sellos
  static async getCompleteOrder(ordenId: string) {
    try {
      const orden = await OrdersService.getById(ordenId);
      return orden;
    } catch (error) {
      console.error('Error getting complete order:', error);
      throw error;
    }
  }
}
