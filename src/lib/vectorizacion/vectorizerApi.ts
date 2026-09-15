import type { VectorizeMode } from './vectorizerPreset';

export interface VectorizeOk {
  status: 'ok';
  svg: string;
  creditsCharged: number;
  creditsCalculated: number;
  mode: VectorizeMode;
}

export interface VectorizerAccount {
  credits: number;
  subscriptionPlan: string | null;
  subscriptionState: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return { message: raw || `HTTP ${response.status}` };
  }
}

async function postVectorize(imageBase64: string, mode: VectorizeMode, overrides?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch('/api/vectorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mode, overrides }),
      signal: controller.signal,
    });
    const data = await parseJson(response);
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function vectorizeSheet(
  imageBlob: Blob,
  mode: VectorizeMode,
  overrides?: Record<string, string>,
): Promise<VectorizeOk> {
  const imageBase64 = await blobToBase64(imageBlob);
  let lastMessage = 'Error al vectorizar';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { response, data } = await postVectorize(imageBase64, mode, overrides);
    if (response.ok && data.status === 'ok' && typeof data.svg === 'string') {
      return {
        status: 'ok',
        svg: data.svg,
        creditsCharged: Number(data.creditsCharged ?? 0),
        creditsCalculated: Number(data.creditsCalculated ?? 0),
        mode: (data.mode as VectorizeMode) || mode,
      };
    }

    lastMessage = typeof data.message === 'string' ? data.message : `HTTP ${response.status}`;
    if (response.status === 429 && attempt < 3) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (response.status >= 500 && attempt < 2) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new Error(lastMessage);
  }

  throw new Error(lastMessage);
}

export async function fetchVectorizerAccount(): Promise<VectorizerAccount> {
  const response = await fetch('/api/vectorizer-account');
  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo leer el saldo');
  }
  return {
    credits: Number(data.credits ?? 0),
    subscriptionPlan: typeof data.subscriptionPlan === 'string' ? data.subscriptionPlan : null,
    subscriptionState: typeof data.subscriptionState === 'string' ? data.subscriptionState : null,
  };
}
