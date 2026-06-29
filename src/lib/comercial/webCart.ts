import type { Database } from '@/lib/supabase/types';

type MockupRow = Database['public']['Tables']['mockup_solicitudes']['Row'];
type SelloInsert = Database['public']['Tables']['sellos']['Insert'];

export type WebCartItem = {
  id?: string;
  qty?: number;
  price?: number;
  precio_transferencia_ars?: number;
  precio_link_ars?: number;
  title?: string;
  designSlug?: string;
  variantSize?: string;
  collection?: string;
  material?: string;
};

/** Mismo markup que la web: precio_link = redondear(precio_transferencia × 1.15) */
export const WEB_PRECIO_LINK_MARKUP = 1.15;

export const DEFAULT_WEB_SENIA = 20_000;

export function linkPriceToTransferencia(linkPrice: number): number {
  return Math.round(linkPrice / WEB_PRECIO_LINK_MARKUP);
}

export function resolveWebCartItemPrice(
  item: WebCartItem,
  metodoPago: string | null | undefined,
): number {
  const transferenciaExplicita =
    typeof item.precio_transferencia_ars === 'number' && Number.isFinite(item.precio_transferencia_ars)
      ? item.precio_transferencia_ars
      : null;

  const linkExplicito =
    typeof item.precio_link_ars === 'number' && Number.isFinite(item.precio_link_ars)
      ? item.precio_link_ars
      : null;

  const priceFallback =
    typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : null;

  if (metodoPago === 'Transferencia') {
    if (transferenciaExplicita != null) return transferenciaExplicita;
    if (linkExplicito != null) return linkPriceToTransferencia(linkExplicito);
    // En checkout por transferencia la web suele guardar `price` ya como precio transferencia.
    if (priceFallback != null && priceFallback > 0) return priceFallback;
    return 0;
  }

  if (linkExplicito != null) return linkExplicito;
  if (priceFallback != null && priceFallback > 0) return priceFallback;
  if (transferenciaExplicita != null) {
    return Math.round(transferenciaExplicita * WEB_PRECIO_LINK_MARKUP);
  }
  return 0;
}

function asCartItems(raw: unknown): WebCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is WebCartItem => item != null && typeof item === 'object');
}

export function parseVariantSizeCm(
  variantSize: string | null | undefined,
): { ancho: number; largo: number } | null {
  if (!variantSize?.trim()) return null;
  const normalized = variantSize.trim().replace(/,/g, '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
  if (!match) return null;

  let ancho = Number.parseFloat(match[1]);
  let largo = Number.parseFloat(match[2]);
  if (!Number.isFinite(ancho) || !Number.isFinite(largo)) return null;

  const unit = (match[3] ?? 'cm').toLowerCase();
  if (unit === 'mm') {
    ancho /= 10;
    largo /= 10;
  }

  return { ancho, largo };
}

function readEnvioCosto(notasWeb: Record<string, unknown> | null | undefined): number {
  if (!notasWeb || typeof notasWeb !== 'object') return 0;
  const envio = notasWeb.envio_costo;
  return typeof envio === 'number' && Number.isFinite(envio) ? envio : 0;
}

export function estimateWebOrdenTotal(params: {
  notasWeb?: Record<string, unknown> | null;
  carritoJson?: unknown;
  metodoPago?: string | null;
  /** En transferencia el envío se cobra aparte; en comercial mostramos solo sellos. */
  includeEnvio?: boolean;
}): number | null {
  const items = asCartItems(params.carritoJson);
  const envio = readEnvioCosto(params.notasWeb);
  const addEnvio = params.includeEnvio !== false && params.metodoPago !== 'Transferencia';

  if (items.length > 0) {
    let subtotal = 0;
    for (const item of items) {
      const qty = typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
      const unitPrice = resolveWebCartItemPrice(item, params.metodoPago);
      if (unitPrice <= 0) return null;
      subtotal += unitPrice * qty;
    }
    return subtotal + (addEnvio ? envio : 0);
  }

  if (!params.notasWeb || typeof params.notasWeb !== 'object') return null;
  const rawSubtotalTransferencia = params.notasWeb.subtotal_carrito_transferencia;
  const rawSubtotal = params.notasWeb.subtotal_carrito;
  let sub = 0;
  if (typeof rawSubtotalTransferencia === 'number' && Number.isFinite(rawSubtotalTransferencia)) {
    sub = rawSubtotalTransferencia;
  } else if (typeof rawSubtotal === 'number' && Number.isFinite(rawSubtotal)) {
    sub = rawSubtotal;
  }
  if (sub <= 0 && (!addEnvio || envio <= 0)) return null;
  return sub + (addEnvio ? envio : 0);
}

/** @deprecated Usar estimateWebOrdenTotal */
export function estimateOrdenTotalFromNotas(
  notasWeb: Record<string, unknown> | null | undefined,
): number | null {
  return estimateWebOrdenTotal({ notasWeb, metodoPago: null });
}

export function resolveWebOrderSenia(notasWeb: Record<string, unknown> | null | undefined): number {
  if (notasWeb && typeof notasWeb === 'object') {
    for (const key of ['senia_monto', 'monto_senia', 'senia_esperada'] as const) {
      const raw = notasWeb[key];
      if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
    }
  }
  return DEFAULT_WEB_SENIA;
}

function allocateSeniaAcrossItems(valores: number[], totalSenia: number): number[] {
  let remaining = totalSenia;
  return valores.map((valor) => {
    if (remaining <= 0) return 0;
    const assigned = Math.min(remaining, valor);
    remaining -= assigned;
    return assigned;
  });
}

function mockupDesignName(mockup: MockupRow | null): string | null {
  if (!mockup) return null;
  return mockup.nombre_muestra?.trim() || mockup.nombre_slug?.trim() || null;
}

function mockupBaseUrl(mockup: MockupRow | null): string | null {
  if (!mockup) return null;
  // En pedidos web guardamos el optimizado (el que se usó para el mockup), no el original.
  const url = mockup.imagen_optimizada_url || mockup.archivo_base_url || null;
  if (url) return url;
  const path = mockup.imagen_optimizada_path || mockup.archivo_base_path || null;
  return path?.trim() || null;
}

export function buildSellosFromWebCheckout(params: {
  ordenId: string;
  carritoJson: unknown;
  notasWeb?: Record<string, unknown> | null;
  metodoPago?: string | null;
  mockup?: MockupRow | null;
  mockupSolicitudId?: string | null;
  /** Monto de seña confirmado manualmente al validar transferencia. */
  seniaMonto?: number | null;
}): SelloInsert[] {
  const items = asCartItems(params.carritoJson);
  if (items.length === 0) {
    throw new Error('El pedido no tiene ítems en carrito_json. No se pueden crear sellos.');
  }

  const expanded: Array<{ item: WebCartItem; unitPrice: number }> = [];
  for (const item of items) {
    const qty = typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
    const unitPrice = resolveWebCartItemPrice(item, params.metodoPago);
    if (unitPrice <= 0) {
      throw new Error(`Ítem sin precio válido: ${item.title ?? item.id ?? 'sin nombre'}`);
    }
    for (let i = 0; i < qty; i += 1) {
      expanded.push({ item, unitPrice });
    }
  }

  const valores = expanded.map((e) => e.unitPrice);
  const totalSenia =
    typeof params.seniaMonto === 'number' && Number.isFinite(params.seniaMonto) && params.seniaMonto >= 0
      ? params.seniaMonto
      : resolveWebOrderSenia(params.notasWeb);
  const senias = allocateSeniaAcrossItems(valores, totalSenia);
  const mockupId = params.mockupSolicitudId ?? params.mockup?.id ?? null;
  const parsedFromMockup = Array.isArray(params.mockup?.medidas_cotizacion_json)
    ? (params.mockup!.medidas_cotizacion_json[0] as Record<string, unknown> | undefined)
    : null;

  return expanded.map(({ item, unitPrice }, index) => {
    const size =
      parseVariantSizeCm(item.variantSize) ??
      (parsedFromMockup
        ? parseVariantSizeCm(
            typeof parsedFromMockup.size === 'string'
              ? parsedFromMockup.size
              : typeof parsedFromMockup.variantSize === 'string'
                ? parsedFromMockup.variantSize
                : null,
          )
        : null);

    const designName =
      item.title?.trim() ||
      mockupDesignName(params.mockup ?? null) ||
      item.designSlug?.trim() ||
      'Sello web';

    return {
      orden_id: params.ordenId,
      item_type: 'SELLO',
      tipo: 'Clasico',
      diseno: designName,
      valor: unitPrice,
      senia: senias[index] ?? 0,
      estado_fabricacion: 'Sin Hacer',
      estado_venta: 'Señado',
      archivo_base: mockupBaseUrl(params.mockup ?? null),
      ancho_real: size?.ancho ?? null,
      largo_real: size?.largo ?? null,
      mockup_solicitud_id: mockupId,
      item_config: {
        origen: 'web',
        design_slug: item.designSlug ?? null,
        collection: item.collection ?? null,
        variant_size: item.variantSize ?? null,
        material_web: item.material ?? null,
        cart_item_id: item.id ?? null,
      },
      nota: null,
    };
  });
}
