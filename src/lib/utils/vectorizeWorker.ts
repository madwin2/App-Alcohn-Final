export type VectorizeEnqueueStatus = 'queued' | 'ignored' | 'system_error';

export type VectorizeEnqueueResult = {
  status: VectorizeEnqueueStatus;
  message: string;
  httpStatus: number;
  jobId?: string;
};

type VectorizeEnqueueInput = {
  selloId: string;
  orderId: string;
  baseUrl: string;
  reason: 'BASE_UPLOADED' | 'BASE_REPLACED';
};

export async function enqueueVectorization(input: VectorizeEnqueueInput): Promise<VectorizeEnqueueResult> {
  const response = await fetch('/api/vectorize-enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const raw = await response.text();
  let data: VectorizeEnqueueResult;
  try {
    data = raw ? (JSON.parse(raw) as VectorizeEnqueueResult) : ({} as VectorizeEnqueueResult);
  } catch {
    throw new Error('Respuesta inválida del servidor al encolar vectorización.');
  }

  if (!data.status) {
    throw new Error(data.message || 'No se pudo encolar la vectorización.');
  }

  return data;
}
