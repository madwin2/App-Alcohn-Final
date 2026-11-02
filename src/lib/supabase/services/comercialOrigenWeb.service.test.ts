import { describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({ supabase: {} }));

import { mapVentasOrigenWebRow } from './comercialOrigenWeb.service';

describe('mapVentasOrigenWebRow', () => {
  it('convierte los numéricos que Postgres devuelve como texto', () => {
    expect(
      mapVentasOrigenWebRow({
        mes: '2026-10-01',
        ventas_web_checkout: 20,
        ventas_whatsapp_desde_muestra_web: 28,
        ventas_whatsapp_resto: 131,
        ventas_originadas_web: 48,
        facturacion_originada_web: '4924550',
        facturacion_total: '20452850',
      })
    ).toEqual({
      mes: '2026-10-01',
      ventasWebCheckout: 20,
      ventasWhatsappDesdeMuestraWeb: 28,
      ventasWhatsappResto: 131,
      ventasOriginadasWeb: 48,
      facturacionOriginadaWeb: 4924550,
      facturacionTotal: 20452850,
    });
  });

  it('usa 0 cuando un valor viene nulo', () => {
    const row = mapVentasOrigenWebRow({ mes: '2026-11-01', facturacion_originada_web: null });
    expect(row.facturacionOriginadaWeb).toBe(0);
    expect(row.ventasWebCheckout).toBe(0);
  });
});
