import type { CentroArticleMeta } from './types';

export function reviewBasisLabel(basis: string | null | undefined): string {
  if (basis === 'code_check') return 'Comprobado contra la app';
  if (basis === 'team_validation') return 'Validado con el equipo';
  if (!basis) return '';
  return basis;
}

export function typeLabel(type: string): string {
  switch (type) {
    case 'manual':
      return 'Manual';
    case 'faq':
      return 'Problema frecuente';
    case 'company':
      return 'Empresa';
    case 'activity':
      return 'Actividad';
    default:
      return type;
  }
}

export function areaLabel(area: string): string {
  switch (area) {
    case 'ventas':
      return 'Ventas';
    case 'produccion':
      return 'Producción';
    case 'logistica':
      return 'Logística';
    default:
      return area;
  }
}

export function filterArticles(
  articles: CentroArticleMeta[],
  opts: { area?: string | null; type?: string | null; ids?: string[] },
): CentroArticleMeta[] {
  return articles.filter((a) => {
    if (opts.ids && !opts.ids.includes(a.id)) return false;
    if (opts.type && a.type !== opts.type) return false;
    if (opts.area && opts.area !== 'todos' && !a.areas.includes(opts.area as never)) return false;
    return true;
  });
}

export function buildReportText(params: {
  kind: 'article' | 'chat';
  title: string;
  href: string;
  reason: string;
  comment?: string;
  question?: string;
}): string {
  const lines = [
    'Reporte Centro Alcohn',
    `Tipo: ${params.kind === 'article' ? 'Artículo' : 'Consulta al asistente'}`,
    `Asunto: ${params.title}`,
    `Enlace: ${params.href}`,
    `Motivo: ${params.reason}`,
  ];
  if (params.question) lines.push(`Pregunta: ${params.question}`);
  if (params.comment?.trim()) lines.push(`Comentario: ${params.comment.trim()}`);
  lines.push('');
  lines.push('(Copiá este texto y compartilo con quien mantiene el contenido. No se envió automáticamente.)');
  return lines.join('\n');
}
