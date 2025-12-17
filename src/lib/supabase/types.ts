// Tipos de base de datos de Supabase
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
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['clientes']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>;
      };
      direcciones: {
        Row: {
          id: string;
          cliente_id: string;
          activa: boolean | null;
          codigo_postal: string;
          provincia: string;
          localidad: string;
          domicilio: string;
          nombre: string;
          apellido: string;
          telefono: string | null;
          dni: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['direcciones']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['direcciones']['Insert']>;
      };
      ordenes: {
        Row: {
          id: string;
          cliente_id: string;
          direccion_id: string | null;
          empresa_envio: 'Andreani' | 'Correo Argentino' | 'Via Cargo' | 'Retiro' | null;
          tipo_envio: 'Domicilio' | 'Sucursal' | 'Retiro' | null;
          cantidad_sellos: number | null;
          senia_total: number | null;
          valor_total: number | null;
          restante: number | null;
          seguimiento: string | null;
          estado_orden: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          fecha: string | null;
          estado_envio: 'Sin envio' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          taken_by: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['ordenes']['Row'], 'id' | 'created_at' | 'updated_at' | 'cantidad_sellos' | 'senia_total' | 'valor_total' | 'restante'>;
        Update: Partial<Database['public']['Tables']['ordenes']['Insert']>;
      };
      sellos: {
        Row: {
          id: string;
          orden_id: string;
          programa_id: string | null;
          fecha: string | null;
          tipo: 'Clasico' | '3mm' | 'Lacre' | 'Alimento' | 'ABC' | null;
          senia: number | null;
          fecha_limite: string | null;
          diseno: string | null;
          nota: string | null;
          valor: number;
          restante: number | null;
          estado_fabricacion: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Rehacer' | 'Retocar' | 'Prioridad' | 'Verificar' | null;
          estado_venta: 'Señado' | 'Foto' | 'Transferido' | null;
          archivo_base: string | null;
          foto_sello: string | null;
          archivo_vector_preview: string | null;
          tipo_planchuela: 100 | 63 | 38 | 25 | 19 | 12 | null;
          tiempo: number | null;
          maquina: 'C' | 'G' | 'XL' | null;
          estado_aspire: 'Aspire G' | 'Aspire G Check' | 'Aspire C' | 'Aspire C Check' | 'Aspire XL' | null;
          largo_real: number | null;
          ancho_real: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['sellos']['Row'], 'id' | 'created_at' | 'updated_at' | 'restante'>;
        Update: Partial<Database['public']['Tables']['sellos']['Insert']>;
      };
      programa: {
        Row: {
          id: string;
          fecha: string | null;
          nombre: string;
          cantidad_sellos: number | null;
          maquina: 'C' | 'G' | 'XL' | 'ABC' | 'Circular' | null;
          estado_fabricacion: 'Sin Hacer' | 'Haciendo' | 'Hecho' | 'Verificado' | 'Rehacer' | null;
          tiempo_maximo: number | null;
          largo_usado_63: number | null;
          largo_usado_38: number | null;
          largo_usado_25: number | null;
          largo_usado_19: number | null;
          largo_usado_12: number | null;
          verificado: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['programa']['Row'], 'id' | 'created_at' | 'updated_at' | 'cantidad_sellos'>;
        Update: Partial<Database['public']['Tables']['programa']['Insert']>;
      };
      costos_de_envio: {
        Row: {
          id: string;
          empresa: 'Andreani' | 'Correo Argentino' | 'Via Cargo';
          servicio: 'Domicilio' | 'Sucursal';
          costo: number;
          activo_desde: string | null;
          activo: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['costos_de_envio']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['costos_de_envio']['Insert']>;
      };
    };
  };
}

