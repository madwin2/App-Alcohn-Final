export type TipoFeedback = 'felicitacion' | 'mejora' | 'correccion';

export interface FeedbackFiltrable {
  id: string;
  tipo: TipoFeedback;
  titulo: string | null;
  texto: string;
  leidoAt: string | null;
  createdAt: string;
}

export function labelTipoFeedback(tipo: TipoFeedback): string {
  switch (tipo) {
    case 'felicitacion':
      return 'Felicitación';
    case 'mejora':
      return 'Mejora';
    case 'correccion':
      return 'Corrección';
    default:
      return tipo;
  }
}

/** Texto corto para la notificación e4 (tipo, no contenido). */
export function fraseTipoFeedbackNotificacion(tipo: TipoFeedback): string {
  switch (tipo) {
    case 'felicitacion':
      return 'una felicitación';
    case 'mejora':
      return 'una mejora';
    case 'correccion':
      return 'una corrección';
    default:
      return 'feedback';
  }
}

export function emojiTipoFeedback(tipo: TipoFeedback): string {
  switch (tipo) {
    case 'felicitacion':
      return '🎉';
    case 'mejora':
      return '💡';
    case 'correccion':
      return '🔧';
    default:
      return '💬';
  }
}

/** Clases Tailwind por tipo (borde / fondo suave). */
export function clasesTipoFeedback(tipo: TipoFeedback): string {
  switch (tipo) {
    case 'felicitacion':
      return 'border-emerald-500/25 bg-emerald-500/[0.07]';
    case 'mejora':
      return 'border-sky-500/25 bg-sky-500/[0.07]';
    case 'correccion':
      return 'border-amber-500/25 bg-amber-500/[0.07]';
    default:
      return 'border-white/10 bg-white/[0.02]';
  }
}

export function contarFeedbackNoLeido(items: FeedbackFiltrable[]): number {
  return items.filter((f) => !f.leidoAt).length;
}

export function filtrarFeedbackPorTipo(
  items: FeedbackFiltrable[],
  tipo: TipoFeedback | 'todos',
): FeedbackFiltrable[] {
  if (tipo === 'todos') return items;
  return items.filter((f) => f.tipo === tipo);
}

/** Más reciente primero. */
export function ordenarFeedbackCronologico(items: FeedbackFiltrable[]): FeedbackFiltrable[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
