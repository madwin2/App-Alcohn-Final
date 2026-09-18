import { z } from 'zod';
import { loadConfig } from '../config.js';
import { codigoProvincia } from './provinces.js';
import type { DeliveryType, ImportPayload } from '../types.js';

export const DELIVERY_TYPES = ['D', 'S'] as const;

export type ImportInput = {
  deliveryType: DeliveryType;
  recipientName: string;
  recipientEmail: string;
  phone?: string;
  cellPhone?: string;
  street?: string;
  streetNumber?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  floor?: string;
  apartment?: string;
  agency?: string;
  /** Si true (default para S), manda address en null. */
  addressNullForSucursal?: boolean;
  weightG?: number;
  weightKg?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  declaredValue?: number;
  productType?: string;
  extOrderId?: string;
  orderNumber?: string;
  customerId: string;
};

function trunc3(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 3);
}

function intField(value: number, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} tiene que ser entero entre ${min} y ${max} (recibí ${value}).`);
  }
  return value;
}

const addressSchema = z.object({
  streetName: z.string().nullable(),
  streetNumber: z.string().nullable(),
  floor: z.string().nullable(),
  apartment: z.string().nullable(),
  city: z.string().nullable(),
  provinceCode: z.string().nullable(),
  postalCode: z.string().nullable(),
});

export const importPayloadSchema = z
  .object({
    customerId: z.string().min(1),
    extOrderId: z.string().min(1),
    orderNumber: z.string().nullable(),
    sender: z.object({
      name: z.string().nullable(),
      phone: z.string().nullable(),
      cellPhone: z.string().nullable(),
      email: z.string().nullable(),
      originAddress: addressSchema,
    }),
    recipient: z.object({
      name: z.string().min(1, 'Falta el nombre del destinatario'),
      phone: z.string(),
      cellPhone: z.string(),
      email: z.string().email('recipient.email es obligatorio y tiene que ser un email válido'),
    }),
    shipping: z.object({
      deliveryType: z.enum(DELIVERY_TYPES),
      productType: z.string().min(1),
      agency: z.string().nullable(),
      address: addressSchema.nullable(),
      weight: z.number().int().min(1).max(25_000),
      declaredValue: z.number().positive(),
      height: z.number().int().min(0).max(255),
      length: z.number().int().min(0).max(255),
      width: z.number().int().min(0).max(255),
    }),
  })
  .superRefine((payload, ctx) => {
    if (payload.shipping.deliveryType === 'S') {
      if (!payload.shipping.agency?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'agency'],
          message: 'agency es obligatorio cuando deliveryType es S',
        });
      }
    } else {
      const addr = payload.shipping.address;
      if (!addr) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address'],
          message: 'address es obligatorio cuando deliveryType es D',
        });
        return;
      }
      if (!addr.streetName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address', 'streetName'],
          message: 'Calle obligatoria en envíos a domicilio',
        });
      }
      if (!addr.streetNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address', 'streetNumber'],
          message: 'Altura obligatoria en envíos a domicilio',
        });
      }
      if (!addr.city?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address', 'city'],
          message: 'Ciudad obligatoria en envíos a domicilio',
        });
      }
      if (!addr.provinceCode?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address', 'provinceCode'],
          message: 'Provincia obligatoria en envíos a domicilio',
        });
      }
      if (!addr.postalCode?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shipping', 'address', 'postalCode'],
          message: 'CP obligatorio en envíos a domicilio',
        });
      }
    }
  });

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join('.') || '(payload)';
      return `  - ${field}: ${issue.message}`;
    })
    .join('\n');
}

export function newTestExtOrderId(): string {
  return `TEST-${Date.now()}`;
}

export function buildImportPayload(input: ImportInput): ImportPayload {
  const config = loadConfig();
  const weightG =
    input.weightG ??
    (input.weightKg !== undefined ? Math.round(input.weightKg * 1000) : config.testParcel.weightG);

  const provinceCode = input.province ? codigoProvincia(input.province) : null;
  const addressNull = input.deliveryType === 'S' && input.addressNullForSucursal !== false;

  const address =
    addressNull
      ? null
      : {
          streetName: (input.street ?? '').trim() || null,
          streetNumber: (input.streetNumber ?? '').trim() || null,
          floor: trunc3(input.floor) || null,
          apartment: trunc3(input.apartment) || null,
          city: (input.city ?? '').trim() || null,
          provinceCode,
          postalCode: (input.postalCode ?? '').trim() || null,
        };

  const payload: ImportPayload = {
    customerId: input.customerId,
    extOrderId: input.extOrderId ?? newTestExtOrderId(),
    orderNumber: input.orderNumber?.trim() || payloadOrderNumber(),
    sender: {
      name: null,
      phone: null,
      cellPhone: null,
      email: null,
      originAddress: {
        streetName: null,
        streetNumber: null,
        floor: null,
        apartment: null,
        city: null,
        provinceCode: null,
        postalCode: null,
      },
    },
    recipient: {
      name: input.recipientName.trim(),
      phone: (input.phone ?? '').trim(),
      cellPhone: (input.cellPhone ?? '').trim(),
      email: input.recipientEmail.trim(),
    },
    shipping: {
      deliveryType: input.deliveryType,
      productType: (input.productType ?? 'CP').trim() || 'CP',
      agency: input.deliveryType === 'S' ? (input.agency ?? '').trim() || null : null,
      address,
      weight: intField(weightG, 'weight', 1, 25_000),
      declaredValue: input.declaredValue ?? config.testParcel.declaredValue,
      height: intField(input.heightCm ?? config.testParcel.heightCm, 'height', 0, 255),
      length: intField(input.lengthCm ?? config.testParcel.lengthCm, 'length', 0, 255),
      width: intField(input.widthCm ?? config.testParcel.widthCm, 'width', 0, 255),
    },
  };

  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Payload inválido, no se llama a la API:\n${formatZodIssues(parsed.error)}`);
  }
  return parsed.data as ImportPayload;
}

function payloadOrderNumber(): string {
  return `TEST-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
}
