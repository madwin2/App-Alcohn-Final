import { describe, expect, it } from 'vitest';
import {
  emptyBundle,
  emptyExtras,
  emptyFixed,
  mergeGastosMonthsForPersist,
} from '@/lib/gastos/monthlyEconomiaCosts';

describe('mergeGastosMonthsForPersist', () => {
  it('conserva meses solo en remoto', () => {
    const remote = {
      '2024-07': {
        ...emptyBundle(),
        fuente: 'resumen' as const,
        gastos_reales: 1_800_000,
        extras: { ...emptyExtras(), publicidad: 96_000 },
      },
    };
    const local = {
      '2025-09': {
        ...emptyBundle(),
        fuente: 'detalle' as const,
        fixed: { ...emptyFixed(), alquiler: 100 },
      },
    };
    const merged = mergeGastosMonthsForPersist(remote, local);
    expect(merged['2024-07']?.gastos_reales).toBe(1_800_000);
    expect(merged['2025-09']?.fixed.alquiler).toBe(100);
  });

  it('no pisa resumen remoto con mes local vacío', () => {
    const remote = {
      '2025-02': {
        ...emptyBundle(),
        fuente: 'resumen' as const,
        gastos_reales: 8_000_000,
        extras: { ...emptyExtras(), publicidad: 1_200_000, compra_dolares: 2_410_000 },
      },
    };
    const local = {
      '2025-02': emptyBundle(),
    };
    const merged = mergeGastosMonthsForPersist(remote, local);
    expect(merged['2025-02']?.fuente).toBe('resumen');
    expect(merged['2025-02']?.gastos_reales).toBe(8_000_000);
  });
});
