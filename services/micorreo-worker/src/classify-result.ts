import { extractMicorreoPortalMessage } from './portal-messages.js';
import type { UploadStatus } from './types.js';

const DATA_ERROR_PATTERNS = [
  /provincia/i,
  /localidad/i,
  /sucursal/i,
  /provincia y sucursal/i,
  /c[oó]digo de area del celular/i,
  /tel[eé]fono celular de destino/i,
  /archivo contiene errores/i,
  /calle/i,
  /altura/i,
  /codpostal|c[oó]digo postal|cp\b/i,
  /email|correo electr[oó]nico/i,
  /formato/i,
  /inv[aá]lid/i,
  /fila\s*\d+/i,
  /registro/i,
  /campo obligatorio/i,
  /no existe/i,
  /no se encontr/i,
  /error en el archivo/i,
  /revis[aá]/i,
];

const SUCCESS_PATTERNS = [
  /importaci[oó]n se realiz[oó] con [ée]xito/i,
  /guardado exitosamente/i,
];

const IMPORT_SUCCESS_PATTERNS = [
  /importaci[oó]n se realiz[oó] con [ée]xito/i,
  /importaci[oó]n exitosa/i,
];

const SAVE_SUCCESS_PATTERNS = [
  /env[ií]os procesados con [ée]xito/i,
  /guardado exitosamente/i,
  /env[ií]o.*guardad/i,
  /se guard[oó]/i,
];

export const LABEL_SAVED_PAYMENT_PENDING_MSG =
  'Etiqueta guardada en MiCorreo. Falta pagarla con saldo.';

function normalizePaymentMessage(input: UploadPipelineResult): string | undefined {
  const raw = input.paymentMessage?.trim();
  if (!raw) return raw;
  const saveSuccess =
    input.saveSuccess ||
    SAVE_SUCCESS_PATTERNS.some((re) => re.test(input.portalText.trim())) ||
    input.paymentStatus === 'paid' ||
    input.paymentStatus === 'payment_error';
  if (
    saveSuccess &&
    input.paymentStatus === 'payment_error' &&
    /no qued[oó] guardado|bot[oó]n pagar deshabilitado/i.test(raw)
  ) {
    return LABEL_SAVED_PAYMENT_PENDING_MSG;
  }
  return raw;
}

const SYSTEM_ERROR_PATTERNS = [
  /servicio no disponible/i,
  /mantenimiento/i,
  /error interno/i,
  /timeout/i,
  /try again|intent[aá] m[aá]s tarde/i,
  /503|502|500/i,
];

export function classifyPortalMessage(rawText: string): UploadStatus {
  const text = rawText.trim();
  if (!text) return 'system_error';

  if (DATA_ERROR_PATTERNS.some((re) => re.test(text))) {
    return 'data_error';
  }

  if (SYSTEM_ERROR_PATTERNS.some((re) => re.test(text))) {
    return 'system_error';
  }

  if (SUCCESS_PATTERNS.some((re) => re.test(text))) {
    return 'ok';
  }

  if (/error|fall[oó]|no se pudo|no pudimos/i.test(text)) {
    return 'data_error';
  }

  return 'system_error';
}

export type UploadPipelineResult = {
  importSuccess: boolean;
  saveSuccess: boolean;
  payAfterUpload: boolean;
  paymentStatus?: 'not_attempted' | 'paid' | 'payment_error';
  portalText: string;
  saveMessage?: string;
  paymentMessage?: string;
};

/**
 * Error solo si MiCorreo rechazó el CSV o la automatización no pudo guardar el envío.
 * Si el CSV fue aceptado y la etiqueta quedó en MiCorreo, es OK aunque el pago falle.
 */
export function determineUploadStatus(input: UploadPipelineResult): {
  status: UploadStatus;
  message: string;
  labelReady: boolean;
  paymentPending: boolean;
} {
  const portalText = input.portalText.trim();
  const importSuccess =
    input.importSuccess || IMPORT_SUCCESS_PATTERNS.some((re) => re.test(portalText));
  const saveSuccess =
    input.saveSuccess ||
    SAVE_SUCCESS_PATTERNS.some((re) => re.test(portalText)) ||
    input.paymentStatus === 'paid' ||
    input.paymentStatus === 'payment_error';

  if (!importSuccess) {
    return {
      status: 'data_error',
      message:
        extractMicorreoPortalMessage(input.saveMessage || portalText) ||
        'MiCorreo no confirmó la importación del CSV.',
      labelReady: false,
      paymentPending: false,
    };
  }

  if (!saveSuccess) {
    return {
      status: 'data_error',
      message:
        input.saveMessage ||
        'La importación fue exitosa, pero el envío no quedó guardado en MiCorreo.',
      labelReady: false,
      paymentPending: false,
    };
  }

  if (input.paymentStatus === 'paid') {
    return {
      status: 'ok',
      message: 'CSV aceptado, envío guardado y etiqueta pagada con saldo disponible.',
      labelReady: true,
      paymentPending: false,
    };
  }

  const paymentNote =
    normalizePaymentMessage(input) ||
    (input.payAfterUpload
      ? LABEL_SAVED_PAYMENT_PENDING_MSG
      : 'CSV aceptado y envío guardado en MiCorreo.');

  const paymentPending =
    input.payAfterUpload === true &&
    (input.paymentStatus === 'payment_error' || input.paymentStatus === 'not_attempted');

  return {
    status: 'ok',
    message: paymentNote,
    labelReady: true,
    paymentPending,
  };
}

export function classifyPortalErrorCode(rawText: string): string | undefined {
  const text = rawText.trim();
  if (!text) return undefined;

  if (
    /c[oó]digo postal.*localidad|localidad.*c[oó]digo postal|codpostal.*localidad|cp\b.*localidad/i.test(
      text,
    )
  ) {
    return 'cp_localidad_invalido';
  }
  if (/sucursal/i.test(text)) return 'sucursal_invalida';
  if (/provincia/i.test(text)) return 'provincia_invalida';
  if (/tel[eé]fono|celular|c[oó]digo de area/i.test(text)) return 'telefono_invalido';
  if (/email|correo electr[oó]nico/i.test(text)) return 'email_invalido';
  if (/calle|altura|domicilio|direcci[oó]n/i.test(text)) return 'direccion_invalida';
  if (/saldo|pago|pagar|abonar/i.test(text)) return 'pago_rechazado';
  if (/timeout|servicio no disponible|mantenimiento|503|502|500/i.test(text)) return 'micorreo_no_disponible';

  return undefined;
}

export function httpStatusForUploadStatus(status: UploadStatus): number {
  switch (status) {
    case 'ok':
      return 200;
    case 'data_error':
      return 422;
    case 'system_error':
      return 503;
  }
}

export function countCsvDataRows(csvContent: string): number {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return 0;
  return lines.length - 1;
}

export function validateCsvStructure(csvContent: string): { ok: true } | { ok: false; message: string } {
  const trimmed = csvContent.trim();
  if (!trimmed) {
    return { ok: false, message: 'CSV vacío' };
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { ok: false, message: 'El CSV debe tener encabezado y al menos una fila de datos' };
  }

  const header = lines[0]!;
  if (!header.includes('tipo_producto') || !header.includes('destino_email')) {
    return {
      ok: false,
      message: 'Encabezado inválido: debe ser plantilla MiCorreo (tipo_producto, destino_email, etc.)',
    };
  }

  const separator = header.includes(';') ? ';' : ',';
  const dataCols = lines[1]!.split(separator).length;
  const headerCols = header.split(separator).length;
  if (dataCols !== headerCols) {
    return {
      ok: false,
      message: `Columnas inconsistentes: encabezado=${headerCols}, primera fila=${dataCols}`,
    };
  }

  return { ok: true };
}
