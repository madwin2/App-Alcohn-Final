import { describe, expect, it } from 'vitest';
import {
  emptyBundle,
  emptyExtras,
  emptyFixed,
  gastosOperativosParaEconomia,
  isResumenMensual,
  monthHasDetailedFixedCosts,
  normalizeMonthsFromUnknown,
} from '@/lib/gastos/monthlyEconomiaCosts';

describe('resumen mensual (Excel histórico)', () => {
  it('detecta resumen solo con fuente + gastos_reales > 0', () => {
    expect(isResumenMensual(undefined)).toBe(false);
    expect(isResumenMensual(emptyBundle())).toBe(false);
    expect(isResumenMensual({ ...emptyBundle(), fuente: 'resumen' })).toBe(false);
    expect(
      isResumenMensual({ ...emptyBundle(), fuente: 'resumen', gastos_reales: 7_500_000 }),
    ).toBe(true);
  });

  it('gastosOperativos usa gastos_reales en resumen y no suma fabricación', () => {
    const bundle = {
      fixed: emptyFixed(),
      extras: { ...emptyExtras(), publicidad: 1_050_000, compra_dolares: 1_419_000 },
      fuente: 'resumen' as const,
      gastos_reales: 7_500_000,
    };
    expect(gastosOperativosParaEconomia(bundle, 5_000_000)).toBe(7_500_000);
  });

  it('gastosOperativos en detalle suma fijos + ventas + extras + pub + envíos', () => {
    const bundle = {
      fixed: { ...emptyFixed(), alquiler: 100_000 },
      extras: {
        ...emptyExtras(),
        publicidad: 50_000,
        envios: 20_000,
        gastos_varios: 30_000,
      },
    };
    // fijos 100k + ventas 200k + extras 30k + pub 50k + envíos 20k
    expect(gastosOperativosParaEconomia(bundle, 200_000)).toBe(400_000);
  });

  it('monthHasDetailedFixedCosts protege meses con sueldos o fuente=detalle', () => {
    expect(monthHasDetailedFixedCosts(undefined)).toBe(false);
    expect(
      monthHasDetailedFixedCosts({
        ...emptyBundle(),
        fuente: 'resumen',
        gastos_reales: 1,
        fixed: { ...emptyFixed(), sueldos: [{ id: '1', nombre: 'X', monto: 100 }] },
      }),
    ).toBe(false);
    expect(
      monthHasDetailedFixedCosts({
        ...emptyBundle(),
        fuente: 'detalle',
      }),
    ).toBe(true);
    expect(
      monthHasDetailedFixedCosts({
        ...emptyBundle(),
        fixed: { ...emptyFixed(), alquiler: 50_000 },
      }),
    ).toBe(true);
  });

  it('normaliza fuente y gastos_reales desde JSON', () => {
    const months = normalizeMonthsFromUnknown({
      '2025-01': {
        fixed: emptyFixed(),
        extras: emptyExtras(),
        fuente: 'resumen',
        gastos_reales: 7_500_000,
      },
    });
    expect(months['2025-01'].fuente).toBe('resumen');
    expect(months['2025-01'].gastos_reales).toBe(7_500_000);
  });
});
