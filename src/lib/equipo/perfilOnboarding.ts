export type PerfilTourVisualId =
  | 'intro'
  | 'mi-dia'
  | 'mi-dia-resumen'
  | 'calendario'
  | 'tareas'
  | 'lo-mio'
  | 'numeros'
  | 'corcho';

export interface PerfilOnboardingSlide {
  /** Dónde está esto en la app (ej. «Mi perfil › Mi día»). */
  donde: string;
  heading: string;
  /** Una frase: para qué sirve esta parte. */
  lead: string;
  /** Cada paso coincide con el número marcado en el dibujo. */
  pasos: string[];
  visual: PerfilTourVisualId;
}

/**
 * Guía profunda de Mi perfil (y puente al Corcho).
 * Se muestra la primera vez que entran a /perfil — no es el cartel de novedades.
 * Preview: /dev/perfil-tour
 *
 * Cada slide = un trozo real de /perfil con números (1, 2, 3…) sobre los botones;
 * los pasos del texto usan los mismos números. Los nombres de botones y secciones
 * tienen que ser los que aparecen en la pantalla (InicioPerfilTab, CalendarioTab,
 * TareasTab, LoMioTab, MisNumerosTab, CorchoBoard): si cambian ahí, cambiarlos acá.
 */
export const PERFIL_ONBOARDING = {
  id: 'perfil-v2',
  slides: [
    {
      donde: 'Mi perfil',
      heading: 'Tu lugar en la app',
      lead: 'Mi perfil junta tu día, tus tareas, lo tuyo y tus números. Lo encontrás en el menú de la izquierda.',
      pasos: [
        'Arriba: tu foto, cuánto hace que estás en Alcohn, los días de vacaciones que te quedan y tu cumpleaños.',
        'Las pestañas: Mi día, Tareas, Lo mío y Mis números. Siempre entrás en Mi día.',
        'El número naranja en Lo mío es feedback que todavía no leíste.',
      ],
      visual: 'intro',
    },
    {
      donde: 'Mi perfil › Mi día',
      heading: 'Lo que tenés que hacer hoy',
      lead: 'Acá aparecen tus tareas de hoy y las que quedaron atrasadas.',
      pasos: [
        'Tarea para hoy: anotás algo nuevo para hacer hoy.',
        'Hecha: la marcás cuando la terminaste y desaparece de la lista.',
        'Más: posponer, moverla a otro día o marcarla como no hecha.',
      ],
      visual: 'mi-dia',
    },
    {
      donde: 'Mi perfil › Mi día',
      heading: 'Atajos y resumen del equipo',
      lead: 'Debajo de tus tareas están los atajos; a la derecha, cómo está el equipo hoy.',
      pasos: [
        'Vacaciones y Cambio de día: los cargás desde acá, sin buscar fechas en otro lado.',
        'Pedir algo: te lleva a Lo que necesito. Pinchar una idea: abre el Corcho.',
        'Quién no viene hoy, tus días de vacaciones y los cumpleaños de las próximas dos semanas.',
        'Corcho y Feedback: te avisan si hay ideas nuevas o feedback sin leer. Tocalos para ir.',
      ],
      visual: 'mi-dia-resumen',
    },
    {
      donde: 'Mi perfil › Mi día › más abajo',
      heading: 'Calendario del equipo',
      lead: 'Bajando en Mi día está el calendario: vacaciones, cambios de día, feriados, cumpleaños y tus tareas.',
      pasos: [
        'Agregar: cargás una tarea, vacaciones o un cambio de día.',
        'Todos, Solo yo o el nombre de alguien: elegís a quién ver.',
        'Mes, Semana o Próximos días: cambiás cómo se ve.',
        'Arrastrá sobre varios días para cargar vacaciones. Con el + de cada día (o clic derecho) cargás algo en esa fecha.',
      ],
      visual: 'calendario',
    },
    {
      donde: 'Mi perfil › Tareas',
      heading: 'Tus tareas fijas',
      lead: 'Acá armás la lista de lo que hacés siempre y cada cuánto. Después aparecen solas en Mi día.',
      pasos: [
        'Nueva tarea: elegís si es diaria, semanal, cada 15 días, mensual o de un solo día.',
        'Se agrupan por frecuencia. Arrastralas para ordenarlas.',
        'Pausadas: no aparecen en Mi día hasta que las reactives.',
      ],
      visual: 'tareas',
    },
    {
      donde: 'Mi perfil › Lo mío',
      heading: 'Lo mío',
      lead: 'Cuatro secciones que son solo tuyas. Se cambian con los botones de arriba.',
      pasos: [
        'Anotaciones: tus notas personales. Solo las ves vos.',
        'Lo que necesito: pedís una herramienta o un insumo; Julián lo ve y te avisa cuando lo resuelve.',
        'Crecimiento: tus objetivos y lo que querés aprender.',
        'Feedback: felicitaciones, mejoras y correcciones que te deja Julián.',
      ],
      visual: 'lo-mio',
    },
    {
      donde: 'Mi perfil › Mis números',
      heading: 'Mis números',
      lead: 'Cómo te fue, comparado con el período anterior. Solo los ves vos.',
      pasos: [
        'Semana, Mes o Año: elegís qué período mirar.',
        'Tus números del período y la diferencia con el anterior. Cambian según tu área.',
        'El gráfico de los últimos 6 meses y la galería con los sellos del período.',
      ],
      visual: 'numeros',
    },
    {
      donde: 'Corcho · también en el menú',
      heading: 'El Corcho de ideas',
      lead: 'Un tablero donde todo el equipo pincha ideas para mejorar Alcohn.',
      pasos: [
        'Pinchar una idea: escribís la tuya y queda en el tablero.',
        'Tocá una nota para leerla entera, votarla y comentar.',
        'Solo nuevas: ves solo las ideas que todavía no viste.',
      ],
      visual: 'corcho',
    },
  ] satisfies PerfilOnboardingSlide[],
} as const;

export type PerfilOnboarding = typeof PERFIL_ONBOARDING;

const STORAGE_KEY = 'perfil_onboarding_visto';

export function wasPerfilOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === PERFIL_ONBOARDING.id;
  } catch {
    return true;
  }
}

export function markPerfilOnboardingSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, PERFIL_ONBOARDING.id);
  } catch {
    // Sin storage, el tour puede volver a aparecer: preferible a no marcar.
  }
}
