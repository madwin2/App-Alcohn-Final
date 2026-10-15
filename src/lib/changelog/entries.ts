import {
  AlertTriangle,
  Archive,
  Bell,
  FileText,
  Filter,
  Flag,
  Gift,
  Layers,
  Link2,
  Lock,
  MessageCircle,
  HeartHandshake,
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
  UserCircle,
  CalendarDays,
  ListTodo,
  ShoppingBag,
  Target,
  Pin,
  BarChart3,
  Scaling,
  ZoomIn,
  ScanSearch,
  Wand2,
  PencilRuler,
  Keyboard,
  Spline,
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
  {
    id: 32,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.50',
    slides: [
      {
        heading: 'Medida del sello: escribí el número directo',
        body: 'En el aviso de medida ya podés tipear los milímetros en vez de ir de a 0.1. Y los sellos pedidos al máximo (como 40×40) ahora salen con el lado chico en 36.5, lo más cerca posible de lo pedido.',
        icon: Ruler,
      },
      {
        heading: 'Stock que refleja la realidad',
        body: "Cada envío descuenta todos sus insumos aunque el stock esté en cero (queda en rojo). Para dejarlo al día, contá lo que hay y cargalo con 'Guardar conteo'.",
        icon: Package,
      },
    ],
  },
  {
    id: 33,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.51',
    slides: [
      {
        heading: 'Pedidos de prueba y de regalo',
        body: 'En Nuevo pedido elegís Venta, Regalo o Prueba interna. Las pruebas van al cliente interno y no se envían; los regalos se fabrican y se envían sin cargo.',
        icon: Gift,
      },
      {
        heading: 'Regalo dentro de una venta',
        body: 'En un pedido normal podés marcar un diseño como “Regalo (sin cargo)”. No suma a las ventas del mes ni al restante.',
        icon: Gift,
      },
      {
        heading: 'No cuentan como venta',
        body: 'Pruebas y regalos no suman a la meta ni a Economía como ventas: aparecen como gasto (Pruebas / Regalos) y restan de la rentabilidad.',
        icon: Package,
      },
    ],
  },
  {
    id: 34,
    date: '2026-10-01',
    title: 'Novedades',
    version: '1.52',
    slides: [
      {
        heading: 'Sumar regalo a un pedido',
        body: 'Clic derecho sobre un pedido de venta y elegí “Sumar regalo”. Se agrega un ítem sin cargo que viaja con ese pedido.',
        icon: Gift,
      },
    ],
  },
  {
    id: 35,
    date: '2026-10-05',
    title: 'Novedades',
    version: '1.53',
    slides: [
      {
        heading: 'Economía ya no suma envíos Andreani con link',
        body: 'Si el cliente pagó el envío en Andreani (pedido con link), ese monto no entra a las ventas del mes. Se recalcula también en meses anteriores.',
        icon: WalletCards,
      },
    ],
  },
  {
    id: 36,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.54',
    slides: [
      {
        heading: 'Nueva página Mi perfil',
        body: 'Entrá desde el menú o tocando tu foto en el Inicio. Ahí vas a ver quién sos en el equipo; más adelante se suman calendario, tareas y el resto.',
        icon: UserCircle,
      },
    ],
  },
  {
    id: 37,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.55',
    slides: [
      {
        heading: 'Calendario del equipo',
        body: 'En Mi perfil cargá tus vacaciones y cambios de día. Ves feriados, cumpleaños y quién falta cada día. Si te pasás del saldo, la app avisa pero no bloquea.',
        icon: CalendarDays,
      },
    ],
  },
  {
    id: 38,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.56',
    slides: [
      {
        heading: 'Anotá tus tareas de cada semana',
        body: 'En Mi perfil → Mis tareas definís lo que tenés que hacer cada día, semana o mes. Julián también puede sumarte tareas; las tuyas las editás vos.',
        icon: ListTodo,
      },
    ],
  },
  {
    id: 39,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.57',
    slides: [
      {
        heading: 'Anotaciones privadas en Mi perfil',
        body: 'Notas largas con Markdown, solo para vos. Se guardan solas mientras escribís; podés fijar las importantes arriba.',
        icon: Lock,
      },
      {
        heading: 'Lo que necesito',
        body: 'Pedí herramientas o insumos puntuales. Julián recibe un aviso y, cuando lo resuelve, te queda la respuesta en la pestaña.',
        icon: ShoppingBag,
      },
    ],
  },
  {
    id: 40,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.58',
    slides: [
      {
        heading: 'Crecimiento en Mi perfil',
        body: 'Anotá tus objetivos y lo que querés aprender. Lo ven vos y Julián, para que pueda ayudarte.',
        icon: Target,
      },
      {
        heading: 'Feedback de Julián',
        body: 'Felicitaciones, mejoras y correcciones llegan a Mi perfil → Feedback, con un aviso. Abrís cada uno para marcarlos leídos.',
        icon: HeartHandshake,
      },
    ],
  },
  {
    id: 41,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.59',
    slides: [
      {
        heading: 'Corcho de ideas',
        body: 'En el menú está Corcho: pinchá ideas para mejorar la empresa, votá con 👍 o 👎 y filtrá por persona. Julián puede aprobar o descartar. En Mi perfil → Mis ideas ves las tuyas.',
        icon: Pin,
      },
    ],
  },
  {
    id: 42,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.60',
    slides: [
      {
        heading: 'Mis números en Mi perfil',
        body: 'En la pestaña Mis números ves lo que fuiste haciendo (semana, mes o año) y una galería de sellos. Solo lo ves vos.',
        icon: BarChart3,
      },
    ],
  },
  {
    id: 43,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.61',
    slides: [
      {
        heading: 'Anotaciones: ya no se pierde lo que escribís',
        body: 'Si seguís escribiendo mientras guarda, o cambiás de pestaña rápido, el texto se mantiene y se guarda antes de salir.',
        icon: FileText,
      },
      {
        heading: 'Julián puede corregir vacaciones de cualquiera',
        body: 'En Equipo, Ver ausencias abre la lista de cada persona para editar o borrar, también lo que ya empezó.',
        icon: CalendarDays,
      },
      {
        heading: 'Mis números más justos',
        body: 'Las etiquetas cuentan envíos distintos por período, y el saldo de vacaciones usa feriados y rangos completos aunque cambies de año en el calendario.',
        icon: BarChart3,
      },
      {
        heading: 'Corcho solo para el equipo activo',
        body: 'Si no tenés perfil de equipo o estás desactivado, Mi perfil y el Corcho te avisan en lugar de mostrar datos del resto.',
        icon: UserCircle,
      },
    ],
  },
  {
    id: 44,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.62',
    slides: [
      {
        heading: 'Inicio del perfil con tu resumen',
        body: 'Ves de un vistazo tus próximas vacaciones, quién no está hoy, feedback sin leer, tareas de hoy, ideas nuevas del corcho y tus pedidos.',
        icon: UserCircle,
      },
      {
        heading: 'Avisos si cambian o cancelan vacaciones',
        body: 'Si alguien mueve las fechas de sus vacaciones o las cancela, el equipo recibe un aviso. En Mis tareas, la semana marca los días de vacaciones o de cambio.',
        icon: Bell,
      },
    ],
  },
  {
    id: 45,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.63',
    slides: [
      {
        heading: 'Tareas de un solo día',
        body: 'En Mis tareas podés cargar algo solo para una fecha (hoy, esta semana o la que viene). No se repite la semana siguiente.',
        icon: ListTodo,
      },
    ],
  },
  {
    id: 46,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.64',
    slides: [
      {
        heading: 'Mi perfil más simple',
        body: 'Mi día junta el resumen y el calendario. Tareas queda para crear y ordenar; Lo mío agrupa anotaciones, pedidos, crecimiento y feedback.',
        icon: UserCircle,
      },
      {
        heading: 'Marcá tus tareas desde Mi día',
        body: 'Las de hoy y las atrasadas aparecen arriba con Hecha, Posponer o Mover. También podés sumar vacaciones, cambio de día o una tarea para hoy desde ahí.',
        icon: ListTodo,
      },
      {
        heading: 'Notas y tareas son cosas distintas',
        body: 'En el Inicio, los post-its son notas o avisos (para vos o un compañero). Las tareas —lo que tenés que hacer— viven en Mi perfil y el calendario.',
        icon: Pin,
      },
    ],
  },
  {
    id: 47,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.65',
    slides: [
      {
        heading: 'Calendario con tus tareas',
        body: 'En Mi día ves vacaciones del equipo y tus tareas en la misma grilla. Tocá un día o un chip para marcar, editar o cargar algo.',
        icon: CalendarDays,
      },
      {
        heading: 'Agregar desde el calendario',
        body: 'Un botón + Agregar (o clic derecho en un día) abre tarea, vacaciones o cambio de día con la fecha ya elegida. Podés arrastrar varios días para un rango de vacaciones.',
        icon: MousePointerClick,
      },
    ],
  },
  {
    id: 48,
    date: '2026-10-06',
    title: 'Novedades',
    version: '1.66',
    slides: [
      {
        heading: 'Mi perfil, renovado',
        body: 'Ahora usa toda la pantalla: tu día y tus tareas a la izquierda, un resumen a la derecha y el calendario del equipo abajo, más grande.',
        icon: UserCircle,
      },
      {
        heading: 'Feedback para leer tranquilo',
        body: 'En Lo mío → Feedback la lista queda a la izquierda y el que abrís se lee a la derecha. El número en la pestaña te dice cuántos tenés sin leer.',
        icon: HeartHandshake,
      },
    ],
  },
  {
    id: 49,
    date: '2026-10-08',
    title: 'Novedades',
    version: '1.67',
    slides: [
      {
        heading: 'Achicá diseños en la hoja',
        body: 'En Vectorización, arrastrá las esquinas de un diseño para escalarlo y dejar lugar a más logos en el mismo crédito. Doble clic vuelve al 100%.',
        icon: Scaling,
      },
      {
        heading: 'Zoom al revisar el vector',
        body: 'En Revisión, tocá la comparación o Zoom: se abre base y vector juntos, con la misma lupa y arrastre para mirar detalles.',
        icon: ZoomIn,
      },
    ],
  },
  {
    id: 50,
    date: '2026-10-09',
    title: 'Novedades',
    version: '1.68',
    slides: [
      {
        heading: 'Las ideas del corcho se abren enteras',
        body: 'Tocá una idea para leerla completa, ver quién votó a favor y en contra, y desde cuándo está. Las notificaciones te llevan directo a esa idea.',
        icon: Pin,
      },
      {
        heading: 'Ahora se puede comentar',
        body: 'Si querés sumar algo a una idea, comentala; si no, votá y listo. A quien la pinchó le llega un aviso.',
        icon: MessageCircle,
      },
      {
        heading: 'Corcho más ordenado',
        body: 'Las descartadas se esconden (están en el filtro Descartadas) y una idea ya votada no se puede editar, para que nadie termine votando algo distinto.',
        icon: Filter,
      },
      {
        heading: 'Y con cara nueva',
        body: 'Notas clavadas con chinche, sin huecos entre filas, sello de Aprobada en las que vamos a hacer y filtros en una sola línea.',
        icon: Pin,
      },
    ],
  },
  {
    id: 51,
    date: '2026-10-13',
    title: 'Mi perfil y Corcho',
    version: '1.69',
    slides: [
      {
        heading: 'Mi perfil',
        body: 'Tu espacio en la app: vacaciones, tareas del día, anotaciones, pedidos al equipo, crecimiento, feedback y tus números. Entrá desde el menú o tu foto.',
        icon: UserCircle,
      },
      {
        heading: 'Corcho de ideas',
        body: 'En el menú Corcho pinchás ideas para mejorar la empresa, votás y comentás. Julián puede aprobar o descartar.',
        icon: Pin,
      },
      {
        heading: 'La guía está al entrar',
        body: 'La primera vez que abras Mi perfil te mostramos cada sección y dónde están los botones importantes.',
        icon: BookOpen,
      },
    ],
  },
  {
    id: 52,
    date: '2026-10-13',
    title: 'Menú más limpio',
    version: '1.70',
    slides: [
      {
        heading: 'Centro Alcohn al lado de la campanita',
        body: 'El manual y el asistente se abren con el botón del libro, abajo a la derecha, arriba de las notificaciones. Ya no está en el menú.',
        icon: BookOpen,
      },
      {
        heading: 'Menú más corto',
        body: 'Sacamos del menú Verificación, Áreas y WhatsApp Bot. Mi perfil se abre tocando tu foto y nombre abajo del menú.',
        icon: Filter,
      },
    ],
  },
  {
    id: 53,
    date: '2026-10-14',
    title: 'Chequeo de fresa',
    version: '1.71',
    slides: [
      {
        heading: 'Dónde no llega la fresa',
        body: 'En Vectorización cada vector muestra el chip «Fresa»: simula el V-carve y marca dónde se pegan letras o se tapan ojos porque la fresa no baja a 0,3 mm (1 mm en Alimento), a la medida en que se fabrica.',
        icon: ScanSearch,
      },
      {
        heading: 'Se corrige solo, antes de Aspire',
        body: '«Corregir automáticamente» adapta el diseño: separa letras manteniendo la alineación y agranda ojos sin dejar trazos de menos de 0,4 mm. Comparás antes y después; lo que no se puede arreglar queda marcado para hacer a mano.',
        icon: Wand2,
      },
      {
        heading: 'El sello no cambia de medida',
        body: 'Si al separar letras el diseño queda más ancho, se achica parejo para entrar en la misma medida. Los renglones de un mismo bloque (nombre y tagline) se ensanchan juntos y quedan parejos.',
        icon: Scaling,
      },
      {
        heading: 'También en Programas',
        body: 'En la hoja del programa, el botón «Fresa» revisa todos los sellos antes de armarlo en Aspire. En Pedidos y Producción: clic derecho en el vector → Chequear fresa.',
        icon: Layers,
      },
    ],
  },
  {
    id: 54,
    date: '2026-10-15',
    title: 'Editar el vector a mano',
    version: '1.72',
    slides: [
      {
        heading: 'Editar a mano en el chequeo de fresa',
        body: 'Para lo que la corrección automática no resuelve: mové, escalá o hacele offset a una letra o pieza, y la fresa se vuelve a chequear sola cada vez que soltás.',
        icon: PencilRuler,
      },
      {
        heading: 'Nodos a la vista',
        body: 'Ves los nodos de cada pieza y los podés arrastrar. «Quitar nodos de más» los limpia sin cambiar la forma; «Simplificar» te dice antes cuántos nodos quedan: las rectas llenas de nodos quedan con uno por esquina y las curvas con pocos.',
        icon: Spline,
      },
    ],
  },
  {
    id: 55,
    date: '2026-10-15',
    title: 'Vectores corregidos solos',
    version: '1.73',
    slides: [
      {
        heading: 'La corrección se hace sola',
        body: 'Cuando un vector llega a Revisión, la app ya lo corrige donde no llega la fresa y simplifica sus nodos sin cambiar el diseño. En la tarjeta elegís qué guardar: Original o Automático.',
        icon: Wand2,
      },
      {
        heading: 'Original, automático o a mano',
        body: '«Ver / editar» abre el chequeo con la corrección ya hecha: podés compararla, editar el corregido o el original, o quedarte con el original. El original nunca se pierde hasta que confirmás.',
        icon: PencilRuler,
      },
    ],
  },
  {
    id: 58,
    date: '2026-10-15',
    title: 'Editor de vectores más cómodo',
    version: '1.76',
    slides: [
      {
        heading: 'Nada se corre de lugar',
        body: 'En el editor del chequeo de fresa, los botones quedan siempre en el mismo lugar: podés tocar +1 % o una flecha varias veces seguidas. Los avisos aparecen flotando arriba del dibujo y se van solos.',
        icon: PencilRuler,
      },
      {
        heading: 'Más rápido y con el teclado',
        body: 'Cada cambio responde al instante, Terminar edición queda siempre a la vista y los atajos (Ctrl+Z, flechas, Supr) andan aunque hayas tocado un botón del panel.',
        icon: Keyboard,
      },
    ],
  },
  {
    id: 59,
    date: '2026-10-15',
    title: 'Editor de vectores con el mouse',
    version: '1.77',
    slides: [
      {
        heading: 'Sin elegir herramientas',
        body: 'Clic izquierdo elige y mueve, las esquinas escalan, doble clic edita los nodos, la rueda apretada mueve la vista y el clic derecho abre las acciones de lo que tocaste (también Esquina y Suave en un nodo).',
        icon: PencilRuler,
      },
      {
        heading: 'Afinar y engordar sin romper',
        body: 'Afinar o engordar una letra ya no la deforma: el resultado queda pegado al offset exacto, con sus esquinas.',
        icon: Wand2,
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
