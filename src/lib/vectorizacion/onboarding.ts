export interface OnboardingSlide {
  heading: string;
  body: string;
  /** Mock UI ilustrativo (no screenshot). */
  visual: 'tabs' | 'sheet' | 'menu' | 'run' | 'revision' | 'asignar';
}

/**
 * Tour de primera visita a Vectorizar.
 * No va en el changelog: se muestra al entrar a /vectorizacion.
 */
export const VECTORIZAR_ONBOARDING = {
  id: 'vectorizar-v3',
  introHeading: 'Así se usa Vectorizar',
  introBody:
    'En unos pasos: armás la hoja, vectorizás, revisás el SVG y recién ahí se guarda en el pedido. También podés asignar SVG hechos afuera.',
  /** Hero de la slide de presentación. */
  introImage: '/vectorizacion/tour/intro-hero.jpg',
  slides: [
    {
      heading: 'Qué vas a encontrar',
      body: 'Hay cuatro pestañas. Pedidos arma hojas con los sellos pendientes (varios logos = un crédito). Lote libre es para archivos sueltos. Asignar SVG pega vectores ya hechos. Revisión es el paso final antes de guardar.',
      visual: 'tabs',
    },
    {
      heading: 'Pedidos: la hoja se arma en vivo',
      body: 'A la derecha las miniaturas pendientes; a la izquierda la hoja que se manda. Vas eligiendo y se van sumando. Arriba ves diseños, hojas y la carga. Si hay más de una, las pasás con click, flechas o scroll.',
      visual: 'sheet',
    },
    {
      heading: 'Clic derecho en una miniatura',
      body: 'Podés abrir, copiar o guardar la imagen. También Recortar si sobra fondo, y Reemplazar por Portapapeles si mejoraste el logo afuera: el original del cliente se conserva.',
      visual: 'menu',
    },
    {
      heading: 'Vectorizá: el progreso va en el botón',
      body: 'Con la hoja lista, tocás Vectorizar y confirmás los créditos. El botón se va llenando solo. Cuando termina, los SVG pasan a Revisión — todavía no se guardan en el pedido.',
      visual: 'run',
    },
    {
      heading: 'Revisión: mirá antes de guardar',
      body: 'Comparás el base con el SVG. Confirmar lo asigna al sello; Rechazar lo descarta; Cambiar sube un SVG retocado. Podés confirmar de a uno o todos. Hasta que confirmás, el pedido no cambia.',
      visual: 'revision',
    },
    {
      heading: 'Asignar SVG ya hechos',
      body: 'Si vectorizaste afuera, arrastrá los archivos a Asignar SVG. La app los pega al sello por el nombre (ves el % de coincidencia). Los dudosos los elegís a mano y confirmás.',
      visual: 'asignar',
    },
  ] satisfies OnboardingSlide[],
} as const;

export type VectorizarOnboarding = typeof VECTORIZAR_ONBOARDING;

const STORAGE_KEY = 'vectorizar_onboarding_visto';

export function wasVectorizarOnboardingSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === VECTORIZAR_ONBOARDING.id;
  } catch {
    return true;
  }
}

export function markVectorizarOnboardingSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, VECTORIZAR_ONBOARDING.id);
  } catch {
    // Sin storage, el tour puede volver a aparecer: preferible a no marcar.
  }
}
