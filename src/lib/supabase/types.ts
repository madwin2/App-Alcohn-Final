// Tipos de la base de datos generados automáticamente
export interface Database {
  public: {
    Tables: {
      clientes: {
        Row: {
          id: string;
          nombre: string;
          apellido: string;
          medio_contacto: 'Whatsapp' | 'Facebook' | 'Instagram' | 'Mail' | null;
          telefono: string;
          dni: string | null;
          mail: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          apellido: string;
          medio_contacto?: 'Whatsapp' | 'Facebook' | 'Instagram' | 'Mail' | null;
          telefono: string;
          dni?: string | null;
          mail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          apellido?: string;
          medio_contacto?: 'Whatsapp' | 'Facebook' | 'Instagram' | 'Mail' | null;
          telefono?: string;
          dni?: string | null;
          mail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      direcciones: {
        Row: {
          id: string;
          cliente_id: string;
          activa: boolean;
          codigo_postal: string;
          provincia: string;
          localidad: string;
          domicilio: string;
          nombre: string;
          apellido: string;
          telefono: string | null;
          dni: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          activa?: boolean;
          codigo_postal: string;
          provincia: string;
          localidad: string;
          domicilio: string;
          nombre: string;
          apellido: string;
          telefono?: string | null;
          dni?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          activa?: boolean;
          codigo_postal?: string;
          provincia?: string;
          localidad?: string;
          domicilio?: string;
          nombre?: string;
          apellido?: string;
          telefono?: string | null;
          dni?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ordenes: {
        Row: {
          id: string;
          cliente_id: string;
          direccion_id: string | null;
          empresa_envio: 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro' | null;
          tipo_envio: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
          cantidad_sellos: number;
          senia_total: number;
          valor_total: number;
          restante: number;
          seguimiento: string | null;
          estado_orden: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          fecha: string;
          estado_envio: 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          direccion_id?: string | null;
          empresa_envio?: 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro' | null;
          tipo_envio?: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
          cantidad_sellos?: number;
          senia_total?: number;
          valor_total?: number;
          restante?: number;
          seguimiento?: string | null;
          estado_orden?: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          fecha?: string;
          estado_envio?: 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          direccion_id?: string | null;
          empresa_envio?: 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro' | null;
          tipo_envio?: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
          cantidad_sellos?: number;
          senia_total?: number;
          valor_total?: number;
          restante?: number;
          seguimiento?: string | null;
          estado_orden?: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          fecha?: string;
          estado_envio?: 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sellos: {
        Row: {
          id: string;
          orden_id: string;
          programa_id: string | null;
          fecha: string;
          tipo: 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC' | null;
          senia: number;
          fecha_limite: string | null;
          diseno: string | null;
          nota: string | null;
          valor: number;
          restante: number;
          estado_fabricacion: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar' | null;
          estado_venta: 'Señado' | 'Foto' | 'Transferido' | null;
          archivo_base: string | null;
          foto_sello: string | null;
          tipo_planchuela: number | null;
          tiempo: number | null;
          maquina: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          largo_real: number | null;
          ancho_real: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          orden_id: string;
          programa_id?: string | null;
          fecha?: string;
          tipo?: 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC' | null;
          senia?: number;
          fecha_limite?: string | null;
          diseno?: string | null;
          nota?: string | null;
          valor: number;
          restante?: number;
          estado_fabricacion?: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar' | null;
          estado_venta?: 'Señado' | 'Foto' | 'Transferido' | null;
          archivo_base?: string | null;
          foto_sello?: string | null;
          tipo_planchuela?: number | null;
          tiempo?: number | null;
          maquina?: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          largo_real?: number | null;
          ancho_real?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          orden_id?: string;
          programa_id?: string | null;
          fecha?: string;
          tipo?: 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC' | null;
          senia?: number;
          fecha_limite?: string | null;
          diseno?: string | null;
          nota?: string | null;
          valor?: number;
          restante?: number;
          estado_fabricacion?: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar' | null;
          estado_venta?: 'Señado' | 'Foto' | 'Transferido' | null;
          archivo_base?: string | null;
          foto_sello?: string | null;
          tipo_planchuela?: number | null;
          tiempo?: number | null;
          maquina?: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          largo_real?: number | null;
          ancho_real?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      programa: {
        Row: {
          id: string;
          fecha: string;
          nombre: string;
          cantidad_sellos: number;
          maquina: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          estado_fabricacion: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Verificado' | 'Rehacer' | null;
          tiempo_maximo: number | null;
          largo_usado_63: number;
          largo_usado_38: number;
          largo_usado_25: number;
          largo_usado_19: number;
          largo_usado_12: number;
          verificado: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fecha?: string;
          nombre: string;
          cantidad_sellos?: number;
          maquina?: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          estado_fabricacion?: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Verificado' | 'Rehacer' | null;
          tiempo_maximo?: number | null;
          largo_usado_63?: number;
          largo_usado_38?: number;
          largo_usado_25?: number;
          largo_usado_19?: number;
          largo_usado_12?: number;
          verificado?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fecha?: string;
          nombre?: string;
          cantidad_sellos?: number;
          maquina?: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          estado_fabricacion?: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Verificado' | 'Rehacer' | null;
          tiempo_maximo?: number | null;
          largo_usado_63?: number;
          largo_usado_38?: number;
          largo_usado_25?: number;
          largo_usado_19?: number;
          largo_usado_12?: number;
          verificado?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      costos_de_envio: {
        Row: {
          id: string;
          empresa: 'Andreani' | 'Correo Argentino' | 'Via Cargo';
          servicio: 'Domicilio' | 'Sucursal';
          costo: number;
          activo_desde: string;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          empresa: 'Andreani' | 'Correo Argentino' | 'Via Cargo';
          servicio: 'Domicilio' | 'Sucursal';
          costo: number;
          activo_desde?: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          empresa?: 'Andreani' | 'Correo Argentino' | 'Via Cargo';
          servicio?: 'Domicilio' | 'Sucursal';
          costo?: number;
          activo_desde?: string;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Tipos de conveniencia para el frontend
export type Cliente = Database['public']['Tables']['clientes']['Row'];
export type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];
export type ClienteUpdate = Database['public']['Tables']['clientes']['Update'];

export type Direccion = Database['public']['Tables']['direcciones']['Row'];
export type DireccionInsert = Database['public']['Tables']['direcciones']['Insert'];
export type DireccionUpdate = Database['public']['Tables']['direcciones']['Update'];

export type Orden = Database['public']['Tables']['ordenes']['Row'];
export type OrdenInsert = Database['public']['Tables']['ordenes']['Insert'];
export type OrdenUpdate = Database['public']['Tables']['ordenes']['Update'];

export type Sello = Database['public']['Tables']['sellos']['Row'];
export type SelloInsert = Database['public']['Tables']['sellos']['Insert'];
export type SelloUpdate = Database['public']['Tables']['sellos']['Update'];

export type Programa = Database['public']['Tables']['programa']['Row'];
export type ProgramaInsert = Database['public']['Tables']['programa']['Insert'];
export type ProgramaUpdate = Database['public']['Tables']['programa']['Update'];

export type CostoEnvio = Database['public']['Tables']['costos_de_envio']['Row'];
export type CostoEnvioInsert = Database['public']['Tables']['costos_de_envio']['Insert'];
export type CostoEnvioUpdate = Database['public']['Tables']['costos_de_envio']['Update'];
