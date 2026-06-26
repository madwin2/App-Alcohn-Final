import type { ShippingState } from '@/lib/types';

export type MicorreoUploadStatus = 'ok' | 'data_error' | 'system_error';

export type MicorreoUploadResult = {
  status: MicorreoUploadStatus;
  message: string;
  httpStatus: number;
  orderId?: string;
  details?: {
    portalText?: string;
    rowCount?: number;
    errorCode?: string;
    paymentStatus?: 'not_attempted' | 'paid' | 'payment_error';
    paymentMessage?: string;
    saveConfirmed?: boolean;
    importSuccess?: boolean;
    saveSuccess?: boolean;
  };
};

export function shippingStateFromMicorreoUpload(
  status: MicorreoUploadStatus,
  options?: {
    saveConfirmed?: boolean;
    paymentStatus?: 'not_attempted' | 'paid' | 'payment_error';
  },
): ShippingState {
  switch (status) {
    case 'ok':
      return options?.saveConfirmed ? 'ETIQUETA_LISTA' : 'HACER_ETIQUETA';
    case 'data_error':
      return 'ERROR_ETIQUETA';
    case 'system_error':
      return 'HACER_ETIQUETA';
  }
}

export function downloadCorreoCsv(csvContent: string, filename?: string) {
  const name = filename || `carga_correo_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function uploadCorreoCsvToWorker(input: {
  csvContent: string;
  orderId?: string;
  filename?: string;
  payAfterUpload?: boolean;
}): Promise<MicorreoUploadResult> {
  const response = await fetch('/api/micorreo-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const raw = await response.text();
  let data: MicorreoUploadResult;
  try {
    data = raw ? (JSON.parse(raw) as MicorreoUploadResult) : ({} as MicorreoUploadResult);
  } catch {
    throw new Error('Respuesta inválida del servidor al subir a MiCorreo.');
  }

  if (!data.status) {
    throw new Error(data.message || 'Error desconocido al subir a MiCorreo.');
  }

  return data;
}
