import { z } from 'zod';
import { loadConfig } from '../config.js';
import type { CorreoOrderPayload, DeliveryType } from '../types.js';
import { codigoProvincia } from './provinces.js';

export const DELIVERY_TYPES = ['homeDelivery', 'agency', 'locker'] as const;

const integerString = (maxDigits: number, field: string) =>
  z
    .string()
    .regex(/^\d+$/, `${field} tiene que ser un entero (sin decimales ni comas)`)
    .refine((v) => v.length <= maxDigits, `${field} admite como máximo ${maxDigits} dígitos`);

const addressSchema = z.object({
  streetName: z.string(),
  streetNumber: z.string(),
  cityName: z.string(),
  floor: z.string(),
  department: z.string(),
  state: z
    .string()
    .length(1, 'address.state tiene que ser un código de 1 letra (ej. B)')
    .regex(/^[A-HJ-NP-Z]$/i, 'address.state inválido (no existen I, Ñ ni O)'),
  zipCode: z.string(),
});

const parcelSchema = z.object({
  dimensions: z.object({
    height: integerString(3, 'dimensions.height'),
    width: integerString(3, 'dimensions.width'),
    depth: integerString(3, 'dimensions.depth'),
  }),
  productWeight: integerString(5, 'productWeight'),
  productCategory: z.string(),
  declaredValue: integerString(12, 'declaredValue'),
});

export const correoOrderPayloadSchema = z
  .object({
    sellerId: z.string().min(1),
    trackingNumber: z.string().max(30),
    order: z.object({
      senderData: z.object({
        businessName: z.string().min(1, 'Falta el nombre del remitente (CORREO_SENDER_NAME)'),
        areaCodePhone: z.string(),
        phoneNumber: z.string(),
        areaCodeCellphone: z.string(),
        cellphoneNumber: z.string(),
        email: z.string(),
        observation: z.string(),
        address: addressSchema.extend({
          streetName: z.string().min(1, 'Falta CORREO_SENDER_STREET'),
          streetNumber: z.string().min(1, 'Falta CORREO_SENDER_NUMBER'),
          cityName: z.string().min(1, 'Falta CORREO_SENDER_CITY'),
          zipCode: z.string().min(1, 'Falta CORREO_SENDER_ZIP'),
        }),
      }),
      shippingData: z.object({
        name: z.string().min(1, 'Falta el nombre del destinatario'),
        areaCodePhone: z.string(),
        phoneNumber: z.string(),
        areaCodeCellphone: z.string(),
        cellphoneNumber: z.string(),
        email: z.string(),
        observation: z.string(),
        address: addressSchema,
      }),
      parcels: z
        .array(parcelSchema)
        .min(1, 'Hace falta exactamente 1 bulto')
        .superRefine((parcels, ctx) => {
          if (parcels.length > 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `parcels trae ${parcels.length} elementos; Correo solo procesa el primero. Recortá a 1 bulto.`,
            });
          }
        }),
      deliveryType: z.enum(DELIVERY_TYPES),
      agencyId: z.string(),
      saleDate: z
        .string()
        .regex(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/,
          'saleDate tiene que ser YYYY-MM-DDTHH:mm:ss-03:00',
        ),
      serviceType: z.string().min(1).max(2, 'serviceType admite como máximo 2 letras'),
      shipmentClientId: z.string(),
    }),
  })
  .superRefine((payload, ctx) => {
    const { deliveryType, agencyId, shippingData } = payload.order;
    if (deliveryType === 'homeDelivery') {
      if (agencyId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order', 'agencyId'],
          message: 'agencyId tiene que ir vacío cuando deliveryType es homeDelivery',
        });
      }
      const addr = shippingData.address;
      if (!addr.streetName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order', 'shippingData', 'address', 'streetName'],
          message: 'Calle obligatoria en envíos a domicilio',
        });
      }
      if (!addr.streetNumber.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order', 'shippingData', 'address', 'streetNumber'],
          message: 'Altura obligatoria en envíos a domicilio',
        });
      }
      if (!addr.cityName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order', 'shippingData', 'address', 'cityName'],
          message: 'Localidad obligatoria en envíos a domicilio',
        });
      }
      if (!addr.zipCode.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['order', 'shippingData', 'address', 'zipCode'],
          message: 'Código postal obligatorio en envíos a domicilio',
        });
      }
    } else if (!agencyId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['order', 'agencyId'],
        message: `agencyId es obligatorio cuando deliveryType es ${deliveryType}`,
      });
    }
  });

export type OrderInput = {
  deliveryType: DeliveryType;
  agencyId?: string;
  recipientName: string;
  street?: string;
  streetNumber?: string;
  city?: string;
  state?: string;
  zip?: string;
  floor?: string;
  department?: string;
  email?: string;
  phoneArea?: string;
  phone?: string;
  cellphoneArea?: string;
  cellphone?: string;
  observation?: string;
  /** Peso en gramos. Si no se pasa, usa CORREO_TEST_WEIGHT_G. */
  weightG?: number;
  /** Peso en kilos. Se convierte a gramos (redondeo al entero más cercano). */
  weightKg?: number;
  heightCm?: number;
  widthCm?: number;
  depthCm?: number;
  declaredValue?: number;
  productCategory?: string;
  saleDate?: Date;
  shipmentClientId?: string;
  trackingNumber?: string;
};

function formatSaleDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}-03:00`;
}

function intAsString(value: number, field: string, maxDigits: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} tiene que ser un entero positivo (recibí ${value}).`);
  }
  const text = String(value);
  if (text.length > maxDigits) {
    throw new Error(`${field}=${value} supera el máximo de ${maxDigits} dígitos.`);
  }
  return text;
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join('.') || '(payload)';
      return `  - ${field}: ${issue.message}`;
    })
    .join('\n');
}

/**
 * Convierte un objeto de negocio a payload de `/v1/orders`.
 * Todos los números salen como string. Valida con zod antes de devolver.
 */
export function buildOrderPayload(input: OrderInput): CorreoOrderPayload {
  const config = loadConfig();
  const weightG =
    input.weightG ??
    (input.weightKg !== undefined ? Math.round(input.weightKg * 1000) : config.testParcel.weightG);

  if (input.deliveryType === 'homeDelivery' && !input.state?.trim()) {
    throw new Error('Falta la provincia del destinatario (--provincia, código de 1 letra, ej. B).');
  }

  const recipientState = input.state?.trim()
    ? codigoProvincia(input.state)
    : codigoProvincia(config.sender.state || 'B');

  const senderState = codigoProvincia(config.sender.state || recipientState);

  const payload: CorreoOrderPayload = {
    sellerId: config.agreement,
    trackingNumber: input.trackingNumber ?? '',
    order: {
      senderData: {
        businessName: config.sender.businessName,
        areaCodePhone: config.sender.areaCodePhone,
        phoneNumber: config.sender.phoneNumber,
        areaCodeCellphone: config.sender.areaCodeCellphone,
        cellphoneNumber: config.sender.cellphoneNumber,
        email: config.sender.email,
        observation: '',
        address: {
          streetName: config.sender.streetName,
          streetNumber: config.sender.streetNumber,
          cityName: config.sender.cityName,
          floor: config.sender.floor,
          department: config.sender.department,
          state: senderState,
          zipCode: config.sender.zipCode,
        },
      },
      shippingData: {
        name: input.recipientName.trim(),
        areaCodePhone: (input.phoneArea ?? '').trim(),
        phoneNumber: (input.phone ?? '').trim(),
        areaCodeCellphone: (input.cellphoneArea ?? '').trim(),
        cellphoneNumber: (input.cellphone ?? '').trim(),
        email: (input.email ?? '').trim(),
        observation: (input.observation ?? '').trim(),
        address: {
          streetName: (input.street ?? '').trim(),
          streetNumber: (input.streetNumber ?? '').trim(),
          cityName: (input.city ?? '').trim(),
          floor: (input.floor ?? '').trim(),
          department: (input.department ?? '').trim(),
          state: recipientState,
          zipCode: (input.zip ?? '').trim(),
        },
      },
      parcels: [
        {
          dimensions: {
            height: intAsString(input.heightCm ?? config.testParcel.heightCm, 'height', 3),
            width: intAsString(input.widthCm ?? config.testParcel.widthCm, 'width', 3),
            depth: intAsString(input.depthCm ?? config.testParcel.depthCm, 'depth', 3),
          },
          productWeight: intAsString(weightG, 'productWeight', 5),
          productCategory: (input.productCategory ?? 'Sellos').trim() || 'Sellos',
          declaredValue: intAsString(
            input.declaredValue ?? config.testParcel.declaredValue,
            'declaredValue',
            12,
          ),
        },
      ],
      deliveryType: input.deliveryType,
      agencyId: input.deliveryType === 'homeDelivery' ? '' : (input.agencyId ?? '').trim(),
      saleDate: formatSaleDate(input.saleDate),
      serviceType: config.serviceType,
      shipmentClientId: input.shipmentClientId ?? '',
    },
  };

  const parsed = correoOrderPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Payload inválido, no se llama a la API:\n${formatZodIssues(parsed.error)}`);
  }

  return parsed.data as CorreoOrderPayload;
}
