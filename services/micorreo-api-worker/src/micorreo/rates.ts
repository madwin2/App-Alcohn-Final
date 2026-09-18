import { apiRequest, parseJsonBody } from '../http-client.js';
import type { DeliveryType, RatesResult } from '../types.js';

export type QuoteInput = {
  customerId: string;
  postalCodeOrigin: string;
  postalCodeDestination: string;
  deliveredType?: DeliveryType;
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function validateQuoteLimits(input: {
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}): void {
  if (!Number.isInteger(input.weightG) || input.weightG < 1 || input.weightG > 25_000) {
    throw new Error(`Peso inválido (${input.weightG} g). Tiene que ser entero entre 1 y 25.000 gramos.`);
  }
  for (const [name, value] of [
    ['alto', input.heightCm],
    ['ancho', input.widthCm],
    ['largo', input.lengthCm],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 150) {
      throw new Error(`${name} inválido (${value} cm). Entero, máximo 150 cm para cotizar.`);
    }
  }
}

export async function quoteRates(input: QuoteInput): Promise<RatesResult> {
  validateQuoteLimits(input);

  const body: Record<string, unknown> = {
    customerId: input.customerId,
    postalCodeOrigin: input.postalCodeOrigin,
    postalCodeDestination: input.postalCodeDestination,
    dimensions: {
      weight: input.weightG,
      height: input.heightCm,
      width: input.widthCm,
      length: input.lengthCm,
    },
  };
  if (input.deliveredType) body.deliveredType = input.deliveredType;

  const response = await apiRequest({
    method: 'POST',
    path: '/rates',
    body,
    dumpName: 'rates',
  });

  const parsed = parseJsonBody<Record<string, unknown>>(response.rawBody, '/rates') ?? {};
  const ratesRaw = Array.isArray(parsed.rates) ? parsed.rates : [];
  const validTo = str(parsed.validTo);
  return {
    customerId: str(parsed.customerId),
    validTo,
    validToParsed: validTo ? new Date(validTo) : null,
    rates: ratesRaw.map((item) => {
      const rec = asRecord(item) ?? {};
      return {
        deliveredType: str(rec.deliveredType),
        productType: str(rec.productType),
        productName: str(rec.productName),
        price: num(rec.price),
        deliveryTimeMin: str(rec.deliveryTimeMin),
        deliveryTimeMax: str(rec.deliveryTimeMax),
      };
    }),
  };
}

export function minutesUntil(date: Date | null): number | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return (date.getTime() - Date.now()) / 60_000;
}

export function formatValidity(date: Date | null): string {
  const mins = minutesUntil(date);
  if (mins === null) return '';
  if (Math.abs(mins) < 2) {
    const secs = Math.round(mins * 60);
    return secs >= 0 ? `  vence en ${secs} s` : `  vencida hace ${Math.abs(secs)} s`;
  }
  const rounded = Math.round(mins);
  return rounded >= 0 ? `  vence en ${rounded} min` : `  vencida hace ${Math.abs(rounded)} min`;
}
