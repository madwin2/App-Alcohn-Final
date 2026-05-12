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
          costo_fabricacion_total: number | null;
          margen_fabricacion_total: number | null;
          restante: number | null;
          seguimiento: string | null;
          estado_orden: 'Señado' | 'Hecho' | 'Foto' | 'Transferido' | 'Hacer Etiqueta' | 'Etiqueta Lista' | 'Despachado' | 'Seguimiento Enviado' | null;
          fecha: string | null;
          estado_envio:
            | 'Sin envio'
            | 'Hacer Etiqueta'
            | 'Etiqueta Lista'
            | 'Error de Etiqueta'
            | 'Despachado'
            | 'Seguimiento Enviado'
            | null;
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
          costo_fabricacion: number | null;
          margen_fabricacion: number | null;
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
          item_type: 'SELLO' | 'ABECEDARIO' | 'SOLDADOR' | 'MANGO_GOLPE' | 'BASE_REMACHADORA' | null;
          item_config: Record<string, any> | null;
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
      fabricacion_parametros: {
        Row: {
          id: string;
          effective_from: string;
          params: Record<string, number>;
          created_at: string;
          note: string | null;
        };
        Insert: {
          id?: string;
          effective_from: string;
          params: Record<string, number>;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          effective_from: string;
          params: Record<string, number>;
          note: string | null;
        }>;
      };
      economia_movimientos_reales: {
        Row: {
          id: string;
          movement_date: string;
          movement_type: 'USD_PURCHASE' | 'INV_EMPRESA' | 'INV_CYPREA';
          amount_ars: number;
          amount_usd: number | null;
          usd_rate: number | null;
          note: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          movement_date: string;
          movement_type: 'USD_PURCHASE' | 'INV_EMPRESA' | 'INV_CYPREA';
          amount_ars: number;
          amount_usd?: number | null;
          usd_rate?: number | null;
          note?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          movement_date: string;
          movement_type: 'USD_PURCHASE' | 'INV_EMPRESA' | 'INV_CYPREA';
          amount_ars: number;
          amount_usd: number | null;
          usd_rate: number | null;
          note: string | null;
          updated_at: string;
        }>;
      };
      economia_settings: {
        Row: {
          user_id: string;
          usd_reference: number;
          caja_efectivo: number;
          caja_mercadopago: number;
          caja_santander_catalina: number;
          caja_santander_julian: number;
          caja_bbva: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          usd_reference?: number;
          caja_efectivo?: number;
          caja_mercadopago?: number;
          caja_santander_catalina?: number;
          caja_santander_julian?: number;
          caja_bbva?: number;
          updated_at?: string;
        };
        Update: Partial<{
          usd_reference: number;
          caja_efectivo: number;
          caja_mercadopago: number;
          caja_santander_catalina: number;
          caja_santander_julian: number;
          caja_bbva: number;
          updated_at: string;
        }>;
      };
      economia_gastos_mensuales: {
        Row: {
          user_id: string;
          months: Record<string, unknown>;
          legacy_fixed_scalar: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          months?: Record<string, unknown>;
          legacy_fixed_scalar?: number;
          updated_at?: string;
        };
        Update: Partial<{
          months: Record<string, unknown>;
          legacy_fixed_scalar: number;
          updated_at: string;
        }>;
      };
      mockup_solicitudes: {
        Row: {
          id: string;
          nombre_muestra: string | null;
          nombre_slug: string;
          whatsapp: string | null;
          material: 'cuero' | 'madera' | 'ambos';
          omitir_analisis: boolean;
          preparado_con_simplificar_ia: boolean;
          estado: 'procesando' | 'pendiente_aprobacion' | 'completado' | 'error';
          archivo_base_url: string | null;
          archivo_base_path: string | null;
          validacion: Record<string, unknown> | null;
          imagen_optimizada_url: string | null;
          imagen_optimizada_path: string | null;
          mockup_cuero_url: string | null;
          mockup_cuero_path: string | null;
          mockup_madera_url: string | null;
          mockup_madera_path: string | null;
          intentos_optimizacion: number;
          logo_trazo_ancho_px: number | null;
          logo_trazo_alto_px: number | null;
          logo_trazo_ratio_w_h: number | null;
          logo_trazo_ratio_label: string | null;
          logo_trazo_bbox_fallback: boolean | null;
          mensaje_error: string | null;
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre_muestra?: string | null;
          nombre_slug: string;
          whatsapp?: string | null;
          material: 'cuero' | 'madera' | 'ambos';
          omitir_analisis?: boolean;
          preparado_con_simplificar_ia?: boolean;
          estado?: 'procesando' | 'pendiente_aprobacion' | 'completado' | 'error';
          archivo_base_url?: string | null;
          archivo_base_path?: string | null;
          validacion?: Record<string, unknown> | null;
          imagen_optimizada_url?: string | null;
          imagen_optimizada_path?: string | null;
          mockup_cuero_url?: string | null;
          mockup_cuero_path?: string | null;
          mockup_madera_url?: string | null;
          mockup_madera_path?: string | null;
          intentos_optimizacion?: number;
          logo_trazo_ancho_px?: number | null;
          logo_trazo_alto_px?: number | null;
          logo_trazo_ratio_w_h?: number | null;
          logo_trazo_ratio_label?: string | null;
          logo_trazo_bbox_fallback?: boolean | null;
          mensaje_error?: string | null;
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          nombre_muestra: string | null;
          nombre_slug: string;
          whatsapp: string | null;
          material: 'cuero' | 'madera' | 'ambos';
          omitir_analisis: boolean;
          preparado_con_simplificar_ia: boolean;
          estado: 'procesando' | 'pendiente_aprobacion' | 'completado' | 'error';
          archivo_base_url: string | null;
          archivo_base_path: string | null;
          validacion: Record<string, unknown> | null;
          imagen_optimizada_url: string | null;
          imagen_optimizada_path: string | null;
          mockup_cuero_url: string | null;
          mockup_cuero_path: string | null;
          mockup_madera_url: string | null;
          mockup_madera_path: string | null;
          intentos_optimizacion: number;
          logo_trazo_ancho_px: number | null;
          logo_trazo_alto_px: number | null;
          logo_trazo_ratio_w_h: number | null;
          logo_trazo_ratio_label: string | null;
          logo_trazo_bbox_fallback: boolean | null;
          mensaje_error: string | null;
          creado_por: string | null;
          updated_at: string;
        }>;
      };
      precios_config: {
        Row: {
          user_id: string;
          nota_presupuesto: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          nota_presupuesto?: string | null;
          updated_at?: string;
        };
        Update: Partial<{
          nota_presupuesto: string | null;
          updated_at: string;
        }>;
      };
      precios_sello_grupo: {
        Row: {
          user_id: string;
          codigo: string;
          titulo: string;
          medidas_resumen: string | null;
          precio_transferencia: number;
          orden: number;
        };
        Insert: {
          user_id: string;
          codigo: string;
          titulo: string;
          medidas_resumen?: string | null;
          precio_transferencia?: number;
          orden?: number;
        };
        Update: Partial<{
          titulo: string;
          medidas_resumen: string | null;
          precio_transferencia: number;
          orden: number;
        }>;
      };
      precios_sello_medida_grupo: {
        Row: {
          user_id: string;
          ancho: number;
          largo: number;
          grupo_codigo: string;
        };
        Insert: {
          user_id: string;
          ancho: number;
          largo: number;
          grupo_codigo: string;
        };
        Update: Partial<{
          grupo_codigo: string;
        }>;
      };
      precios_sello_medida_fija: {
        Row: {
          user_id: string;
          ancho: number;
          largo: number;
          etiqueta: string | null;
          precio_transferencia: number;
        };
        Insert: {
          user_id: string;
          ancho: number;
          largo: number;
          etiqueta?: string | null;
          precio_transferencia: number;
        };
        Update: Partial<{
          etiqueta: string | null;
          precio_transferencia: number;
        }>;
      };
      precios_accesorio: {
        Row: {
          user_id: string;
          codigo: string;
          etiqueta: string;
          precio_transferencia: number;
        };
        Insert: {
          user_id: string;
          codigo: string;
          etiqueta: string;
          precio_transferencia?: number;
        };
        Update: Partial<{
          etiqueta: string;
          precio_transferencia: number;
        }>;
      };
      precios_abecedario: {
        Row: {
          id: string;
          user_id: string;
          categoria: string;
          detalle: string;
          precio_transferencia: number;
          orden: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          categoria: string;
          detalle: string;
          precio_transferencia?: number;
          orden?: number;
        };
        Update: Partial<{
          categoria: string;
          detalle: string;
          precio_transferencia: number;
          orden: number;
        }>;
      };
      precios_sello_redondo: {
        Row: {
          id: string;
          user_id: string;
          rango: string;
          precio_simple: number;
          precio_intermedio: number;
          precio_complejo: number;
          orden: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          rango: string;
          precio_simple?: number;
          precio_intermedio?: number;
          precio_complejo?: number;
          orden?: number;
        };
        Update: Partial<{
          rango: string;
          precio_simple: number;
          precio_intermedio: number;
          precio_complejo: number;
          orden: number;
        }>;
      };
    };
  };
}

