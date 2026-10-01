import {
  AlertTriangle,
  Archive,
  Bell,
  FileText,
  Filter,
  Flag,
  Layers,
  Link2,
  Lock,
  MessageCircle,
  MousePointerClick,
  Package,
  Ruler,
  RefreshCw,
  Search,
  Type,
  Truck,
  Unlock,
  Upload,
  BookOpen,
  WalletCards,
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
  {
    id: 7,
    date: '2026-09-18',
    title: 'Novedades',
    version: '1.23',
    slides: [
      {
        heading: 'Stock pendiente más compacto',
        body: 'En el inicio, la tarjeta de reposición arranca chica. Tocála o los ítems para ver el detalle y cargar lo que falta.',
        icon: Package,
      },
    ],
  },
  {
    id: 8,
    date: '2026-09-21',
    title: 'Novedades',
    version: '1.24',
    slides: [
      {
        heading: 'Subir el Aspire ahora sincroniza',
        body: 'Al subir el .crv3d la app lee qué sellos hay adentro y te avisa si falta alguno. Ya no bloquea ni marca el programa como verificado.',
        icon: Upload,
      },
      {
        heading: 'Preview 2D del programa',
        body: 'Si el archivo trae la miniatura de Aspire, la ves en la card del programa.',
        icon: Layers,
      },
    ],
  },
  {
    id: 9,
    date: '2026-09-21',
    title: 'Novedades',
    version: '1.25',
    slides: [
      {
        heading: 'Descargar ya no bloquea el programa',
        body: 'Podés sumar un sello prioritario después de bajar el paquete, sin desbloquear nada. El candado manual sigue ahí si lo necesitás.',
        icon: Unlock,
      },
    ],
  },
  {
    id: 10,
    date: '2026-09-21',
    title: 'Novedades',
    version: '1.26',
    slides: [
      {
        heading: 'El gadget avisa a Programas al terminar',
        body: 'Cuando Aspire termina de armar, la app recibe el reporte al toque (sellos que no entraron, los que sacaste por material, etc.). Si no hay internet, guardá el .crv3d y subilo como siempre.',
        icon: RefreshCw,
      },
      {
        heading: 'El ZIP ya no trae el gadget',
        body: 'El .lua se instala una sola vez por PC (desde Storage / carpeta Gadgets). Cada descarga del programa trae solo vectores, manifest y el .crv3d base.',
        icon: Package,
      },
    ],
  },
  {
    id: 11,
    date: '2026-09-21',
    title: 'Novedades',
    version: '1.27',
    slides: [
      {
        heading: 'Aspire elige el programa solo',
        body: 'Al correr el gadget aparece la lista de programas abiertos de esa máquina. Baja vectores y manifest al toque — sin ZIP ni carpeta. Si no hay internet, sigue el flujo de siempre.',
        icon: Package,
      },
    ],
  },
  {
    id: 12,
    date: '2026-09-22',
    title: 'Novedades',
    version: '1.28',
    slides: [
      {
        heading: 'Aviso si un sello cae en otra planchuela',
        body: 'Si Aspire lo pone en una columna distinta a la planificada (ej. 38 en vez de 25), el gadget lo dice en el resumen y Programas lo muestra en la tarjeta del programa.',
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 13,
    date: '2026-09-22',
    title: 'Novedades',
    version: '1.29',
    slides: [
      {
        heading: 'Programa solo se edita en Programas',
        body: 'En Producción la columna Programa es solo lectura. Si el sello está en un programa real, el chip te lleva a Programas; el texto gris es histórico sin vínculo.',
        icon: Lock,
      },
      {
        heading: 'Alertas en la fila del sello',
        body: 'Si salió por falta de material o no entró al Aspire (.eps, etc.), lo ves en el diseño. Así no lo volvés a meter mal ni te olvidás de re-vectorizar.',
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 14,
    date: '2026-09-25',
    title: 'Novedades',
    version: '1.32',
    coverImage: '/changelog/sandbox/hero.jpg',
    slides: [
      {
        heading: 'Programas en tarjetero',
        body: 'Las hojas viven en bolsillos por máquina (Chica, Grande, XL). Pasá el mouse para asomarlas y hacé click para abrirlas en grande con preview, diseños y carga.',
        icon: WalletCards,
      },
      {
        heading: 'Vectores a un lado, drag and drop',
        body: 'A la derecha están los diseños listos. Arrastralos a un programa o a un bolsillo vacío. Hover en gris suave; el preview del vector va con fondo blanco.',
        icon: MousePointerClick,
      },
      {
        heading: 'Sellos desde la misma hoja',
        body: 'En la hoja abierta, el + suma diseños ahí mismo entre Diseños y Carga: elegís, confirmás y seguís sin otro popup.',
        icon: Layers,
      },
      {
        heading: 'Terminados como fichero',
        body: 'La carpeta Terminados abre un mazo de hojas: scroll o arrastrá para recorrer, buscá por nombre abajo, y la flecha arriba a la izquierda vuelve al tablero. La papelera borra el programa.',
        icon: Archive,
      },
    ],
  },
  {
    id: 15,
    date: '2026-09-25',
    title: 'Novedades',
    version: '1.33',
    slides: [
      {
        heading: 'Planchuela 25 bien contada',
        body: 'En Chica, los sellos de ~2 cm ya no se suman a la de 19 (stock 20 mm). Van a la de 25, como en Aspire.',
        icon: Layers,
      },
      {
        heading: 'Notas y medida en la hoja',
        body: 'En la hoja abierta, el ! muestra la nota del pedido y al pasar el mouse por el vector ves su medida en mm.',
        icon: MousePointerClick,
      },
    ],
  },
  {
    id: 16,
    date: '2026-09-25',
    title: 'Novedades',
    version: '1.34',
    slides: [
      {
        heading: 'Aspire sube solo el archivo',
        body: 'Al terminar el gadget, la app recibe el .crv3d y el preview. En la hoja ves Aspire OK sin arrastrar el archivo a mano.',
        icon: Upload,
      },
    ],
  },
  {
    id: 17,
    date: '2026-09-25',
    title: 'Novedades',
    version: '1.35',
    slides: [
      {
        heading: 'Después del gadget queda Listo',
        body: 'Cuando Aspire sube el archivo, la hoja pasa a Listo y arma el preview sola (aunque el .crv3d sea grande).',
        icon: FileText,
      },
    ],
  },
  {
    id: 18,
    date: '2026-09-27',
    title: 'Novedades',
    version: '1.36',
    slides: [
      {
        heading: 'Prioridad más visible al armar',
        body: 'Los sellos prioritarios se marcan en rojo. Si hay nota, al pasar el mouse por el ! se lee el texto.',
        icon: Flag,
      },
      {
        heading: 'Filtro por planchuela',
        body: 'Al agregar diseños podés filtrar por P12, P19, P25… sin perder el orden por prioridad y fecha.',
        icon: Filter,
      },
    ],
  },
  {
    id: 19,
    date: '2026-09-27',
    title: 'Novedades',
    version: '1.37',
    slides: [
      {
        heading: 'Grande solo con P12 y P38',
        body: 'En la máquina Grande ya no aparecen sellos de 19 o 25: solo entran planchuelas de 12 y 38 mm.',
        icon: Filter,
      },
      {
        heading: 'Vectores se actualizan al toque',
        body: 'Cuando metés un diseño en un programa, desaparece del panel Vectores sin tener que recargar la página.',
        icon: RefreshCw,
      },
      {
        heading: 'Listo para Fabricar',
        body: 'El estado verde de la hoja ahora se llama «Listo para Fabricar», para dejar claro que ya se puede mandar a producción.',
        icon: FileText,
      },
    ],
  },
  {
    id: 20,
    date: '2026-09-27',
    title: 'Novedades',
    version: '1.38',
    slides: [
      {
        heading: 'Aviso si el vector no es SVG',
        body: 'Al subir o guardar un vector en otro formato (EPS, PDF, AI…), Pedidos te avisa antes de continuar para que puedas corregirlo.',
        icon: AlertTriangle,
      },
      {
        heading: 'Medidas siempre largo × corto',
        body: 'Las medidas de los vectores se muestran como lado más largo × lado más corto, sin importar si el diseño está horizontal o vertical.',
        icon: Ruler,
      },
      {
        heading: 'Seguís donde estabas en Pedidos',
        body: 'Si ya habías cargado más pedidos y editás uno, la lista no vuelve al principio: se mantiene lo que tenías visible.',
        icon: RefreshCw,
      },
    ],
  },
  {
    id: 21,
    date: '2026-09-27',
    title: 'Novedades',
    version: '1.39',
    slides: [
      {
        heading: 'Clic derecho en programas',
        body: 'En la tarjeta de un programa podés abrir el menú: eliminar, o cambiar el estado a Haciendo, Rehacer o Hecho. Hecho lo manda a la carpeta Terminados.',
        icon: MousePointerClick,
      },
    ],
  },
  {
    id: 22,
    date: '2026-09-28',
    title: 'Novedades',
    version: '1.40',
    slides: [
      {
        heading: 'Pedidos internacionales',
        body: 'México, Colombia, Perú y Chile se ven con su bandera, montos en moneda local y envío DHL. En Economía se pasan a pesos solos.',
        icon: Flag,
      },
      {
        heading: 'Dirección DHL a un clic',
        body: 'En la columna de envío de un pedido DHL podés copiar la dirección completa para armar el despacho.',
        icon: Truck,
      },
    ],
  },
  {
    id: 23,
    date: '2026-09-29',
    title: 'Novedades',
    version: '1.41',
    slides: [
      {
        heading: 'Alta manual internacional',
        body: 'En Nuevo Pedido podés marcar el pedido como internacional y elegir el país. Los montos van en moneda local y el envío arranca en DHL.',
        icon: Flag,
      },
    ],
  },
  {
    id: 24,
    date: '2026-09-30',
    title: 'Novedades',
    version: '1.42',
    slides: [
      {
        heading: 'Ganancia por año en Economía',
        body: 'En Volumen y Por año ves la teórica (ventas − gastos) y la ganancia real (dólares + inversiones), lado a lado por año, sin restarlas.',
        icon: WalletCards,
      },
      {
        heading: 'P&L más fácil de leer',
        body: 'Las filas se resaltan al pasar el cursor. El desglose de gastos o ganancias se abre tocando esas columnas en el encabezado.',
        icon: Layers,
      },
    ],
  },
  {
    id: 25,
    date: '2026-09-30',
    title: 'Novedades',
    version: '1.43',
    slides: [
      {
        heading: 'Hoja de Errores',
        body: 'En el menú hay Errores: métricas de rehaceres por motivo y período, y el detalle de cada caso.',
        icon: AlertTriangle,
      },
      {
        heading: 'El vector del error queda guardado',
        body: 'Al marcar Rehacer se congela una copia de la base y del vector. Aunque después los reemplaces, en Errores seguís viendo la versión que falló.',
        icon: Archive,
      },
    ],
  },
  {
    id: 26,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.44',
    slides: [
      {
        heading: 'Completá la nota del error después',
        body: 'En Errores abrís un rehacer y escribís qué falló, aunque al marcarlo no lo hayas cargado. Las filas sin descripción se marcan para completar.',
        icon: FileText,
      },
      {
        heading: 'Métricas más útiles',
        body: 'Ves cuántos faltan de describir, el peso de cada motivo, quién marcó más y los cobros. Tocá un motivo o “Sin descripción” para filtrar.',
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 27,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.45',
    slides: [
      {
        heading: 'Motivos de rehacer más claros',
        body: 'En lugar de “medida o vector” ahora elegís: Error en la Medida, Error en el Vector, o Error en Programación Aspire.',
        icon: Ruler,
      },
      {
        heading: 'Podés corregir el tipo en Errores',
        body: 'Si el motivo quedó mal o es uno viejo, abrís el caso en Errores y lo cambiás al tipo correcto.',
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 28,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.46',
    slides: [
      {
        heading: 'Centro Alcohn para todo el equipo',
        body: 'En el menú ya está Centro Alcohn: manual, búsqueda y asistente. Sobre Alcohn sigue en preparación.',
        icon: BookOpen,
      },
    ],
  },
  {
    id: 29,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.47',
    slides: [
      {
        heading: 'La revisión de vectores ya no se pierde',
        body: 'Si cerrás o recargás Vectorización, los SVG pendientes de confirmar vuelven solos en este navegador. Seguí confirmándolos cuando puedas.',
        icon: Layers,
      },
    ],
  },
  {
    id: 30,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.48',
    slides: [
      {
        heading: 'Accesorio hecho = foto enviada',
        body: 'Cuando marcás un soldador, mango o base como Hecho, además del WhatsApp con la foto, la venta pasa sola a Foto Enviada. Ya no queda en la cola de Enviar foto.',
        icon: MessageCircle,
      },
    ],
  },
  {
    id: 31,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.49',
    slides: [
      {
        heading: 'Traer etiquetas también avisa al cliente',
        body: 'Si al traer etiquetas Andreani ya recibió paquetes que tenías en la lista, el pedido pasa a Despachado y el cliente recibe el seguimiento (antes solo se sacaban de la lista).',
        icon: Truck,
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

/** Entradas desde un id inclusive (útil en /dev para ver lo pendiente de publicar). */
export function getChangelogEntriesFrom(minId: number): ChangelogEntry[] {
  return CHANGELOG_ENTRIES.filter((e) => e.id >= minId).sort((a, b) => a.id - b.id);
}
