import type { PerfilEquipo } from '@/lib/supabase/services/equipo.service';
import type { IdeaCorcho } from '@/lib/supabase/services/equipoCorcho.service';

/**
 * Datos de ejemplo para ver el corcho lleno (`/corcho?demo=1`).
 * No se guardan en ningún lado: votar funciona solo en memoria.
 */
export const CORCHO_MOCK_VIEWER = 'demo-yo';

type MiembroMock = Pick<PerfilEquipo, 'userId' | 'nombre' | 'color' | 'activo'>;

const MIEMBROS: MiembroMock[] = [
  { userId: CORCHO_MOCK_VIEWER, nombre: 'Julián Moreno', color: '#F59E0B', activo: true },
  { userId: 'demo-sofi', nombre: 'Sofía Paz', color: '#EC4899', activo: true },
  { userId: 'demo-tomi', nombre: 'Tomás Ruiz', color: '#3B82F6', activo: true },
  { userId: 'demo-meli', nombre: 'Melina Ortiz', color: '#10B981', activo: true },
  { userId: 'demo-nico', nombre: 'Nicolás Vera', color: '#8B5CF6', activo: true },
];

export const CORCHO_MOCK_MIEMBROS = MIEMBROS as PerfilEquipo[];

const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();

function comentario(
  ideaId: string,
  n: number,
  autorUserId: string,
  texto: string,
  horas: number,
): IdeaCorcho['comentarios'][number] {
  return { id: `demo-c-${ideaId}-${n}`, ideaId: `demo-${ideaId}`, autorUserId, texto, createdAt: hace(horas) };
}

function idea(
  id: string,
  autorUserId: string,
  titulo: string,
  descripcion: string | null,
  horas: number,
  votos: [string, 1 | -1][],
  extra: Partial<IdeaCorcho> = {},
): IdeaCorcho {
  return {
    id: `demo-${id}`,
    autorUserId,
    titulo,
    descripcion,
    estado: 'propuesta',
    estadoCambiadoPor: null,
    estadoCambiadoAt: null,
    comentarioEstado: null,
    createdAt: hace(horas),
    updatedAt: hace(horas),
    votos: votos.map(([userId, valor]) => ({ userId, valor })),
    vistaPorMi: true,
    comentarios: [],
    ...extra,
  };
}

export const CORCHO_MOCK_IDEAS: IdeaCorcho[] = [
  idea(
    'muestrario',
    'demo-sofi',
    'Muestrario físico de sellos para el local',
    'Un tablero con 20 sellos reales (tamaños y mangos) para que la gente toque antes de elegir. Ayudaría a cerrar ventas en mostrador.',
    3,
    [['demo-tomi', 1], ['demo-meli', 1]],
    {
      vistaPorMi: false,
      comentarios: [
        comentario('muestrario', 1, 'demo-tomi', 'Sumaría también los colores de tinta para sellos automáticos.', 2),
        comentario('muestrario', 2, 'demo-sofi', '¡Buenísimo! Lo agrego.', 1),
      ],
    },
  ),
  idea(
    'plantillas',
    'demo-tomi',
    'Plantillas de logo listas para emprendedores',
    'Ofrecer 10 diseños base editables. Menos idas y vueltas con el cliente que no tiene logo.',
    6,
    [['demo-sofi', 1], ['demo-nico', 1], ['demo-meli', -1]],
    { vistaPorMi: false },
  ),
  idea(
    'checklist',
    CORCHO_MOCK_VIEWER,
    'Checklist antes de despachar',
    'Foto del sello terminado + verificar dirección antes de cerrar la caja. Evitamos reenvíos.',
    20,
    [['demo-sofi', 1], ['demo-tomi', 1], ['demo-nico', 1]],
  ),
  idea(
    'whatsapp',
    'demo-meli',
    'Respuestas rápidas en WhatsApp',
    'Armar respuestas guardadas para precios, tiempos de entrega y medidas. Hoy escribimos lo mismo 30 veces por día.',
    30,
    [['demo-tomi', 1], ['demo-nico', 1], [CORCHO_MOCK_VIEWER, 1]],
    {
      estado: 'aprobada',
      estadoCambiadoPor: CORCHO_MOCK_VIEWER,
      estadoCambiadoAt: hace(26),
      comentarioEstado: 'Arrancamos la semana que viene, Meli arma la primera tanda.',
      comentarios: [
        comentario('whatsapp', 1, 'demo-nico', 'Puedo pasar las preguntas que más se repiten esta semana.', 28),
      ],
    },
  ),
  idea(
    'madera',
    'demo-nico',
    'Probar mangos de madera reciclada',
    null,
    48,
    [['demo-sofi', 1], [CORCHO_MOCK_VIEWER, -1]],
  ),
  idea(
    'sorteo',
    'demo-sofi',
    'Sorteo mensual entre clientes que dejan reseña',
    'Un sello gratis por mes. Más reseñas en Google sin pedirlas una por una.',
    72,
    [['demo-meli', 1]],
  ),
  idea(
    'orden-taller',
    'demo-tomi',
    'Ordenar el taller por estaciones',
    'Diseño → grabado → armado → empaque, en ese orden físico. Se camina menos y se pierden menos piezas.',
    96,
    [['demo-meli', 1], ['demo-nico', 1], [CORCHO_MOCK_VIEWER, 1], ['demo-sofi', 1]],
  ),
  idea(
    'tiktok',
    'demo-meli',
    'Videos cortos del proceso de grabado',
    'El láser grabando hipnotiza. Un video por semana para redes.',
    140,
    [['demo-sofi', -1], ['demo-tomi', -1]],
    {
      estado: 'descartada',
      estadoCambiadoPor: CORCHO_MOCK_VIEWER,
      estadoCambiadoAt: hace(120),
      comentarioEstado: 'Por ahora no tenemos quién lo sostenga. Lo retomamos en verano.',
    },
  ),
];
