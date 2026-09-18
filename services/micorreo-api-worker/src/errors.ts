import type { RawHttpResponse } from './types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function parseErrorBody(rawBody: string): unknown {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return rawBody;
  }
}

function extractRawMessage(body: unknown, rawBody: string): string {
  const rec = asRecord(body);
  if (rec) {
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
    if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim();
  }
  const text = rawBody.trim();
  if (text && text.length < 400 && !text.startsWith('<')) return text;
  return '';
}

const BUSINESS_HINTS: Array<{ test: RegExp; text: string }> = [
  {
    test: /ya fue importada/i,
    text: 'Esa orden ya se importó. extOrderId es único: hay que usar uno nuevo.',
  },
  {
    test: /peso no valido|peso debe ser mayor|peso excede/i,
    text: 'El peso no es válido. Tiene que ser un entero en gramos, entre 1 y 25.000.',
  },
  {
    test: /tipo de entrega invalido/i,
    text: 'Tipo de entrega inválido. Usá D (domicilio) o S (sucursal).',
  },
  {
    test: /verifique la sucursal/i,
    text: 'La sucursal de destino no es válida o no está habilitada.',
  },
  {
    test: /tipo de encomienda|tenc/i,
    text: 'El tipo de encomienda (productType) no es válido para esta cuenta.',
  },
  {
    test: /no se encontro datos de remitente/i,
    text: 'MiCorreo no tiene remitente en la cuenta. Hay que completar sender en el payload.',
  },
  {
    test: /codigo postal del emisor/i,
    text: 'Falta el código postal del remitente.',
  },
  {
    test: /provincia del emisor debe tener valor/i,
    text: 'Falta la provincia del remitente.',
  },
  {
    test: /provincia es invalida/i,
    text: 'El código de provincia no es válido (1 letra, sin I/Ñ/O).',
  },
  {
    test: /alto debe estar|ancho debe estar|largo debe estar/i,
    text: 'Las medidas tienen que ser enteros entre 0 y 255 cm.',
  },
  {
    test: /cliente fap no identificado|customer id no valido/i,
    text: 'El customerId no es válido. Corré npm run customer:resolve y guardalo en MICORREO_CUSTOMER_ID.',
  },
  {
    test: /usuario no valido o inexistente/i,
    text: 'Email o contraseña de la cuenta MiCorreo no coinciden.',
  },
  {
    test: /campos obligatorios vacios/i,
    text: 'Falta un parámetro obligatorio. Revisá customerId, provincia o el body.',
  },
];

export function traducirError(input: {
  httpStatus: number;
  code: string | number | null;
  path: string;
  rawBody: string;
  body?: unknown;
}): string {
  const rawMessage = extractRawMessage(input.body ?? parseErrorBody(input.rawBody), input.rawBody);
  const hint = rawMessage
    ? `Correo dijo: «${rawMessage.slice(0, 280)}»`
    : 'Correo no envió un mensaje descriptivo.';

  const mapped = BUSINESS_HINTS.find((item) => item.test.test(rawMessage));

  if (input.httpStatus === 401 || input.code === 401 || input.code === '401') {
    return `Token inválido o vencido (HTTP 401). Se intenta renovar una vez. ${hint}`;
  }
  if (input.httpStatus === 403) {
    return `Sin permisos (HTTP 403). ${hint}`;
  }
  if (input.httpStatus === 404 || input.httpStatus === 406) {
    return mapped
      ? `${mapped.text} ${hint}`
      : `No encontrado (HTTP ${input.httpStatus}) en ${input.path}. ${hint}`;
  }
  if (input.httpStatus === 409) {
    return `Conflicto / idempotencia (HTTP 409). ${hint}`;
  }
  if (input.httpStatus === 429) {
    return `Demasiadas solicitudes (HTTP 429). Esperá un rato y no martilles la API. ${hint}`;
  }
  if (input.httpStatus >= 500) {
    return `MiCorreo tuvo un error interno (HTTP ${input.httpStatus}). ${hint}`;
  }
  if (input.httpStatus === 400) {
    return mapped
      ? `${mapped.text} ${hint}`
      : `Falta un parámetro obligatorio (HTTP 400). ${hint}`;
  }
  if (input.httpStatus === 402 || input.code === 402 || input.code === '402') {
    return mapped
      ? `${mapped.text} ${hint}`
      : `MiCorreo rechazó la operación (HTTP 402, error de negocio). ${hint}`;
  }
  if (mapped) return `${mapped.text} ${hint}`;
  return `Error HTTP ${input.httpStatus} al llamar ${input.path}. ${hint}`;
}

export class MiCorreoApiError extends Error {
  readonly httpStatus: number;
  readonly code: string | number | null;
  readonly path: string;
  readonly rawBody: string;
  readonly body: unknown;

  constructor(httpStatus: number, path: string, rawBody: string, body?: unknown) {
    const parsed = body ?? parseErrorBody(rawBody);
    const rec = asRecord(parsed);
    const code =
      rec && (typeof rec.code === 'string' || typeof rec.code === 'number') ? rec.code : httpStatus;
    super(traducirError({ httpStatus, code, path, rawBody, body: parsed }));
    this.name = 'MiCorreoApiError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.path = path;
    this.rawBody = rawBody;
    this.body = parsed;
  }

  static fromResponse(path: string, response: RawHttpResponse): MiCorreoApiError {
    return new MiCorreoApiError(response.status, path, response.rawBody);
  }
}

export function printCliError(error: unknown): void {
  if (error instanceof MiCorreoApiError) {
    console.error(error.message);
    console.error(`  http=${error.httpStatus}  code=${error.code}  path=${error.path}`);
    return;
  }
  if (error instanceof Error) {
    console.error(error.message);
    return;
  }
  console.error(String(error));
}
