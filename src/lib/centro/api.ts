import { supabase } from '@/lib/supabase/client';
import type {
  CentroArticle,
  CentroArticleMeta,
  CentroChatSource,
  CentroSearchResult,
} from './types';

export class CentroApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new CentroApiError('Sesión requerida', 401, 'unauthorized');
  return token;
}

async function knowledgeRequest<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  let response: Response;
  try {
    response = await fetch('/api/knowledge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CentroApiError(
      'No se pudo conectar con el Centro. Si estás en local, reiniciá npm run dev.',
      0,
      'network',
    );
  }

  const contentType = response.headers.get('content-type') || '';
  let json: Record<string, unknown> | null = null;
  const raw = await response.text();
  if (contentType.includes('application/json') || raw.trim().startsWith('{')) {
    try {
      json = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
  }

  if (!json) {
    throw new CentroApiError(
      response.status === 404
        ? 'El endpoint del Centro no está disponible. En local: reiniciá npm run dev para cargar el proxy.'
        : 'El servidor no devolvió una respuesta válida del Centro.',
      response.status,
      'bad_response',
    );
  }

  if (!response.ok || !json.ok) {
    throw new CentroApiError(
      String(json.error || 'No se pudo completar la solicitud'),
      response.status,
      typeof json.code === 'string' ? json.code : undefined,
      typeof json.detail === 'string' ? json.detail : undefined,
    );
  }

  return json as T;
}

export async function fetchCatalog(): Promise<{
  version: string;
  contentHash: string;
  articles: CentroArticleMeta[];
}> {
  return knowledgeRequest({ op: 'catalog' });
}

export async function fetchArticle(slug: string): Promise<{
  version: string;
  contentHash: string;
  article: CentroArticle;
  related: CentroArticleMeta[];
}> {
  return knowledgeRequest({ op: 'article', slug });
}

export async function searchCentro(params: {
  query: string;
  area?: string | null;
  type?: string | null;
}): Promise<{ version: string; results: CentroSearchResult[] }> {
  return knowledgeRequest({
    op: 'search',
    query: params.query,
    area: params.area || undefined,
    type: params.type || undefined,
  });
}

export async function chatCentro(params: {
  question: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  openArticleId?: string | null;
  contentVersion?: string;
}): Promise<{
  answer: string;
  sources: CentroChatSource[];
  contentVersion: string;
  contentHash: string;
}> {
  return knowledgeRequest({
    op: 'chat',
    question: params.question,
    history: params.history,
    openArticleId: params.openArticleId || undefined,
    contentVersion: params.contentVersion,
  });
}
