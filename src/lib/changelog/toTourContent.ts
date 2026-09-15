import type { ChangelogEntry } from '@/lib/changelog/entries';
import type { FeatureTourContent } from '@/components/global/WhatsNewDialog';

/** Arma el intro de versión para el carrusel de novedades. */
export function changelogToTourContent(entry: ChangelogEntry): FeatureTourContent {
  return {
    id: entry.id,
    coverImage: entry.coverImage,
    introHeading: `Mirá las novedades de la app\nen la versión ${entry.version}`,
    introBody: 'Te contamos en un minuto qué cambió y para qué te sirve.',
    slides: entry.slides,
  };
}
