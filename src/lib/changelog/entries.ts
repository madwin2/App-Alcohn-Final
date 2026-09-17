import {
  Bell,
  FileText,
  Flag,
  Layers,
  Link2,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  Type,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export interface ChangelogSlide {
  heading: string;
  body: string;
  /** Ícono de lucide-react para novedades simples. */
  icon?: LucideIcon;
  /** Captura real en public/changelog/<id>/, si el cambio es muy visual. */
  image?: string;
}

export interface ChangelogEntry {
  /** Entero incremental manual — no tiene relación con el hash de build. */
  id: number;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** Título corto de la tanda (uso interno / historial). */
  title: string;
  /**
   * Versión legible para la slide de presentación
   * ("Mirá las novedades… en la versión 1.2").
   */
  version: string;
  /** Ilustración de portada (slide 0) y fondo blur de las siguientes. */
  coverImage?: string;
  /** Solo las novedades; la intro se arma sola. */
  slides: ChangelogSlide[];
}

/** El más nuevo va último. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: 1,
    date: '2026-09-12',
    title: 'Novedades',
    version: '1.1',
    coverImage: '/changelog/1/hero.jpg',
    slides: [
      {
        heading: 'La app te avisa cuando hay una versión nueva',
        body: 'Ya no hace falta recargar a mano para ver los cambios: cuando subimos una versión nueva te aparece un aviso con un botón para actualizar.',
        icon: RefreshCw,
      },
      {
        heading: 'Y te contamos qué cambió',
        body: 'Cada vez que sumemos algo importante vas a ver una pantalla como esta, explicando en dos líneas qué es nuevo y para qué te sirve.',
        icon: Bell,
      },
    ],
  },
  {
    id: 2,
    date: '2026-09-14',
    title: 'Novedades',
    version: '1.11',
    slides: [
      {
        heading: 'Rehacer ahora es Prioridad',
        body: 'Al marcar un pedido para rehacer, pasa a estado prioritario. Así no se pierde entre el resto de la cola.',
        icon: Flag,
      },
      {
        heading: 'Las notificaciones te llevan al pedido',
        body: 'Al tocar una notificación, la tabla se abre con el buscador puesto en el teléfono de ese cliente, así ves directo el pedido del que te avisó. Borrás el buscador y volvés a la lista completa.',
        icon: MousePointerClick,
      },
      {
        heading: 'En Producción podés buscar por cliente',
        body: 'El buscador de Producción ahora también encuentra por nombre o teléfono del cliente, además del diseño.',
        icon: Search,
      },
    ],
  },
  {
    id: 3,
    date: '2026-09-15',
    title: 'Novedades',
    version: '1.12',
    slides: [
      {
        heading: 'Un aviso cuando terminan varios sellos',
        body: 'Si en Producción marcan varios sellos como terminados seguidos, Ventas recibe una sola notificación (“17 sellos fueron terminados”) en lugar de una por cada uno.',
        icon: Layers,
      },
    ],
  },
  {
    id: 4,
    date: '2026-09-15',
    title: 'Novedades',
    version: '1.2',
    coverImage: '/changelog/1/hero.jpg',
    slides: [
      {
        heading: 'Nueva página para vectorizar',
        body: 'En Vectorización podés tomar los archivos base pendientes y generar el SVG ahí mismo, sin el programa de escritorio. La primera vez que entres, te contamos cómo usarla.',
        icon: Layers,
      },
    ],
  },
  {
    id: 5,
    date: '2026-09-16',
    title: 'Novedades',
    version: '1.21',
    coverImage: '/changelog/1/hero.jpg',
    slides: [
      {
        heading: 'Envíos se elige al entrar',
        body: 'Ya no se abre todo junto. Elegís Correo, Andreani, Via Cargo, Todos o Historial, y vas directo a esa cola. Las secciones vacías quedan plegadas.',
        icon: Truck,
      },
      {
        heading: 'Abecedarios se cargan por juegos',
        body: 'En vez del desplegable, ahora sumás mayúsculas y minúsculas de a uno. Letras extras abre un recuadro para cargar cada letra y los caracteres especiales.',
        icon: Type,
      },
      {
        heading: 'Hoja de fabricación del abecedario',
        body: 'Si el pedido tiene un abecedario, con click derecho podés descargar la hoja de fabricación ya completada con los datos.',
        icon: FileText,
      },
      {
        heading: 'Avisa si faltan links de Andreani',
        body: 'Al asignar las fotos, se fija si el pool alcanza. Si faltan, te pregunta si esperás o asignás igual. Las fotos quedan guardadas en el modal para mandarlas después.',
        icon: Link2,
      },
    ],
  },
  {
    id: 6,
    date: '2026-09-17',
    title: 'Novedades',
    version: '1.22',
    slides: [
      {
        heading: 'WhatsApp Bot, desde el menú',
        body: 'En WhatsApp Bot podés conectar la cuenta de WhatsApp Business de Alcohn con Meta. Todavía falta vincularla con el servidor del bot.',
        icon: MessageCircle,
      },
    ],
  },
];

/** La tanda de novedades más reciente publicada, o null si todavía no hay ninguna. */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG_ENTRIES.reduce<ChangelogEntry | null>(
    (latest, entry) => (!latest || entry.id > latest.id ? entry : latest),
    null,
  );
}
