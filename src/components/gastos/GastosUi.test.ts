import { describe, expect, it } from 'vitest';
import { parseMonto } from './GastosUi';

describe('parseMonto', () => {
  it.each([
    ['1500000', 1_500_000],
    ['1.500.000', 1_500_000],
    ['1.500', 1_500],
    ['1.500,50', 1500.5],
    ['1500,5', 1500.5],
    ['1500.5', 1500.5],
    ['0,8', 0.8],
    ['0.8', 0.8],
    ['$ 2.000', 2_000],
    ['', 0],
  ])('%s → %d', (txt, n) => {
    expect(parseMonto(txt)).toBe(n);
  });
});
