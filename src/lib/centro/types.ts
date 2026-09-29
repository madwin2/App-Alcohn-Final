export type CentroArea = 'ventas' | 'produccion' | 'logistica';
export type CentroArticleType = 'manual' | 'faq' | 'company' | 'activity';

export interface CentroArticleMeta {
  id: string;
  slug: string;
  title: string;
  summary: string;
  type: CentroArticleType;
  areas: CentroArea[];
  tags: string[];
  lastReviewedAt: string | null;
  reviewBasis: 'code_check' | 'team_validation' | string | null;
  contentOwner: string | null;
  relatedArticleIds: string[];
  appRoute: string | null;
  sections: { id: string; heading: string; level: number; anchor: string }[];
}

export interface CentroArticle extends CentroArticleMeta {
  markdown: string;
}

export interface CentroSearchResult {
  articleId: string;
  slug: string;
  title: string;
  type: string;
  areas: string[];
  heading: string;
  anchor: string;
  fragmentId: string;
  snippet: string;
  score: number;
}

export interface CentroChatSource {
  fragmentId: string;
  articleId: string;
  slug: string;
  title: string;
  heading: string;
  anchor: string;
  href: string;
}

export interface CentroChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: CentroChatSource[];
  error?: boolean;
}

export type CentroSection =
  | 'home'
  | 'manual'
  | 'actividades'
  | 'faq'
  | 'empezando'
  | 'empresa'
  | 'search'
  | 'chat';
