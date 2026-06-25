import {
  classifyPortalErrorCode,
  classifyPortalMessage,
  countCsvDataRows,
  httpStatusForUploadStatus,
  validateCsvStructure,
} from './classify-result.js';
import { assertRuntimeConfig, loadConfig } from './config.js';
import { closeBrowser, uploadCsvToMicorreo } from './micorreo/upload-csv.js';
import type { UploadRequestBody, UploadResult } from './types.js';

export async function runUploadJob(body: UploadRequestBody): Promise<UploadResult> {
  const config = loadConfig();
  assertRuntimeConfig(config);

  const structure = validateCsvStructure(body.csvContent);
  if (!structure.ok) {
    return {
      status: 'data_error',
      message: structure.message,
      orderId: body.orderId,
      httpStatus: 422,
    };
  }

  const filename =
    body.filename?.trim() ||
    (body.orderId ? `carga_${body.orderId.slice(0, 8)}.csv` : `carga_${Date.now()}.csv`);

  try {
    const upload = await uploadCsvToMicorreo(config, {
      csvContent: body.csvContent,
      filename,
      orderId: body.orderId,
    });

    const portalTextForUpload = upload.portalText.replace(/\n\n\[PAGO\][\s\S]*$/i, '');
    const status = classifyPortalMessage(portalTextForUpload);
    const paymentStatus = upload.payment?.status ?? (body.payAfterUpload ? 'not_attempted' : undefined);
    const paymentMessage = upload.payment?.message;
    const effectiveStatus =
      status === 'ok' && paymentStatus === 'payment_error' ? 'data_error' : status;
    const httpStatus = httpStatusForUploadStatus(effectiveStatus);

    return {
      status: effectiveStatus,
      message:
        effectiveStatus === 'ok'
          ? paymentStatus === 'paid'
            ? 'CSV aceptado por MiCorreo y etiqueta pagada con saldo disponible'
            : 'CSV aceptado por MiCorreo'
          : paymentMessage || portalTextForUpload.slice(0, 500) || 'Respuesta del portal sin mensaje claro',
      orderId: body.orderId,
      httpStatus,
      details: {
        portalText: upload.portalText.slice(0, 4000),
        rowCount: countCsvDataRows(body.csvContent),
        errorCode:
          effectiveStatus === 'ok'
            ? undefined
            : classifyPortalErrorCode(paymentMessage || upload.portalText),
        paymentStatus,
        paymentMessage,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const artifactDir =
      error && typeof error === 'object' && 'artifactDir' in error
        ? String((error as { artifactDir?: string }).artifactDir || '')
        : undefined;

    const isLoginOrNav =
      /login|credencial|selectores|input\[type=file\]|timeout|net::|navigation/i.test(message);

    return {
      status: 'system_error',
      message,
      orderId: body.orderId,
      httpStatus: 503,
      details: {
        portalText: message,
        artifactDir: artifactDir || undefined,
      },
    };
  }
}

export async function shutdownWorker(): Promise<void> {
  await closeBrowser();
}
