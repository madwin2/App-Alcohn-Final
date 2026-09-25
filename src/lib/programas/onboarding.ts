export type ProgramasTourVisualId =
  | 'board'
  | 'pocket'
  | 'estados'
  | 'vectores'
  | 'hoja'
  | 'dock'
  | 'terminados';

export interface ProgramasOnboardingSlide {
  heading: string;
  body: string;
  visual: ProgramasTourVisualId;
}

/**
 * Guía de uso de Programas (tarjetero).
 * Pensada para /dev/programas-tour y, más adelante, onboarding en la página.
 */
export const PROGRAMAS_ONBOARDING = {
  id: 'programas-tarjetero-v1',
  introHeading: 'Así se usa Programas ahora',
  introBody:
    'El tablero es un tarjetero por máquina: bolsillos, hojas, vectores a un lado, y Terminados / Papelera abajo. En un minuto ves cómo moverte.',
  introImage: '/programas/pocket-completo.svg',
  slides: [
    {
      heading: 'El tablero de un vistazo',
      body: 'Tres columnas: Chica (C), Grande (G) y XL. Cada ranura es un bolsillo. A la derecha, el panel Vectores con los diseños listos para sumar. Abajo a la derecha: Terminados y Papelera.',
      visual: 'board',
    },
    {
      heading: 'Bolsillo y hoja',
      body: 'La hoja asoma del bolsillo. Hover: sube y ves más contenido. Click: sale y se abre en grande (flyer) con preview enganchado, diseños, carga y acciones. Esc o el fondo cierran.',
      visual: 'pocket',
    },
    {
      heading: 'Colores de estado',
      body: 'Detrás de la hoja blanca hay una ficha de color: En fabricación, Listo, Finalizado, Borrador… Si está bloqueada ves el candado; si cambió después del zip, avisa que falta regenerar.',
      visual: 'estados',
    },
    {
      heading: 'Panel Vectores',
      body: 'Cada tarjeta muestra preview (fondo blanco), máquinas posibles (C/G), fecha y planchuela. Sin borde en reposo; al pasar el mouse se marca en gris. Arrastrá al programa o a un bolsillo vacío para crear uno nuevo.',
      visual: 'vectores',
    },
    {
      heading: 'Sumar sellos desde la hoja',
      body: 'Con la hoja abierta, el + entre Diseños y Carga abre los diseños disponibles ahí mismo. Elegís, confirmás y la grilla se acomoda. También podés sacar un sello con la X al pasar el mouse.',
      visual: 'hoja',
    },
    {
      heading: 'Mover, terminar o borrar',
      body: 'Agarrá la hoja del bolsillo y arrastrala. Sobre Terminados se imanta y al soltar queda finalizado. Sobre la Papelera se borra (pide confirmación si tiene sellos).',
      visual: 'dock',
    },
    {
      heading: 'Terminados = fichero',
      body: 'Click en la carpeta: entras a una vista a pantalla de hojas sueltas apiladas. Scroll o arrastre para pasar, buscador abajo por nombre, flecha arriba a la izquierda para volver al tablero. Click en la del frente para abrirla.',
      visual: 'terminados',
    },
  ] satisfies ProgramasOnboardingSlide[],
} as const;

export type ProgramasOnboarding = typeof PROGRAMAS_ONBOARDING;
